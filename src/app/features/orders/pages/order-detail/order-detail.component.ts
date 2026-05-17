import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
  private readonly orderService = inject(OrderSupabaseService);

  readonly isLoading = signal(true);
  readonly order = signal<Order | null>(null);
  readonly client = signal<Client | null>(null);
  readonly actionMessage = signal('');

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
    await this.updateStatus(OrderStatus.Paid, 'Pedido marcado como pagado.');
  }

  async markAsShipped(): Promise<void> {
    await this.updateStatus(OrderStatus.Shipped, 'Pedido marcado como enviado.');
  }

  printOrder(): void {
    this.actionMessage.set('La impresion real se conectara en una fase posterior del modulo documental.');
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
    return `${currentClient.shippingAddress || currentClient.address}, ${currentClient.city}, ${currentClient.state}`;
  }

  getUnitsCount(order: Order): number {
    return order.items.reduce((sum, item) => sum + item.quantity, 0);
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
