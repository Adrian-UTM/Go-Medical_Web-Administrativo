import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { Client } from '../../../../core/models/client.model';
import { ProductCategory } from '../../../../models/product.model';
import { Order, OrderStatus } from '../../../../models/order.model';
import { OrderSupabaseService } from '../../services/order.supabase.service';

@Component({
  selector: 'bc-order-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoaderComponent,
  ],
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.css',
})
export class OrderDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orderService = inject(OrderSupabaseService);

  readonly isLoading = signal(true);
  readonly order = signal<Order | null>(null);
  readonly client = signal<Client | null>(null);
  readonly actionMessage = signal('');
  readonly isCanceling = signal(false);

  constructor() {
    void this.loadOrder();
  }

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Pedidos', routerLink: '/pedidos' },
      { label: this.order()?.folio ?? 'Detalle' },
    ];
  }

  async loadOrder(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');

    if (!id) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);

    try {
      const order = await this.orderService.getOrderById(id);

      if (!order) {
        this.order.set(null);
        this.client.set(null);
        return;
      }

      this.order.set(order);
      this.client.set(await this.orderService.getClientById(order.clientId) ?? null);
    } catch (error) {
      this.order.set(null);
      this.client.set(null);
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible cargar el pedido.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async markAsPaid(): Promise<void> {
    if (!this.canMarkAsPaid()) {
      return;
    }

    await this.updateStatus(OrderStatus.Paid, 'Pedido marcado como pagado.');
  }

  async markAsShipped(): Promise<void> {
    if (!this.canMarkAsShipped()) {
      return;
    }

    await this.updateStatus(OrderStatus.Shipped, 'Pedido marcado como enviado.');
  }

  async cancelOrder(): Promise<void> {
    const currentOrder = this.order();
    if (!currentOrder) {
      return;
    }

    const confirmed = window.confirm(`Se cancelara el pedido ${currentOrder.folio}. El pedido permanecera en el historial con estado cancelado.`);
    if (!confirmed) {
      return;
    }

    await this.updateStatus(OrderStatus.Canceled, 'El pedido fue cancelado correctamente.');
  }

  async cancelOrderFromAction(): Promise<void> {
    const currentOrder = this.order();
    if (!currentOrder || this.isCanceling() || this.isCanceledStatus(String(currentOrder.status))) {
      return;
    }

    const confirmed = window.confirm(`Se cancelara el pedido ${currentOrder.folio}. El pedido permanecera visible en el historial.`);
    if (!confirmed) {
      return;
    }

    this.isCanceling.set(true);
    this.actionMessage.set('');

    try {
      const updatedOrder = await this.orderService.cancelOrder(currentOrder.id);
      if (updatedOrder) {
        this.order.set(updatedOrder);
      }
      this.actionMessage.set('El pedido fue cancelado correctamente.');
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'No se pudo cancelar el pedido.');
    } finally {
      this.isCanceling.set(false);
    }
  }

  printOrder(): void {
    this.actionMessage.set('La impresión estará disponible próximamente.');
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

  getCategoryLabel(category: ProductCategory): string {
    const labels: Record<string, string> = {
      [ProductCategory.EquipoMedico]: 'Equipo medico',
      [ProductCategory.UltrasonidoHumano]: 'Ultrasonido humano',
      [ProductCategory.UltrasonidoVeterinario]: 'Ultrasonido veterinario',
      [ProductCategory.Consumible]: 'Consumibles',
      [ProductCategory.Refaccion]: 'Refacciones',
      [ProductCategory.Accesorio]: 'Accesorios',
      [ProductCategory.Servicio]: 'Servicios',
      [ProductCategory.UltrasoundVet]: 'Ultrasonido veterinario',
      [ProductCategory.UltrasoundHuman]: 'Ultrasonido humano',
      [ProductCategory.Consumables]: 'Consumibles',
      [ProductCategory.SpareParts]: 'Refacciones',
      [ProductCategory.Services]: 'Servicios',
    };

    return labels[category] ?? 'Sin categoria';
  }

  getShippingAddress(): string {
    if (!this.client()) {
      return 'Direccion no disponible';
    }

    const currentClient = this.client()!;
    return currentClient.formattedShippingAddress
      || currentClient.formattedBillingAddress
      || `${currentClient.shippingAddress || currentClient.address}, ${currentClient.city}, ${currentClient.state}${currentClient.country ? `, ${currentClient.country}` : ''}`;
  }

  getUnitsCount(order: Order): number {
    return order.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  canMarkAsPaid(): boolean {
    const status = this.currentStatusKey();
    return !this.isCanceledStatus(status) && status !== OrderStatus.Paid;
  }

  canMarkAsShipped(): boolean {
    const status = this.currentStatusKey();
    return !this.isCanceledStatus(status) && !['shipped', 'delivered', 'completed'].includes(status);
  }

  canCancelOrder(): boolean {
    return !this.isCanceledStatus(this.currentStatusKey());
  }

  canRegisterReturn(): boolean {
    return ['paid', 'shipped', 'delivered', 'completed'].includes(this.currentStatusKey());
  }

  private currentStatusKey(): string {
    return String(this.order()?.status ?? '').trim().toLowerCase();
  }

  private isCanceledStatus(status: string): boolean {
    return ['canceled', 'cancelled'].includes(status);
  }

  private async updateStatus(status: OrderStatus, message: string): Promise<void> {
    if (!this.order()) {
      return;
    }

    try {
      const updatedOrder = await this.orderService.updateOrderStatus(this.order()!.id, status);
      if (!updatedOrder) {
        return;
      }

      this.order.set(updatedOrder);
      this.actionMessage.set(message);
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible actualizar el estado del pedido.');
    }
  }
}



