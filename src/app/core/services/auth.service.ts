import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, from, throwError, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AuthSession, LoginCredentials, User, UserRole } from '../../models/auth.model';
import { SupabaseService } from './supabase.service';

export interface RegisterCredentials extends LoginCredentials {
  full_name: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {

  private _session = signal<AuthSession | null>(null);
  private _isSessionReady = signal(false);
  private readonly sessionReadyPromise: Promise<void>;

  readonly session = this._session.asReadonly();
  readonly isSessionReady = this._isSessionReady.asReadonly();

  get currentUser(): User | null {
    return this._session()?.user ?? null;
  }

  get isAuthenticated(): boolean {
    return this._session() !== null;
  }

  constructor(
    private router: Router,
    private supabase: SupabaseService
  ) {
    // Escuchar cambios de estado maneja INITIAL_SESSION automáticamente
    let resolveSessionReady!: () => void;
    this.sessionReadyPromise = new Promise(resolve => {
      resolveSessionReady = resolve;
    });

    this.supabase.client.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        void this.applyAuthState(event, session, resolveSessionReady);
      }, 0);
    });
  }

  private async applyAuthState(event: string, session: any, resolveSessionReady: () => void): Promise<void> {
    try {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') && session) {
        this._session.set(this.buildBasicSession(session));
        return;
      }

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
        this._session.set(null);
        if (event === 'SIGNED_OUT') {
          void this.redirectToLogin();
        }
      }
    } catch (error) {
      console.error('[Auth] No fue posible sincronizar la sesión administrativa', error);
      this._session.set(null);
    } finally {
      this._isSessionReady.set(true);
      resolveSessionReady();
    }
  }

  private buildBasicSession(supabaseSession: any): AuthSession {
    const user: User = {
      id: supabaseSession.user.id,
      email: supabaseSession.user.email,
      full_name: supabaseSession.user.user_metadata?.full_name ?? '',
      role: (supabaseSession.user.user_metadata?.role ?? 'admin') as UserRole,
      avatar_url: supabaseSession.user.user_metadata?.avatar_url,
      is_active: true,
      created_at: supabaseSession.user.created_at,
      updated_at: supabaseSession.user.updated_at
    };

    return {
      user,
      access_token: supabaseSession.access_token,
      refresh_token: supabaseSession.refresh_token,
      expires_at: supabaseSession.expires_at ? supabaseSession.expires_at * 1000 : Date.now() + 3600 * 1000
    };
  }

  async validateAdminAccessAsync(): Promise<boolean> {
    const { data: { session } } = await this.supabase.client.auth.getSession();
    if (!session) return false;

    const profile = await this.fetchProfileForSession(session);
    if (!profile || !this.canAccessAdminPanel(profile)) {
      return false;
    }

    this._session.set(this.buildSessionFromProfile(session, profile));
    return true;
  }

  private async loadUserProfile(supabaseSession: any): Promise<void> {
    const profile = await this.fetchProfileForSession(supabaseSession);

    if (!profile || !this.canAccessAdminPanel(profile)) {
      this._session.set(null);
      await this.supabase.client.auth.signOut();
      return;
    }

    this._session.set(this.buildSessionFromProfile(supabaseSession, profile));
  }

  signIn(credentials: LoginCredentials): Observable<AuthSession> {
    return from(this.supabase.client.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password
    })).pipe(
      switchMap(({ data, error }) => {
        if (error) {
          return throwError(() => new Error(error.message));
        }
        if (!data.session) {
          return throwError(() => new Error('Error al obtener la sesión'));
        }

        return from(this.fetchProfileForSession(data.session)).pipe(
          switchMap((profile) => {
            if (!profile) {
              this.supabase.client.auth.signOut();
              return throwError(() => new Error('No se encontró un perfil administrativo para esta cuenta.'));
            }

            if (!profile.is_active) {
              this.supabase.client.auth.signOut();
              return throwError(() => new Error('Tu cuenta está pendiente de aprobación por un administrador.'));
            }

            if (!this.hasAllowedRole(profile.role)) {
              this.supabase.client.auth.signOut();
              return throwError(() => new Error('No tienes permisos para acceder a este panel.'));
            }

            const session = this.buildSessionFromProfile(data.session, profile);
            this._session.set(session);
            this._isSessionReady.set(true);
            return of(session);
          })
        );
      })
    );
  }

  private async fetchProfileForSession(supabaseSession: any): Promise<any | null> {
    const userId = supabaseSession.user.id;
    const email = String(supabaseSession.user.email ?? '').trim();

    const byId = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!byId.error && byId.data) {
      return byId.data;
    }

    if (!email) {
      return null;
    }

    const byEmail = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (!byEmail.error && byEmail.data) {
      return byEmail.data;
    }

    return null;
  }

  private buildSessionFromProfile(supabaseSession: any, profile: any): AuthSession {
    const user: User = {
      id: profile.id,
      email: profile.email || supabaseSession.user.email,
      full_name: profile.full_name,
      role: profile.role as UserRole,
      avatar_url: profile.avatar_url,
      is_active: profile.is_active,
      created_at: profile.created_at,
      updated_at: profile.updated_at
    };

    return {
      user,
      access_token: supabaseSession.access_token,
      refresh_token: supabaseSession.refresh_token,
      expires_at: supabaseSession.expires_at ? supabaseSession.expires_at * 1000 : Date.now() + 3600 * 1000
    };
  }

  private canAccessAdminPanel(profile: any): boolean {
    return !!profile?.is_active && this.hasAllowedRole(profile.role);
  }

  private hasAllowedRole(role: unknown): boolean {
    const allowedStringRoles = ['admin', 'staff', 'technician', 'manager', 'tech'];
    return allowedStringRoles.includes(String(role ?? '').trim().toLowerCase());
  }

  register(credentials: RegisterCredentials): Observable<any> {
    return from(this.supabase.client.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: {
          full_name: credentials.full_name
        }
      }
    })).pipe(
      map(({ data, error }) => {
        if (error) {
          throw new Error(error.message);
        }
        return data;
      })
    );
  }

  recoverPassword(email: string): Observable<string> {
    return from(this.supabase.client.auth.resetPasswordForEmail(email)).pipe(
      map(({ error }) => {
        if (error) {
          throw new Error(error.message);
        }
        return 'Se ha enviado la recuperación de contraseña al correo registrado.';
      })
    );
  }

  async signOut(): Promise<void> {
    try {
      await this.supabase.client.auth.signOut();
    } finally {
      this._session.set(null);
      this._isSessionReady.set(true);
      await this.redirectToLogin();
    }
  }

  currentUserId(): string | null {
    return this.currentUser?.id ?? null;
  }

  async ensureSessionReady(): Promise<void> {
    await this.sessionReadyPromise.catch(() => undefined);
  }



  private async redirectToLogin(): Promise<void> {
    if (this.router.url === '/login') {
      return;
    }

    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }


}



