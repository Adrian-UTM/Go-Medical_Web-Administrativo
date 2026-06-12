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
import { ActionMenuComponent } from '../../../../shared/components/action-menu/action-menu.component';
import { OrderSupabaseService } from '../../services/order.supabase.service';
import { Order, OrderStatsPeriodPreset, OrderStatus } from '../../../../models/order.model';
import { buildOrderStatsSnapshot } from '../../utils/order-stats.helper';
import { PageVisibilityService } from '../../../../core/services/page-visibility.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import { ReturnRequestsSupabaseService } from '../../services/return-requests.supabase.service';
import {
  RETURN_REASON_LABELS,
  RETURN_REQUEST_STATUS_LABELS,
  RETURN_REQUEST_STATUS_VARIANTS,
  ReturnReasonType,
  ReturnRequest,
  ReturnRequestStatus,
} from '../../../../models/return-request.model';

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
    ActionMenuComponent,
  ],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.css',
})
export class OrderListComponent implements OnInit {
  private readonly orderService = inject(OrderSupabaseService);
  private readonly returnRequestsService = inject(ReturnRequestsSupabaseService);
  private readonly pageVisibility = inject(PageVisibilityService);
  private readonly supabase = inject(SupabaseService);
  private readonly destroyRef = inject(DestroyRef);

  private loadInFlight = false;
  private returnsLoadInFlight = false;

  readonly isLoading = signal(false);
  readonly isLoadingReturns = signal(false);
  readonly errorMessage = signal('');
  readonly returnErrorMessage = signal('');
  readonly activeTab = signal<'orders' | 'returns'>('orders');
  readonly orders = signal<Order[]>([]);
  readonly returnRequests = signal<ReturnRequest[]>([]);
  readonly searchQuery = signal('');
  readonly selectedStatus = signal<OrderStatus | ''>('');
  readonly returnSearchQuery = signal('');
  readonly selectedReturnStatus = signal<ReturnRequestStatus | ''>('');
  readonly selectedReturnReason = signal<ReturnReasonType | ''>('');
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

  readonly returnStatusOptions: { value: ReturnRequestStatus | ''; label: string }[] = [
    { value: '', label: 'Todos los estados' },
    ...Object.values(ReturnRequestStatus).map(status => ({ value: status, label: RETURN_REQUEST_STATUS_LABELS[status] })),
  ];

  readonly returnReasonOptions: { value: ReturnReasonType | ''; label: string }[] = [
    { value: '', label: 'Todos los motivos' },
    ...Object.values(ReturnReasonType).map(reason => ({ value: reason, label: RETURN_REASON_LABELS[reason] })),
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
  readonly filteredReturnRequests = computed(() => {
    const query = this.returnSearchQuery().trim().toLowerCase();
    const status = this.selectedReturnStatus();
    const reason = this.selectedReturnReason();

    return this.returnRequests().filter(request => {
      const matchesQuery = !query || [
        request.returnNumber,
        request.order?.folio ?? '',
        request.client?.businessName ?? request.order?.clientNameSnapshot ?? '',
      ].some(value => String(value ?? '').toLowerCase().includes(query));
      const matchesStatus = !status || request.status === status;
      const matchesReason = !reason || request.reason === reason;
      return matchesQuery && matchesStatus && matchesReason;
    });
  });
  readonly hasActiveReturnFilters = computed(() =>
    !!this.returnSearchQuery().trim() || !!this.selectedReturnStatus() || !!this.selectedReturnReason()
  );

  ngOnInit(): void {
    void this.loadOrders();

    this.pageVisibility.visible$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.reloadActiveTab();
      });

    this.setupRealtimeRefresh();
  }

  private setupRealtimeRefresh(): void {
    const channel = this.supabase.client
      .channel('orders-list-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void this.loadOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        void this.loadOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'return_requests' }, () => {
        void this.loadReturnRequests();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'return_request_items' }, () => {
        void this.loadReturnRequests();
      })
      .subscribe();

    this.destroyRef.onDestroy(() => {
      void this.supabase.client.removeChannel(channel);
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

  async loadReturnRequests(): Promise<void> {
    if (this.returnsLoadInFlight) {
      return;
    }

    this.returnsLoadInFlight = true;
    this.isLoadingReturns.set(true);
    this.returnErrorMessage.set('');

    try {
      this.returnRequests.set(await this.returnRequestsService.getReturnRequests());
    } catch (error: any) {
      console.error('[Returns] Error loading return requests', {
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });
      this.returnRequests.set([]);
      this.returnErrorMessage.set('No fue posible cargar las devoluciones.');
    } finally {
      this.returnsLoadInFlight = false;
      this.isLoadingReturns.set(false);
    }
  }

  setActiveTab(tab: 'orders' | 'returns'): void {
    this.activeTab.set(tab);
    if (tab === 'returns' && !this.returnRequests().length) {
      void this.loadReturnRequests();
    }
  }

  reloadActiveTab(): Promise<void> {
    return this.activeTab() === 'returns'
      ? this.loadReturnRequests()
      : this.loadOrders();
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedStatus.set('');
  }

  clearReturnFilters(): void {
    this.returnSearchQuery.set('');
    this.selectedReturnStatus.set('');
    this.selectedReturnReason.set('');
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

    return statusMap[status] ?? { label: 'Borrador', variant: 'neutral' };
  }

  getItemsCount(order: Order): number {
    return order.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  getCompactItemNames(order: Order): string {
    if (!order.items || order.items.length === 0) return 'Sin artículos';
    const firstItem = order.items[0].productName;
    const remainingCount = order.items.length - 1;
    if (remainingCount > 0) {
      return `${firstItem} y ${remainingCount} más`;
    }
    return firstItem;
  }

  getReturnStatusBadge(status: ReturnRequestStatus): { label: string; variant: BadgeVariant } {
    return {
      label: RETURN_REQUEST_STATUS_LABELS[status],
      variant: RETURN_REQUEST_STATUS_VARIANTS[status],
    };
  }

  getReturnReasonLabel(reason: ReturnReasonType): string {
    return RETURN_REASON_LABELS[reason];
  }

  getReturnItemsCount(request: ReturnRequest): number {
    return request.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  getReturnOrderFolio(request: ReturnRequest): string {
    return request.order?.folio ?? 'Pedido no disponible';
  }

  getReturnClientName(request: ReturnRequest): string {
    return request.client?.businessName ?? request.order?.clientNameSnapshot ?? 'Cliente no disponible';
  }
}



