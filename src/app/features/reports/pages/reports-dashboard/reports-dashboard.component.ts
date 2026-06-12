import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TopProductsTableComponent } from '../../components/top-products-table/top-products-table.component';
import { LowProductsTableComponent } from '../../components/low-products-table/low-products-table.component';
import { TopCustomersTableComponent } from '../../components/top-customers-table/top-customers-table.component';
import { OrderStatus } from '../../../../models/order.model';
import {
  CustomerSalesRow,
  ProductLowSalesRow,
  ProductSalesRow,
  ReportDistributionRow,
  ReportFilters,
  ReportKpis,
  ReportPeriodMode,
  TicketStatusRow,
} from '../../models/report.model';
import { ReportsSupabaseService } from '../../services/reports.supabase.service';
import { PageVisibilityService } from '../../../../core/services/page-visibility.service';

type ChartTone = 'teal' | 'aqua' | 'mint' | 'amber' | 'rose' | 'slate';

interface KpiCard {
  label: string;
  value: string;
  description: string;
  tone: ChartTone;
  icon: string;
}

interface ChartSegment {
  key: string;
  label: string;
  value: number;
  color: string;
  formattedValue: string;
  percent: number;
}

interface DonutChart {
  title: string;
  subtitle: string;
  centerLabel: string;
  centerValue: string;
  emptyText: string;
  segments: ChartSegment[];
}

@Component({
  selector: 'bc-reports-dashboard',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    DatePipe,
    FormsModule,
    TopProductsTableComponent,
    LowProductsTableComponent,
    TopCustomersTableComponent,
  ],
  templateUrl: './reports-dashboard.component.html',
  styleUrl: './reports-dashboard.component.css',
})
export class ReportsDashboardComponent implements OnInit {
  private readonly reportsService = inject(ReportsSupabaseService);
  private readonly pageVisibility = inject(PageVisibilityService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly palette = ['#2C6975', '#68B2A0', '#8CC7BA', '#CDE0C9', '#F5C453', '#BC4B51', '#627F83'];
  private loadInFlight = false;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly minReportDate = '2026-01-01';
  readonly maxReportDate = this.toDateInputValue(new Date());

  readonly kpis = signal<ReportKpis | null>(null);
  readonly topProducts = signal<ProductSalesRow[]>([]);
  readonly lowProducts = signal<ProductLowSalesRow[]>([]);
  readonly topCustomers = signal<CustomerSalesRow[]>([]);
  readonly ticketStatusRows = signal<TicketStatusRow[]>([]);
  readonly revenueByCategoryRows = signal<ReportDistributionRow[]>([]);
  readonly catalogDistributionRows = signal<ReportDistributionRow[]>([]);
  readonly orderStatusRows = signal<ReportDistributionRow[]>([]);

  readonly hasAnyData = computed(() => {
    const kpis = this.kpis();
    return !!kpis && (
      kpis.totalRevenue > 0 ||
      kpis.totalOrders > 0 ||
      kpis.activeClients > 0 ||
      kpis.openTickets > 0 ||
      this.topProducts().length > 0 ||
      this.lowProducts().length > 0 ||
      this.topCustomers().length > 0 ||
      this.ticketStatusRows().some(row => row.count > 0)
    );
  });

  readonly kpiCards = computed<KpiCard[]>(() => {
    const kpis = this.kpis();
    if (!kpis) {
      return [];
    }

    return [
      {
        label: 'Total de pedidos',
        value: this.formatNumber(kpis.totalOrders),
        description: 'Pedidos completados en el periodo',
        tone: 'teal',
        icon: '□',
      },
      {
        label: 'Ingresos totales',
        value: this.formatCurrency(kpis.totalRevenue),
        description: 'Venta confirmada por pedidos pagados o entregados',
        tone: 'aqua',
        icon: '$',
      },
      {
        label: 'Ticket promedio',
        value: this.formatCurrency(kpis.avgTicket),
        description: 'Valor promedio por pedido completado',
        tone: 'mint',
        icon: '↗',
      },
      {
        label: 'Clientes activos',
        value: this.formatNumber(kpis.activeClients),
        description: 'Cuentas comerciales disponibles',
        tone: 'slate',
        icon: '◎',
      },
      {
        label: 'Tickets abiertos',
        value: this.formatNumber(kpis.openTickets),
        description: 'Solicitudes técnicas en seguimiento',
        tone: 'amber',
        icon: '!',
      },
      {
        label: 'Stock bajo',
        value: this.formatNumber(kpis.lowStockProducts),
        description: 'Productos físicos bajo mínimo definido',
        tone: 'rose',
        icon: '↓',
      },
    ];
  });

  readonly orderStatusChart = computed<DonutChart>(() => {
    const rows = this.orderStatusRows().filter(row => row.value > 0);
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    return {
      title: 'Pedidos por estado',
      subtitle: 'Distribución operativa de pedidos en el rango seleccionado',
      centerLabel: 'Pedidos',
      centerValue: this.formatNumber(total),
      emptyText: 'Aún no hay suficientes datos para mostrar esta distribución.',
      segments: this.toChartSegments(rows, 'number'),
    };
  });

  readonly revenueCategoryChart = computed<DonutChart>(() => {
    const rows = this.revenueByCategoryRows().filter(row => row.value > 0);
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    return {
      title: 'Ingresos por categoría',
      subtitle: 'Participación comercial por tipo de producto o servicio',
      centerLabel: 'Ingresos',
      centerValue: this.formatCurrency(total),
      emptyText: 'Aún no hay suficientes datos para mostrar esta distribución.',
      segments: this.toChartSegments(rows, 'currency'),
    };
  });

  readonly ticketStatusChart = computed<DonutChart>(() => {
    const rows = this.ticketStatusRows()
      .filter(row => row.count > 0)
      .map(row => ({ key: row.status, label: row.label, value: row.count }));
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    return {
      title: 'Tickets por estado',
      subtitle: 'Carga actual de soporte técnico y seguimiento',
      centerLabel: 'Tickets',
      centerValue: this.formatNumber(total),
      emptyText: 'Aún no hay suficientes datos para mostrar esta distribución.',
      segments: this.toChartSegments(rows, 'number'),
    };
  });

  readonly mainCharts = computed(() => [this.orderStatusChart(), this.revenueCategoryChart()]);
  readonly secondaryCharts = computed(() => [this.ticketStatusChart(), this.catalogChart()]);

  readonly catalogChart = computed<DonutChart>(() => {
    const rows = this.catalogDistributionRows().filter(row => row.value > 0);
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    return {
      title: 'Catálogo por tipo',
      subtitle: 'Composición entre productos nuevos, seminuevos y servicios',
      centerLabel: 'Registros',
      centerValue: this.formatNumber(total),
      emptyText: 'Aún no hay suficientes datos para mostrar esta distribución.',
      segments: this.toChartSegments(rows, 'number'),
    };
  });

  filters: ReportFilters = this.createPeriodFilters('day');
  periodMode: ReportPeriodMode = 'day';
  dateFrom = this.filters.dateFrom ?? '';
  dateTo = this.filters.dateTo ?? '';
  selectedMonth = this.dateFrom.substring(0, 7);
  activeTab: 'top' | 'low' | 'customers' = 'top';
  lastUpdated = new Date().toISOString();

  ngOnInit(): void {
    void this.loadData();

    this.pageVisibility.visible$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.loadData();
      });
  }

  async applyFilters(): Promise<void> {
    this.dateFrom = this.normalizeReportDate(this.dateFrom);
    this.dateTo = this.normalizeReportDate(this.dateTo);

    if (this.dateFrom && !this.dateTo) {
      this.dateTo = this.dateFrom;
    }

    if (this.dateTo && !this.dateFrom) {
      this.dateFrom = this.dateTo;
    }

    this.filters = {
      periodMode: this.periodMode,
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
    };
    await this.loadData();
  }

  async clearFilters(): Promise<void> {
    this.setPeriodMode('day');
    await this.loadData();
  }

  setPeriodMode(mode: ReportPeriodMode): void {
    this.periodMode = mode;
    this.filters = this.createPeriodFilters(mode);
    this.dateFrom = this.filters.dateFrom ?? '';
    this.dateTo = this.filters.dateTo ?? '';
    if (this.dateFrom) {
      this.selectedMonth = this.dateFrom.substring(0, 7);
    }
  }

  async applyPeriodMode(mode: ReportPeriodMode): Promise<void> {
    this.setPeriodMode(mode);
    await this.loadData();
  }

  setTab(tab: 'top' | 'low' | 'customers'): void {
    this.activeTab = tab;
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

  onMonthInputChange(value: string): void {
    if (!value) return;
    this.selectedMonth = value;
    const [year, month] = value.split('-').map(Number);
    const dateFrom = new Date(year, month - 1, 1);
    const dateTo = new Date(year, month, 0);
    this.dateFrom = this.toDateInputValue(dateFrom);
    this.dateTo = this.toDateInputValue(dateTo);
  }

  get periodLabel(): string {
    const labels: Record<ReportPeriodMode, string> = {
      day: 'Día',
      week: 'Semana',
      month: 'Mes',
    };

    return labels[this.periodMode];
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

  donutBackground(segments: ChartSegment[]): string {
    if (!segments.length) {
      return 'conic-gradient(#E8F5F2 0deg 360deg)';
    }

    let cursor = 0;
    const stops = segments.map(segment => {
      const start = cursor;
      const end = cursor + (segment.percent * 3.6);
      cursor = end;
      return `${segment.color} ${start}deg ${end}deg`;
    });

    return `conic-gradient(${stops.join(', ')})`;
  }

  trackBySegment(_: number, segment: ChartSegment): string {
    return segment.key;
  }

  trackByKpi(_: number, card: KpiCard): string {
    return card.label;
  }

  private async loadData(): Promise<void> {
    if (this.loadInFlight) {
      return;
    }

    this.loadInFlight = true;
    this.loading.set(true);
    this.error.set(null);

    try {
      const snapshot = await this.reportsService.getSnapshot(this.filters);
      this.kpis.set(snapshot.kpis);
      this.topProducts.set(snapshot.topProducts);
      this.lowProducts.set(snapshot.lowProducts);
      this.topCustomers.set(snapshot.topCustomers);
      this.ticketStatusRows.set(snapshot.ticketStatusRows);
      this.revenueByCategoryRows.set(snapshot.revenueByCategoryRows);
      this.catalogDistributionRows.set(snapshot.catalogDistributionRows);
      this.orderStatusRows.set(this.buildOrderStatusRows(snapshot.orderAnalyticsOrders));
      this.lastUpdated = new Date().toISOString();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'No se pudo cargar la información.');
      this.kpis.set(null);
      this.topProducts.set([]);
      this.lowProducts.set([]);
      this.topCustomers.set([]);
      this.ticketStatusRows.set([]);
      this.revenueByCategoryRows.set([]);
      this.catalogDistributionRows.set([]);
      this.orderStatusRows.set([]);
    } finally {
      this.loadInFlight = false;
      this.loading.set(false);
    }
  }

  private buildOrderStatusRows(orders: Array<{ status: OrderStatus }>): ReportDistributionRow[] {
    const labels: Record<OrderStatus, string> = {
      [OrderStatus.Draft]: 'Borrador',
      [OrderStatus.PendingReview]: 'Pendiente',
      [OrderStatus.PendingPayment]: 'Pendiente de pago',
      [OrderStatus.Paid]: 'Pagado',
      [OrderStatus.Processing]: 'En proceso',
      [OrderStatus.Shipped]: 'Enviado',
      [OrderStatus.Delivered]: 'Entregado',
      [OrderStatus.Canceled]: 'Cancelado',
    };

    const sequence = [
      OrderStatus.PendingReview,
      OrderStatus.PendingPayment,
      OrderStatus.Paid,
      OrderStatus.Processing,
      OrderStatus.Shipped,
      OrderStatus.Delivered,
      OrderStatus.Canceled,
      OrderStatus.Draft,
    ];

    return sequence.map(status => ({
      key: status,
      label: labels[status],
      value: orders.filter(order => order.status === status).length,
    }));
  }

  private toChartSegments(rows: ReportDistributionRow[], valueType: 'number' | 'currency'): ChartSegment[] {
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    if (total <= 0) {
      return [];
    }

    return rows.map((row, index) => ({
      key: row.key,
      label: row.label,
      value: row.value,
      color: this.palette[index % this.palette.length],
      formattedValue: valueType === 'currency' ? this.formatCurrency(row.value) : this.formatNumber(row.value),
      percent: Math.round((row.value / total) * 1000) / 10,
    }));
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 0,
    }).format(value || 0);
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('es-MX').format(value || 0);
  }

  private createPeriodFilters(mode: ReportPeriodMode): ReportFilters {
    const today = new Date();
    const range = this.getPeriodRange(mode, today);
    return {
      periodMode: mode,
      dateFrom: this.toDateInputValue(range.from),
      dateTo: this.toDateInputValue(range.to),
    };
  }

  private getPeriodRange(mode: ReportPeriodMode, baseDate: Date): { from: Date; to: Date } {
    if (mode === 'week') {
      const day = baseDate.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const from = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + mondayOffset);
      const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6);
      return { from, to };
    }

    if (mode === 'month') {
      return {
        from: new Date(baseDate.getFullYear(), baseDate.getMonth(), 1),
        to: new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0),
      };
    }

    return { from: baseDate, to: baseDate };
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
