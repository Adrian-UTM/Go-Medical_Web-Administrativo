import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, from, throwError, of } from 'rxjs';
import { map, switchMap, catchError, tap } from 'rxjs/operators';
import { AuthSession, LoginCredentials, User, UserRole } from '../../models/auth.model';
import { SupabaseService } from './supabase.service';

export interface RegisterCredentials extends LoginCredentials {
  full_name: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _session = signal<AuthSession | null>(null);

  readonly session = this._session.asReadonly();

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
    this.initSession();
    this.onAuthStateChange();
  }

  private async initSession() {
    const { data: { session }, error } = await this.supabase.client.auth.getSession();
    if (session && !error) {
      await this.loadUserProfile(session);
    }
  }

  onAuthStateChange() {
    this.supabase.client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await this.loadUserProfile(session);
      } else if (event === 'SIGNED_OUT') {
        this._session.set(null);
        this.router.navigate(['/login']);
      }
    });
  }

  private async loadUserProfile(supabaseSession: any): Promise<void> {
    const userId = supabaseSession.user.id;
    const { data: profile, error } = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      this._session.set(null);
      await this.supabase.client.auth.signOut();
      return;
    }

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

    const session: AuthSession = {
      user,
      access_token: supabaseSession.access_token,
      refresh_token: supabaseSession.refresh_token,
      expires_at: supabaseSession.expires_at ? supabaseSession.expires_at * 1000 : Date.now() + 3600 * 1000
    };

    this._session.set(session);
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
        
        // Fetch profile to validate role and is_active
        return from(this.supabase.client
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single()
        ).pipe(
          switchMap(({ data: profile, error: profileError }) => {
            if (profileError || !profile) {
              this.supabase.client.auth.signOut();
              return throwError(() => new Error('Perfil no encontrado. Contacte al administrador.'));
            }

            if (!profile.is_active) {
              this.supabase.client.auth.signOut();
              return throwError(() => new Error('Tu cuenta está pendiente de aprobación por un administrador.'));
            }

            const allowedRoles = [UserRole.Admin, UserRole.Manager, UserRole.Tech]; // manager=staff, tech=technician as per our model
            // Allow string checking as well to be safe
            const allowedStringRoles = ['admin', 'staff', 'technician', 'manager', 'tech'];
            if (!allowedStringRoles.includes(profile.role)) {
               this.supabase.client.auth.signOut();
               return throwError(() => new Error('No tienes permisos para acceder a este panel.'));
            }

            const user: User = {
              id: profile.id,
              email: profile.email || data.user.email,
              full_name: profile.full_name,
              role: profile.role as UserRole,
              avatar_url: profile.avatar_url,
              is_active: profile.is_active,
              created_at: profile.created_at,
              updated_at: profile.updated_at
            };

            const session: AuthSession = {
              user,
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_at: data.session.expires_at ? data.session.expires_at * 1000 : Date.now() + 3600 * 1000
            };

            this._session.set(session);
            return of(session);
          })
        );
      })
    );
  }

  register(credentials: RegisterCredentials): Observable<any> {
    // We pass full_name in the metadata, in case a trigger uses it to create the profile
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
        // Do not return a session, just data, user needs approval
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
    await this.supabase.client.auth.signOut();
    this._session.set(null);
    this.router.navigate(['/login']);
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  async getSession(): Promise<any> {
    const { data, error } = await this.supabase.client.auth.getSession();
    if (error) throw error;
    return data.session;
  }
}
