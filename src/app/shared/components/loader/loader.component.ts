// shared/components/loader/loader.component.ts
import { Component, Input } from '@angular/core';
import { NgIf } from '@angular/common';

@Component({
  selector: 'bc-loader',
  standalone: true,
  imports: [NgIf],
  template: `
    <div class="loader" [class.loader--overlay]="overlay" [class.loader--inline]="!overlay">
      <div class="loader__spinner"></div>
      <p *ngIf="message" class="loader__message">{{ message }}</p>
    </div>
  `,
  styleUrl: './loader.component.css'
})
export class LoaderComponent {
  @Input() message = '';
  @Input() overlay = false;
}
