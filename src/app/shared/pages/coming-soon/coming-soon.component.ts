// shared/pages/coming-soon/coming-soon.component.ts
// Placeholder para módulos aún no implementados
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'bc-coming-soon',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="coming-soon">
      <div class="coming-soon__icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
      <h1 class="coming-soon__title">{{ moduleName }}</h1>
      <p class="coming-soon__text">
        Este módulo está en desarrollo y estará disponible próximamente.
      </p>
      <a routerLink="/dashboard" class="btn-ghost">← Volver al Dashboard</a>
    </div>
  `,
  styles: [`
    .coming-soon {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-16) var(--space-8);
      text-align: center;
      gap: var(--space-4);
    }
    .coming-soon__icon { color: var(--color-gray-300); }
    .coming-soon__title { font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-text-secondary); }
    .coming-soon__text { font-size: var(--font-size-sm); color: var(--color-text-muted); max-width: 360px; }
    .btn-ghost {
      display: inline-flex; align-items: center; gap: var(--space-2);
      padding: var(--space-2) var(--space-5); background: none;
      border: 1px solid var(--color-border-input); border-radius: var(--radius-md);
      font-size: var(--font-size-sm); color: var(--color-text-secondary);
      cursor: pointer; text-decoration: none; margin-top: var(--space-2);
      transition: background-color 150ms ease;
    }
    .btn-ghost:hover { background-color: var(--color-bg-hover); }
  `]
})
export class ComingSoonComponent {
  private route = inject(ActivatedRoute);
  get moduleName(): string {
    return this.route.snapshot.data['moduleName'] ?? 'Módulo en desarrollo';
  }
}
