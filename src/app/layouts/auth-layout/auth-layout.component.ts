// layouts/auth-layout/auth-layout.component.ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'bc-auth-layout',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="auth-shell">
      <div class="auth-shell__brand">
        <div class="auth-shell__logo-icon">G</div>
        <span class="auth-shell__logo-text">GO MEDICAL</span>
      </div>
      <router-outlet></router-outlet>
      <footer class="auth-shell__footer">
        <p>© {{ year }} Go Medical — Plataforma Administrativa</p>
      </footer>
    </div>
  `,
  styleUrl: './auth-layout.component.css'
})
export class AuthLayoutComponent {
  readonly year = new Date().getFullYear();
}

