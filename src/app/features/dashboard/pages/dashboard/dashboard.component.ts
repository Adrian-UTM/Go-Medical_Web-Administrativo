import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import {
  DashboardMetricCardData,
  DashboardRecentActivity,
  DashboardSnapshot,
  DashboardSupabaseService,
} from '../../services/dashboard.supabase.service';
import { PageVisibilityService } from '../../../../core/services/page-visibility.service';

interface MetricCardView extends DashboardMetricCardData {
  valueLabel: string;
  icon: string;
  accentColor: string;
  accentTone: 'primary' | 'success' | 'info' | 'warning' | 'danger';
}

interface OperationalAlert {
  id: string;
  title: string;
  description: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

@Component({
  selector: 'bc-dashboard',
  standalone: true,
  imports: [NgFor, NgIf, PageHeaderComponent, StatusBadgeComponent, CurrencyPipe, DatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  private readonly dashboardService = inject(DashboardSupabaseService);
  private readonly pageVisibility = inject(PageVisibilityService);
  private readonly destroyRef = inject(DestroyRef);

  private loadInFlight = false;

  readonly loading = signal(false);
  readonly error = signal('');
  readonly snapshot = signal<DashboardSnapshot | null>(null);

  readonly metrics = computed<MetricCardView[]>(() => {
    const safe = this.snapshot() ?? {
      totalProducts: 0,
      totalClients: 0,
      totalOrders: 0,
      totalQuotes: 0,
      openTickets: 0,
      lowStockProducts: 0,
      recentOrders: [],
      recentActivity: [],
    };

    return [
      {
        id: 'metric-productos',
        label: 'Productos',
        value: safe.totalProducts,
        valueLabel: this.formatCount(safe.totalProducts),
        delta: safe.totalProducts > 0 ? 'Catálogo disponible' : 'Sin productos registrados',
        deltaPositive: safe.totalProducts > 0,
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
        accentColor: 'var(--color-success)',
        accentTone: 'success',
      },
      {
        id: 'metric-clientes',
        label: 'Clientes',
        value: safe.totalClients,
        valueLabel: this.formatCount(safe.totalClients),
        delta: safe.totalClients > 0 ? 'Base comercial activa' : 'Sin clientes registrados',
        deltaPositive: safe.totalClients > 0,
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        accentColor: 'var(--color-primary-light)',
        accentTone: 'primary',
      },
      {
        id: 'metric-pedidos',
        label: 'Pedidos',
        value: safe.totalOrders,
        valueLabel: this.formatCount(safe.totalOrders),
        delta: safe.totalOrders > 0 ? 'Operación comercial activa' : 'Sin pedidos registrados',
        deltaPositive: safe.totalOrders > 0,
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
        accentColor: 'var(--color-accent)',
        accentTone: 'info',
      },
      {
        id: 'metric-cotizaciones',
        label: 'Cotizaciones',
        value: safe.totalQuotes,
        valueLabel: this.formatCount(safe.totalQuotes),
        delta: safe.totalQuotes > 0 ? 'Seguimiento comercial activo' : 'Sin cotizaciones registradas',
        deltaPositive: safe.totalQuotes > 0,
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
        accentColor: 'var(--color-info)',
        accentTone: 'info',
      },
      {
        id: 'metric-tickets',
        label: 'Tickets abiertos',
        value: safe.openTickets,
        valueLabel: this.formatCount(safe.openTickets),
        delta: safe.openTickets > 0 ? 'Requieren atención técnica' : 'Sin tickets abiertos',
        deltaPositive: safe.openTickets === 0,
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
        accentColor: 'var(--color-warning)',
        accentTone: safe.openTickets > 0 ? 'warning' : 'success',
      },
      {
        id: 'metric-stock-bajo',
        label: 'Stock bajo',
        value: safe.lowStockProducts,
        valueLabel: this.formatCount(safe.lowStockProducts),
        delta: safe.lowStockProducts > 0 ? 'Productos por revisar' : 'Sin alertas de inventario',
        deltaPositive: safe.lowStockProducts === 0,
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        accentColor: 'var(--color-warning)',
        accentTone: safe.lowStockProducts > 0 ? 'warning' : 'success',
      },
    ];
  });

  readonly recentOrders = computed(() => this.snapshot()?.recentOrders ?? []);
  readonly recentActivity = computed(() => this.snapshot()?.recentActivity ?? []);
  readonly hasRecentOrders = computed(() => this.recentOrders().length > 0);
  readonly hasRecentActivity = computed(() => this.recentActivity().length > 0);
  readonly operationalAlerts = computed<OperationalAlert[]>(() => {
    const current = this.snapshot();
    if (!current) {
      return [];
    }

    const alerts: OperationalAlert[] = [];

    if (current.lowStockProducts > 0) {
      alerts.push({
        id: 'alert-stock',
        title: 'Reposición sugerida',
        description: `${this.formatCount(current.lowStockProducts)} producto(s) requieren seguimiento por bajo stock.`,
        tone: 'warning',
      });
    }

    if (current.openTickets > 0) {
      alerts.push({
        id: 'alert-tickets',
        title: 'Soporte técnico activo',
        description: `${this.formatCount(current.openTickets)} ticket(s) siguen abiertos en este momento.`,
        tone: 'info',
      });
    }

    if (!alerts.length) {
      alerts.push({
        id: 'alert-ok',
        title: 'Operación estable',
        description: 'No hay alertas operativas prioritarias en este momento.',
        tone: 'success',
      });
    }

    return alerts;
  });

  readonly heroSummary = computed(() => {
    const current = this.snapshot();
    if (!current) {
      return {
        title: 'Panorama general',
        description: 'Consulta aquí la actividad operativa más reciente del negocio.',
      };
    }

    if (current.totalOrders > 0 || current.totalQuotes > 0) {
      return {
        title: 'Operación comercial en curso',
        description: `${this.formatCount(current.totalOrders)} pedidos y ${this.formatCount(current.totalQuotes)} cotizaciones registradas actualmente.`,
      };
    }

    return {
      title: 'Resumen operativo listo',
      description: 'La plataforma está preparada para concentrar productos, clientes, inventario y soporte técnico.',
    };
  });

  ngOnInit(): void {
    void this.loadDashboard();

    this.pageVisibility.visible$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.loadDashboard();
      });
  }

  async loadDashboard(): Promise<void> {
    if (this.loadInFlight) {
      return;
    }

    this.loadInFlight = true;
    this.loading.set(true);
    this.error.set('');

    try {
      this.snapshot.set(await this.dashboardService.getSnapshot());
    } catch (error) {
      this.snapshot.set(null);
      this.error.set(error instanceof Error ? error.message : 'No se pudo cargar el resumen operativo.');
    } finally {
      this.loadInFlight = false;
      this.loading.set(false);
    }
  }

  getStatusBadgeVariant(status: string): 'success' | 'warning' | 'info' | 'neutral' | 'danger' {
    const map: Record<string, 'success' | 'warning' | 'info' | 'neutral' | 'danger'> = {
      draft: 'neutral',
      pending_review: 'warning',
      pending_payment: 'warning',
      paid: 'success',
      processing: 'info',
      shipped: 'info',
      delivered: 'success',
      canceled: 'danger',
    };

    return map[status] ?? 'neutral';
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: 'Borrador',
      pending_review: 'Revisión',
      pending_payment: 'Pago pendiente',
      paid: 'Pagado',
      processing: 'En proceso',
      shipped: 'Enviado',
      delivered: 'Entregado',
      canceled: 'Cancelado',
    };

    return map[status] ?? 'Pedido';
  }

  getActivityTone(activity: DashboardRecentActivity): 'success' | 'warning' | 'info' | 'neutral' | 'danger' {
    return activity.badgeVariant;
  }

  private formatCount(value: number): string {
    return new Intl.NumberFormat('es-MX').format(value);
  }
}
