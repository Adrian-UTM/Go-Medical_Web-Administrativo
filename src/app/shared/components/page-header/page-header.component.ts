// shared/components/page-header/page-header.component.ts
import { Component, Input } from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { RouterLink } from '@angular/router';

export interface BreadcrumbItem {
  label: string;
  routerLink?: string;
}

@Component({
  selector: 'bc-page-header',
  standalone: true,
  imports: [NgIf, NgFor, RouterLink],
  template: `
    <div class="page-header">
      <div class="page-header__left">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <ol class="breadcrumb__list">
            <li *ngFor="let item of breadcrumbs; let last = last"
                class="breadcrumb__item"
                [class.breadcrumb__item--active]="last">
              <a *ngIf="!last && item.routerLink"
                 [routerLink]="item.routerLink"
                 class="breadcrumb__link">{{ item.label }}</a>
              <span *ngIf="last || !item.routerLink">{{ item.label }}</span>
              <span *ngIf="!last" class="breadcrumb__sep" aria-hidden="true">/</span>
            </li>
          </ol>
        </nav>
        <h1 class="page-header__title">{{ title }}</h1>
        <p *ngIf="subtitle" class="page-header__subtitle">{{ subtitle }}</p>
      </div>
      <div class="page-header__actions">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styleUrl: './page-header.component.css'
})
export class PageHeaderComponent {
  @Input({ required: true }) title = '';
  @Input() subtitle = '';
  @Input() breadcrumbs: BreadcrumbItem[] = [];
}
