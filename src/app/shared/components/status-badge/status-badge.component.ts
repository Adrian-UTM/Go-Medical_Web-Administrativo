// shared/components/status-badge/status-badge.component.ts
import { Component, Input } from '@angular/core';
import { NgIf } from '@angular/common';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

@Component({
  selector: 'bc-status-badge',
  standalone: true,
  imports: [NgIf],
  template: `
    <span class="status-badge status-badge--{{ variant }}"
          [class.status-badge--sm]="size === 'sm'">
      <span *ngIf="showDot" class="status-badge__dot"></span>
      {{ label }}
    </span>
  `,
  styleUrl: './status-badge.component.css'
})
export class StatusBadgeComponent {
  @Input({ required: true }) label = '';
  @Input() variant: BadgeVariant = 'neutral';
  @Input() size: 'sm' | 'md' = 'md';
  @Input() showDot = false;
}
