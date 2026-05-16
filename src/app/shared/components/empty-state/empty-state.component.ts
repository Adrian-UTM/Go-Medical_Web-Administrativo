// shared/components/empty-state/empty-state.component.ts
import { Component, Input } from '@angular/core';
import { NgIf } from '@angular/common';

@Component({
  selector: 'bc-empty-state',
  standalone: true,
  imports: [NgIf],
  template: `
    <div class="empty-state">
      <div class="empty-state__icon" aria-hidden="true">
        <svg *ngIf="!icon" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span *ngIf="icon" class="empty-state__custom-icon">{{ icon }}</span>
      </div>
      <h3 class="empty-state__title">{{ title }}</h3>
      <p *ngIf="description" class="empty-state__description">{{ description }}</p>
      <div *ngIf="hasAction" class="empty-state__action">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styleUrl: './empty-state.component.css'
})
export class EmptyStateComponent {
  @Input({ required: true }) title = 'Sin resultados';
  @Input() description = '';
  @Input() icon = '';
  @Input() hasAction = false;
}
