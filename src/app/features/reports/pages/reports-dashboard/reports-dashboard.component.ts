import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  TicketStatusRow,
} from '../../models/report.model';
import { ReportsSupabaseService } from '../../services/reports.supabase.service';

@Component({
  selector: 'bc-reports-dashboard',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
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
export class ReportsDashboardComponent {
  private readonly reportsService = inject(ReportsSupabaseService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly minReportDate = '2026-01-01';
  readonly maxReportDate = this.toDateInputValue(new Date());

  readonly kpis = signal<ReportKpis | null>(null);
  readonly topProducts = signal<ProductSalesRow[]>([]);
  readonly lowProducts = signal<ProductLowSalesRow[]>([]);
  readonly topCustomers = signal<CustomerSalesRow[]>([]);
  readonly orderAnalyticsOrders = signal<Order[]>([]);
  readonly orderAnalytics = signal<OrderStatsSnapshot | null>(null);
  readonly ticketStatusRows = signal<TicketStatusRow[]>([]);
  readonly orderAnalyticsGrouping = signal<OrderStatsGrouping>('day');
  readonly orderCountSeries = signal<OrderPeriodChartDatum[]>([]);
  readonly orderRevenueSeries = signal<OrderPeriodChartDatum[]>([]);

  readonly hasAnyData = computed(() => {
    const kpis = this.kpis();
    return !!kpis && (
      kpis.totalRevenue > 0 ||
      kpis.totalOrders > 0 ||
      this.topProducts().length > 0 ||
      this.lowProducts().length > 0 ||
      this.topCustomers().length > 0 ||
      this.ticketStatusRows().some(row => row.count > 0)
    );
  });

  filters: ReportFilters = {};
  dateFrom = '';
  dateTo = '';
  activeTab: 'top' | 'low' | 'customers' = 'top';
  lastUpdated = new Date().toISOString();

  constructor() {
    void this.loadData();
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
      const snapshot = await this.reportsService.getSnapshot(this.filters);
      this.kpis.set(snapshot.kpis);
      this.topProducts.set(snapshot.topProducts);
      this.lowProducts.set(snapshot.lowProducts);
      this.topCustomers.set(snapshot.topCustomers);
      this.ticketStatusRows.set(snapshot.ticketStatusRows);
      this.orderAnalyticsOrders.set(snapshot.orderAnalyticsOrders);
      this.rebuildOrderAnalytics(snapshot.orderAnalyticsOrders, this.filters.dateFrom, this.filters.dateTo);
      this.lastUpdated = new Date().toISOString();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Ocurrio un error al cargar los reportes.');
      this.kpis.set(null);
      this.topProducts.set([]);
      this.lowProducts.set([]);
      this.topCustomers.set([]);
      this.ticketStatusRows.set([]);
      this.orderAnalyticsOrders.set([]);
      this.orderAnalytics.set(null);
      this.orderCountSeries.set([]);
      this.orderRevenueSeries.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private rebuildOrderAnalytics(orders: Order[] = this.orderAnalyticsOrders(), dateFrom?: string, dateTo?: string): void {
    const snapshot = buildOrderStatsSnapshot(orders, {
      periodPreset: this.dateFrom || this.dateTo ? 'custom' : 'last_30_days',
      grouping: this.orderAnalyticsGrouping(),
      dateFrom: dateFrom || this.dateFrom || undefined,
      dateTo: dateTo || this.dateTo || undefined,
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



