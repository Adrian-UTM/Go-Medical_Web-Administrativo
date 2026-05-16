import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { OrderMockService } from '../../services/order.mock.service';
import {
  Order,
  OrderStatsGrouping,
  OrderStatsPeriodPreset,
} from '../../../../models/order.model';
import { buildOrderStatsSnapshot } from '../../utils/order-stats.helper';
import { OrderKpiCardsComponent } from '../../components/order-kpi-cards/order-kpi-cards.component';
import { OrderPeriodChartComponent } from '../../components/order-period-chart/order-period-chart.component';
import { OrderStatusSummaryComponent } from '../../components/order-status-summary/order-status-summary.component';
import { TopOrderedProductsComponent } from '../../components/top-ordered-products/top-ordered-products.component';

@Component({
  selector: 'bc-order-stats',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DatePipe,
    PageHeaderComponent,
    LoaderComponent,
    CustomSelectComponent,
    EmptyStateComponent,
    OrderKpiCardsComponent,
    OrderPeriodChartComponent,
    OrderStatusSummaryComponent,
    TopOrderedProductsComponent,
  ],
  templateUrl: './order-stats.component.html',
  styleUrl: './order-stats.component.css',
})
export class OrderStatsComponent {
  private readonly orderService = inject(OrderMockService);

  readonly isLoading = signal(true);
  readonly orders = signal<Order[]>([]);
  readonly selectedPreset = signal<OrderStatsPeriodPreset>('this_month');
  readonly selectedGrouping = signal<OrderStatsGrouping>('day');
  readonly customDateFrom = signal('');
  readonly customDateTo = signal('');

  readonly presetOptions: { value: OrderStatsPeriodPreset; label: string }[] = [
    { value: 'today', label: 'Hoy' },
    { value: 'this_week', label: 'Esta semana' },
    { value: 'this_month', label: 'Este mes' },
    { value: 'last_7_days', label: 'Ultimos 7 dias' },
    { value: 'last_30_days', label: 'Ultimos 30 dias' },
    { value: 'custom', label: 'Rango personalizado' },
  ];

  readonly groupingOptions: { value: OrderStatsGrouping; label: string }[] = [
    { value: 'day', label: 'Dia' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
  ];

  readonly isCustomRange = computed(() => this.selectedPreset() === 'custom');

  readonly snapshot = computed(() => buildOrderStatsSnapshot(this.orders(), {
    periodPreset: this.selectedPreset(),
    grouping: this.selectedGrouping(),
    dateFrom: this.customDateFrom(),
    dateTo: this.customDateTo(),
  }));

  readonly ordersChartSeries = computed(() =>
    this.snapshot().periodPoints.map(point => ({ label: point.label, value: point.ordersCount }))
  );

  readonly revenueChartSeries = computed(() =>
    this.snapshot().periodPoints.map(point => ({ label: point.label, value: point.revenue }))
  );

  constructor() {
    void this.loadOrders();
  }

  async loadOrders(): Promise<void> {
    this.isLoading.set(true);
    this.orders.set(await this.orderService.getOrders());
    this.isLoading.set(false);
  }

  onPresetChange(value: OrderStatsPeriodPreset): void {
    this.selectedPreset.set(value);
    if (value !== 'custom') {
      this.customDateFrom.set('');
      this.customDateTo.set('');
    }
  }

  onGroupingChange(value: OrderStatsGrouping): void {
    this.selectedGrouping.set(value);
  }

  resetFilters(): void {
    this.selectedPreset.set('this_month');
    this.selectedGrouping.set('day');
    this.customDateFrom.set('');
    this.customDateTo.set('');
  }
}
