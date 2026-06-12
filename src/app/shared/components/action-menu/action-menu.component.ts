import { NgIf } from '@angular/common';
import { Component, ElementRef, HostListener, Input, inject, signal } from '@angular/core';

@Component({
  selector: 'bc-action-menu',
  standalone: true,
  imports: [NgIf],
  template: `
    <div class="action-menu">
      <button
        type="button"
        class="action-menu__trigger"
        [class.action-menu__trigger--text]="!iconOnly"
        [attr.aria-expanded]="isOpen()"
        [attr.aria-label]="label + ' acciones'"
        (click)="toggle()">
        <svg *ngIf="iconOnly" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <ng-container *ngIf="!iconOnly">
          <span>{{ label }}</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </ng-container>
      </button>

      <div *ngIf="isOpen()" class="action-menu__panel" role="menu" (click)="close()">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: inline-flex;
      justify-content: center;
      position: relative;
    }

    .action-menu {
      position: relative;
      display: inline-flex;
      justify-content: center;
    }

    .action-menu__trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 1px solid rgba(44, 105, 117, 0.24);
      border-radius: 50%;
      background: #fff;
      color: #1d4c55;
      font: inherit;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      transition: background 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
      white-space: nowrap;
    }

    .action-menu__trigger--text {
      width: auto;
      min-width: 118px;
      padding: 0 12px;
      border-radius: 8px;
      gap: 8px;
      justify-content: space-between;
    }

    .action-menu__trigger:hover,
    .action-menu__trigger[aria-expanded="true"] {
      background: #e8f7f4;
      border-color: rgba(0, 133, 126, 0.42);
      color: #00796f;
      box-shadow: 0 8px 18px rgba(29, 76, 85, 0.12);
    }

    .action-menu__panel {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 80;
      min-width: 178px;
      padding: 6px;
      border: 1px solid rgba(44, 105, 117, 0.16);
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
      text-align: left;
    }

    :host ::ng-deep .action-menu__item {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      padding: 8px 10px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #1f2f36;
      font: inherit;
      font-size: 0.84rem;
      font-weight: 600;
      text-decoration: none;
      text-align: left;
      cursor: pointer;
      white-space: nowrap;
    }

    :host ::ng-deep .action-menu__item:hover:not(:disabled) {
      background: #edf8f6;
      color: #00796f;
    }

    :host ::ng-deep .action-menu__item--danger {
      color: #b91c1c;
    }

    :host ::ng-deep .action-menu__item--danger:hover:not(:disabled) {
      background: #fef2f2;
      color: #991b1b;
    }

    :host ::ng-deep .action-menu__item:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    :host ::ng-deep .action-menu__divider {
      display: block;
      height: 1px;
      margin: 5px 4px;
      background: rgba(44, 105, 117, 0.12);
    }
  `],
})
export class ActionMenuComponent {
  @Input() label = 'Más';
  @Input() iconOnly = true;

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  readonly isOpen = signal(false);

  toggle(): void {
    this.isOpen.update(value => !value);
  }

  close(): void {
    this.isOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}
