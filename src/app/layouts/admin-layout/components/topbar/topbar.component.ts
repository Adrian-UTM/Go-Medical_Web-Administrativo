// layouts/admin-layout/components/topbar/topbar.component.ts
import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'bc-topbar',
  standalone: true,
  imports: [NgIf],
  template: `
    <header class="topbar" role="banner">
      <!-- Menu toggle (mobile / collapse) -->
      <button
        class="topbar__menu-btn"
        (click)="menuToggle.emit()"
        aria-label="Toggle menú lateral">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      <!-- Spacer -->
      <div class="topbar__spacer"></div>

      <!-- Right actions -->
      <div class="topbar__actions">
        <!-- Notificaciones (placeholder) -->
        <button class="topbar__icon-btn" aria-label="Notificaciones" title="Notificaciones">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </button>

        <!-- Divider -->
        <div class="topbar__divider" aria-hidden="true"></div>

        <!-- User avatar + info -->
        <div class="topbar__user" *ngIf="auth.currentUser">
          <div class="topbar__user-avatar" aria-hidden="true">
            {{ getUserInitials() }}
          </div>
          <div class="topbar__user-info">
            <span class="topbar__user-name">{{ auth.currentUser.full_name }}</span>
            <span class="topbar__user-role">{{ getRoleLabel() }}</span>
          </div>
          <button class="topbar__icon-btn topbar__logout" (click)="auth.signOut()" aria-label="Cerrar sesión" title="Cerrar sesión">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </header>
  `,
  styleUrl: './topbar.component.css'
})
export class TopbarComponent {
  @Input() sidebarCollapsed = false;
  @Output() menuToggle = new EventEmitter<void>();

  readonly auth = inject(AuthService);

  getUserInitials(): string {
    const name = this.auth.currentUser?.full_name ?? '';
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  }

  getRoleLabel(): string {
    const roleLabels: Record<string, string> = {
      admin: 'Administrador',
      manager: 'Gerente',
      sales: 'Ventas',
      tech: 'Técnico',
      viewer: 'Solo lectura',
    };
    return roleLabels[this.auth.currentUser?.role ?? ''] ?? '';
  }
}
