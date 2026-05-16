// features/reports/pages/reports-dashboard/reports-dashboard.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, NgClass, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportsMockService } from '../../services/reports-mock.service';
import { OrderMockService } from '../../../orders/services/order.mock.service';
import { RevenueSummaryCardsComponent } from '../../components/revenue-summary-cards/revenue-summary-cards.component';
import { TopProductsTableComponent } from '../../components/top-products-table/top-products-table.component';
import { LowProductsTableComponent } from '../../components/low-products-table/low-products-table.component';
import { TopCustomersTableComponent } from '../../components/top-customers-table/top-customers-table.component';
import { OrderPeriodChartComponent, OrderPeriodChartDatum } from '../../../orders/components/order-period-chart/order-period-chart.component';
import { OrderStatusSummaryComponent } from '../../../orders/components/order-status-summary/order-status-summary.component';
import { TopOrderedProductsComponent } from '../../../orders/components/top-ordered-products/top-ordered-products.component';
import { buildOrderStatsSnapshot } from '../../../orders/utils/order-stats.helper';
import { Order, OrderStatsGrouping, OrderStatsSnapshot } from '../../../../models/order.model';
import {
  CustomerSalesRow,
  ProductLowSalesRow,
  ProductSalesRow,
  ReportFilters,
  ReportKpis,
} from '../../models/report.model';

@Component({
  selector: 'bc-reports-dashboard',
  standalone: true,
  imports: [
    NgIf,
    NgClass,
    DatePipe,
    FormsModule,
    RevenueSummaryCardsComponent,
    TopProductsTableComponent,
    LowProductsTableComponent,
    TopCustomersTableComponent,
    OrderPeriodChartComponent,
    OrderStatusSummaryComponent,
    TopOrderedProductsComponent,
  ],
  templateUrl: './reports-dashboard.component.html',
  styleUrl: './reports-dashboard.component.css',
})
export class ReportsDashboardComponent implements OnInit {
  private readonly reportsService = inject(ReportsMockService);
  private readonly orderService = inject(OrderMockService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly minReportDate = '2026-01-01';
  readonly maxReportDate = this.toDateInputValue(new Date());

  kpis = signal<ReportKpis | null>(null);
  topProducts = signal<ProductSalesRow[] | null>(null);
  lowProducts = signal<ProductLowSalesRow[] | null>(null);
  topCustomers = signal<CustomerSalesRow[] | null>(null);
  orderAnalytics = signal<OrderStatsSnapshot | null>(null);
  orderAnalyticsOrders = signal<Order[]>([]);
  orderAnalyticsGrouping = signal<OrderStatsGrouping>('day');
  orderCountSeries = signal<OrderPeriodChartDatum[]>([]);
  orderRevenueSeries = signal<OrderPeriodChartDatum[]>([]);

  filters: ReportFilters = {};
  dateFrom = '';
  dateTo = '';

  activeTab: 'top' | 'low' | 'customers' = 'top';
  lastUpdated = new Date().toISOString();

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async applyFilters(): Promise<void> {
    this.dateFrom = this.normalizeReportDate(this.dateFrom);
    this.dateTo = this.normalizeReportDate(this.dateTo);

    this.filters = {
      ...this.filters,
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
    };
    await this.loadData();
  }

  async clearFilters(): Promise<void> {
    this.filters = {};
    this.dateFrom = '';
    this.dateTo = '';
    await this.loadData();
  }

  setTab(tab: 'top' | 'low' | 'customers'): void {
    this.activeTab = tab;
  }

  setOrderAnalyticsGrouping(grouping: OrderStatsGrouping): void {
    this.orderAnalyticsGrouping.set(grouping);
    this.rebuildOrderAnalytics();
  }

  openDatePicker(input: HTMLInputElement): void {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }

    input.focus();
    input.click();
  }

  onDateInputChange(field: 'from' | 'to', value: string): void {
    const normalized = this.normalizeReportDate(value);
    if (field === 'from') {
      this.dateFrom = normalized;
      return;
    }

    this.dateTo = normalized;
  }

  formatFilterDate(value: string): string {
    if (!value) {
      return 'Seleccionar fecha';
    }

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [kpis, top, low, customers, orders] = await Promise.all([
        this.reportsService.getKpis(this.filters),
        this.reportsService.getTopProducts(this.filters),
        this.reportsService.getLowProducts(this.filters),
        this.reportsService.getTopCustomers(this.filters),
        this.orderService.getOrders(),
      ]);

      this.kpis.set(kpis);
      this.topProducts.set(top);
      this.lowProducts.set(low);
      this.topCustomers.set(customers);
      this.orderAnalyticsOrders.set(orders);
      this.rebuildOrderAnalytics();
      this.lastUpdated = new Date().toISOString();
    } catch (err) {
      this.error.set('Ocurrió un error al cargar los datos. Intenta de nuevo.');
      console.error('[ReportsDashboard] Error loading report data:', err);
    } finally {
      this.loading.set(false);
    }
  }

  private rebuildOrderAnalytics(): void {
    const snapshot = buildOrderStatsSnapshot(this.orderAnalyticsOrders(), {
      periodPreset: this.dateFrom || this.dateTo ? 'custom' : 'last_30_days',
      grouping: this.orderAnalyticsGrouping(),
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
    });

    this.orderAnalytics.set(snapshot);
    this.orderCountSeries.set(snapshot.periodPoints.map(point => ({ label: point.label, value: point.ordersCount })));
    this.orderRevenueSeries.set(snapshot.periodPoints.map(point => ({ label: point.label, value: point.revenue })));
  }

  private normalizeReportDate(value: string): string {
    if (!value) {
      return '';
    }

    if (value < this.minReportDate) {
      return this.minReportDate;
    }

    if (value > this.maxReportDate) {
      return this.maxReportDate;
    }

    return value;
  }

  private toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
