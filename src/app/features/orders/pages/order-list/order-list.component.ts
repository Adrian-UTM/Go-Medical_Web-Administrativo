import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { OrderSupabaseService } from '../../services/order.supabase.service';
import { Order, OrderStatsPeriodPreset, OrderStatus } from '../../../../models/order.model';
import { buildOrderStatsSnapshot } from '../../utils/order-stats.helper';
import { PageVisibilityService } from '../../../../core/services/page-visibility.service';

@Component({
  selector: 'bc-order-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CurrencyPipe,
    DatePipe,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoaderComponent,
    EmptyStateComponent,
    CustomSelectComponent,
  ],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.css',
})
export class OrderListComponent implements OnInit {
  private readonly orderService = inject(OrderSupabaseService);
  private readonly pageVisibility = inject(PageVisibilityService);
  private readonly destroyRef = inject(DestroyRef);

  private loadInFlight = false;

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly orders = signal<Order[]>([]);
  readonly searchQuery = signal('');
  readonly selectedStatus = signal<OrderStatus | ''>('');
  readonly quickPreset = signal<OrderStatsPeriodPreset>('today');
  readonly cancelingOrderId = signal<string | null>(null);

  readonly statusOptions: { value: OrderStatus | ''; label: string }[] = [
    { value: '', label: 'Todos los estados' },
    { value: OrderStatus.Draft, label: 'Borrador' },
    { value: OrderStatus.PendingReview, label: 'Pendiente de revision' },
    { value: OrderStatus.PendingPayment, label: 'Pendiente de pago' },
    { value: OrderStatus.Paid, label: 'Pagado' },
    { value: OrderStatus.Processing, label: 'En proceso' },
    { value: OrderStatus.Shipped, label: 'Enviado' },
    { value: OrderStatus.Delivered, label: 'Entregado' },
    { value: OrderStatus.Canceled, label: 'Cancelado' },
  ];

  readonly filteredOrders = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const status = this.selectedStatus();

    return this.orders().filter(order => {
      const matchesQuery = !query || [
        order.folio,
        order.clientNameSnapshot,
        ...order.items.map(item => item.productName),
      ].some(value => value.toLowerCase().includes(query));

      const matchesStatus = !status || order.status === status;
      return matchesQuery && matchesStatus;
    });
  });

  readonly quickSummary = computed(() => buildOrderStatsSnapshot(this.orders(), {
    periodPreset: this.quickPreset(),
    grouping: 'day',
  }));

  readonly hasActiveFilters = computed(() => !!this.searchQuery().trim() || !!this.selectedStatus());

  ngOnInit(): void {
    void this.loadOrders();

    this.pageVisibility.visible$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.loadOrders();
      });
  }

  async loadOrders(): Promise<void> {
    if (this.loadInFlight) {
      return;
    }

    this.loadInFlight = true;
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      this.orders.set(await this.orderService.getOrders());
    } catch (error) {
      this.orders.set([]);
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible cargar los pedidos.');
    } finally {
      this.loadInFlight = false;
      this.isLoading.set(false);
    }
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedStatus.set('');
  }

  setQuickPreset(preset: OrderStatsPeriodPreset): void {
    this.quickPreset.set(preset);
  }

  async cancelOrder(order: Order): Promise<void> {
    if (this.cancelingOrderId() || order.status === OrderStatus.Canceled) {
      return;
    }

    const confirmed = window.confirm(`Se cancelara el pedido ${order.folio}. El pedido permanecera visible en el historial.`);
    if (!confirmed) {
      return;
    }

    this.cancelingOrderId.set(order.id);
    this.errorMessage.set('');

    try {
      const updatedOrder = await this.orderService.cancelOrder(order.id);
      if (updatedOrder) {
        this.orders.set(this.orders().map(item => item.id === order.id ? updatedOrder : item));
      }
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No se pudo cancelar el pedido.');
    } finally {
      this.cancelingOrderId.set(null);
    }
  }

  get emptyStateDescription(): string {
    if (this.errorMessage()) {
      return this.errorMessage();
    }

    return this.hasActiveFilters()
      ? 'No se encontraron pedidos con los filtros aplicados.'
      : 'No hay pedidos registrados por el momento.';
  }

  getStatusBadge(status: OrderStatus): { label: string; variant: BadgeVariant } {
    const statusMap: Record<OrderStatus, { label: string; variant: BadgeVariant }> = {
      [OrderStatus.Draft]: { label: 'Borrador', variant: 'neutral' },
      [OrderStatus.PendingReview]: { label: 'Pendiente de revision', variant: 'warning' },
      [OrderStatus.PendingPayment]: { label: 'Pendiente de pago', variant: 'warning' },
      [OrderStatus.Paid]: { label: 'Pagado', variant: 'success' },
      [OrderStatus.Processing]: { label: 'En proceso', variant: 'info' },
      [OrderStatus.Shipped]: { label: 'Enviado', variant: 'primary' },
      [OrderStatus.Delivered]: { label: 'Entregado', variant: 'success' },
      [OrderStatus.Canceled]: { label: 'Cancelado', variant: 'danger' },
    };

    return statusMap[status];
  }

  getItemsCount(order: Order): number {
    return order.items.reduce((sum, item) => sum + item.quantity, 0);
  }
}


