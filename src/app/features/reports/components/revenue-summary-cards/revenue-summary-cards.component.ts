// features/reports/components/revenue-summary-cards/revenue-summary-cards.component.ts
import { Component, Input } from '@angular/core';
import { CurrencyPipe, DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { ReportKpis } from '../../models/report.model';

@Component({
  selector: 'bc-revenue-summary-cards',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, NgClass, NgFor, NgIf],
  template: `
    <div class="kpi-grid" *ngIf="kpis">
      <!-- Ingresos Totales -->
      <div class="kpi-card kpi-card--primary">
        <div class="kpi-card__icon kpi-card__icon--revenue">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </div>
        <div class="kpi-card__body">
          <span class="kpi-card__label">Ingresos Totales</span>
          <span class="kpi-card__value">{{ kpis.totalRevenue | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
          <span class="kpi-card__sub">Pedidos pagados / entregados</span>
        </div>
      </div>

      <!-- Ganancia Estimada -->
      <div class="kpi-card kpi-card--success">
        <div class="kpi-card__icon kpi-card__icon--profit">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
          </svg>
        </div>
        <div class="kpi-card__body">
          <span class="kpi-card__label">Ganancia Estimada</span>
          <span class="kpi-card__value">{{ kpis.estimatedProfit | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
          <span class="kpi-card__sub">Margen estimado ~40%</span>
        </div>
      </div>

      <!-- Pedidos Totales -->
      <div class="kpi-card kpi-card--info">
        <div class="kpi-card__icon kpi-card__icon--orders">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        </div>
        <div class="kpi-card__body">
          <span class="kpi-card__label">Pedidos Completados</span>
          <span class="kpi-card__value">{{ kpis.totalOrders }}</span>
          <span class="kpi-card__sub">Pagados + Enviados + Entregados</span>
        </div>
      </div>

      <!-- Ticket Promedio -->
      <div class="kpi-card kpi-card--accent">
        <div class="kpi-card__icon kpi-card__icon--ticket">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
            <line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
        </div>
        <div class="kpi-card__body">
          <span class="kpi-card__label">Ticket Promedio</span>
          <span class="kpi-card__value">{{ kpis.avgTicket | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
          <span class="kpi-card__sub">Por pedido completado</span>
        </div>
      </div>

      <!-- Oportunidades Pendientes -->
      <div class="kpi-card kpi-card--warning">
        <div class="kpi-card__icon kpi-card__icon--opp">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div class="kpi-card__body">
          <span class="kpi-card__label">Oportunidades Abiertas</span>
          <span class="kpi-card__value">{{ kpis.pendingOpportunities }}</span>
          <span class="kpi-card__sub">Valor est. {{ kpis.pendingOpportunitiesValue | currency:'MXN':'symbol-narrow':'1.0-0' }}</span>
        </div>
      </div>
    </div>

    <!-- Skeleton loading -->
    <div class="kpi-grid" *ngIf="!kpis">
      <div class="kpi-card kpi-skeleton" *ngFor="let i of [1,2,3,4,5]"></div>
    </div>
  `,
  styleUrl: './revenue-summary-cards.component.css',
})
export class RevenueSummaryCardsComponent {
  @Input() kpis: ReportKpis | null = null;
}
