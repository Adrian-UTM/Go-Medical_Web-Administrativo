import { Component, Input } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { OrderStatsKpis } from '../../../../models/order.model';

@Component({
  selector: 'bc-order-kpi-cards',
  standalone: true,
  imports: [CommonModule, CurrencyPipe],
  template: `
    <div class="kpi-grid" *ngIf="kpis">
      <article class="kpi-card kpi-card--primary">
        <div class="kpi-card__icon kpi-card__icon--orders">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        </div>
        <div class="kpi-card__body">
          <span class="kpi-card__label">Total de pedidos</span>
          <span class="kpi-card__value">{{ kpis.totalOrders }}</span>
          <span class="kpi-card__sub">Pedidos en el periodo filtrado</span>
        </div>
      </article>

      <article class="kpi-card kpi-card--success">
        <div class="kpi-card__icon kpi-card__icon--revenue">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </div>
        <div class="kpi-card__body">
          <span class="kpi-card__label">Total estimado vendido</span>
          <span class="kpi-card__value">{{ kpis.totalRevenue | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
          <span class="kpi-card__sub">Excluye pedidos cancelados</span>
        </div>
      </article>

      <article class="kpi-card kpi-card--info">
        <div class="kpi-card__icon kpi-card__icon--ticket">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
            <line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
        </div>
        <div class="kpi-card__body">
          <span class="kpi-card__label">Ticket promedio</span>
          <span class="kpi-card__value">{{ kpis.averageOrderValue | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
          <span class="kpi-card__sub">Valor promedio por pedido vigente</span>
        </div>
      </article>

      <article class="kpi-card kpi-card--warning">
        <div class="kpi-card__icon kpi-card__icon--pending">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <div class="kpi-card__body">
          <span class="kpi-card__label">Pedidos pendientes</span>
          <span class="kpi-card__value">{{ kpis.pendingOrders }}</span>
          <span class="kpi-card__sub">Borrador, revision, pago y operacion</span>
        </div>
      </article>

      <article class="kpi-card kpi-card--accent">
        <div class="kpi-card__icon kpi-card__icon--paid">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
        </div>
        <div class="kpi-card__body">
          <span class="kpi-card__label">Pedidos pagados</span>
          <span class="kpi-card__value">{{ kpis.paidOrders }}</span>
          <span class="kpi-card__sub">Listos para evolucionar a operacion</span>
        </div>
      </article>

      <article class="kpi-card kpi-card--teal">
        <div class="kpi-card__icon kpi-card__icon--delivered">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15 21 21"/><path d="M4 4 9 9"/>
          </svg>
        </div>
        <div class="kpi-card__body">
          <span class="kpi-card__label">Pedidos entregados</span>
          <span class="kpi-card__value">{{ kpis.deliveredOrders }}</span>
          <span class="kpi-card__sub">Pedidos ya cerrados con entrega</span>
        </div>
      </article>

      <article class="kpi-card kpi-card--danger">
        <div class="kpi-card__icon kpi-card__icon--canceled">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <div class="kpi-card__body">
          <span class="kpi-card__label">Pedidos cancelados</span>
          <span class="kpi-card__value">{{ kpis.canceledOrders }}</span>
          <span class="kpi-card__sub">Seguimiento para deteccion de perdida</span>
        </div>
      </article>
    </div>
  `,
  styleUrl: './order-kpi-cards.component.css',
})
export class OrderKpiCardsComponent {
  @Input({ required: true }) kpis!: OrderStatsKpis;
}
