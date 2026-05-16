import { Component, Input } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { OrderStatus, OrderStatusSummaryRow } from '../../../../models/order.model';

@Component({
  selector: 'bc-order-status-summary',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, StatusBadgeComponent],
  template: `
    <section class="summary-card">
      <div class="summary-card__header">
        <div>
          <h2 class="summary-card__title">Resumen por estado</h2>
          <p class="summary-card__subtitle">Distribucion operativa y financiera de los pedidos en el periodo.</p>
        </div>
      </div>

      <div class="summary-table-wrapper">
        <table class="summary-table" aria-label="Resumen por estado de pedidos">
          <thead>
            <tr>
              <th scope="col">Estado</th>
              <th scope="col" class="text-center">Pedidos</th>
              <th scope="col" class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of rows" class="summary-table__row">
              <td>
                <bc-status-badge
                  [label]="row.label"
                  [variant]="getStatusVariant(row.status)"
                  [showDot]="true">
                </bc-status-badge>
              </td>
              <td class="text-center">{{ row.count }}</td>
              <td class="text-right">{{ row.total | currency:'MXN':'symbol-narrow':'1.0-0' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
  styleUrl: './order-status-summary.component.css',
})
export class OrderStatusSummaryComponent {
  @Input({ required: true }) rows: OrderStatusSummaryRow[] = [];

  getStatusVariant(status: OrderStatus): BadgeVariant {
    const map: Record<OrderStatus, BadgeVariant> = {
      [OrderStatus.Draft]: 'neutral',
      [OrderStatus.PendingReview]: 'warning',
      [OrderStatus.PendingPayment]: 'warning',
      [OrderStatus.Paid]: 'success',
      [OrderStatus.Processing]: 'info',
      [OrderStatus.Shipped]: 'primary',
      [OrderStatus.Delivered]: 'success',
      [OrderStatus.Canceled]: 'danger',
    };

    return map[status] ?? 'neutral';
  }
}
