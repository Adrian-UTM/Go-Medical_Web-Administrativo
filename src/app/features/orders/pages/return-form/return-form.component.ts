import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { Order, OrderItem, OrderStatus } from '../../../../models/order.model';
import { RETURN_REASON_LABELS, ReturnReasonType, ReturnRequest } from '../../../../models/return-request.model';
import { OrderSupabaseService } from '../../services/order.supabase.service';
import { ReturnRequestsSupabaseService } from '../../services/return-requests.supabase.service';

interface ReturnFormLine {
  selected: boolean;
  orderItemId: string;
  productId: string;
  sku: string;
  productName: string;
  purchasedQuantity: number;
  returnQuantity: number;
  unitPrice: number;
}

@Component({
  selector: 'bc-return-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CurrencyPipe,
    PageHeaderComponent,
    LoaderComponent,
    CustomSelectComponent,
  ],
  templateUrl: './return-form.component.html',
  styleUrl: './return-form.component.css',
})
export class ReturnFormComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orderService = inject(OrderSupabaseService);
  private readonly returnRequestsService = inject(ReturnRequestsSupabaseService);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly order = signal<Order | null>(null);
  readonly openReturnRequest = signal<ReturnRequest | null>(null);
  readonly reason = signal<ReturnReasonType>(ReturnReasonType.DefectiveProduct);
  readonly customerComments = signal('');
  readonly adminNotes = signal('');
  readonly lines = signal<ReturnFormLine[]>([]);

  readonly reasonOptions = Object.values(ReturnReasonType).map(value => ({
    value,
    label: RETURN_REASON_LABELS[value],
  }));

  readonly selectedLines = computed(() => this.lines().filter(line => line.selected && line.returnQuantity > 0));
  readonly totalToReturn = computed(() =>
    this.selectedLines().reduce((sum, line) => sum + (line.returnQuantity * line.unitPrice), 0)
  );

  constructor() {
    void this.initialize();
  }

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Pedidos', routerLink: '/pedidos' },
      { label: this.order()?.folio ?? 'Pedido', routerLink: this.order() ? `/pedidos/${this.order()!.id}` : '/pedidos' },
      { label: 'Registrar devolucion' },
    ];
  }

  async initialize(): Promise<void> {
    const orderId = this.route.snapshot.paramMap.get('id');
    if (!orderId) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const [order, openReturn] = await Promise.all([
        this.orderService.getOrderById(orderId),
        this.returnRequestsService.getOpenReturnRequestForOrder(orderId),
      ]);

      this.order.set(order ?? null);
      this.openReturnRequest.set(openReturn ?? null);

      if (!order) {
        this.errorMessage.set('No fue posible cargar el pedido.');
        return;
      }

      this.lines.set(order.items.map(item => this.toFormLine(item)));

      if (!this.canCreateReturnForOrder(order)) {
        this.errorMessage.set('Este pedido no tiene un estado disponible para registrar devoluciones.');
      }
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible preparar la devolucion.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async submit(): Promise<void> {
    const currentOrder = this.order();
    if (!currentOrder || this.isSaving()) {
      return;
    }

    if (!this.canCreateReturnForOrder(currentOrder)) {
      this.errorMessage.set('Este pedido no tiene un estado disponible para registrar devoluciones.');
      return;
    }

    if (this.openReturnRequest()) {
      this.errorMessage.set('Ya existe una devolucion abierta para este pedido.');
      return;
    }

    const selected = this.selectedLines();
    if (!selected.length) {
      this.errorMessage.set('Selecciona al menos un producto para devolver.');
      return;
    }

    const invalidLine = selected.find(line => !line.orderItemId || line.returnQuantity > line.purchasedQuantity);
    if (invalidLine) {
      this.errorMessage.set('Revisa las cantidades: no puedes devolver mas de lo comprado.');
      return;
    }

    const payload = {
      orderId: currentOrder.id,
      clientId: currentOrder.clientId,
      reason: this.reason(),
      customerComments: this.customerComments(),
      adminNotes: this.adminNotes(),
      items: selected.map(line => ({
        orderItemId: line.orderItemId,
        productId: line.productId,
        productNameSnapshot: line.productName,
        skuSnapshot: line.sku,
        quantity: line.returnQuantity,
        unitPriceMxn: line.unitPrice,
      })),
    };

    this.isSaving.set(true);
    this.errorMessage.set('');

    try {
      const created = await this.returnRequestsService.createReturnRequest(payload);
      if (!created) {
        this.errorMessage.set('No fue posible registrar la devolucion.');
        return;
      }

      await this.router.navigate(['/pedidos/devoluciones', created.id]);
    } catch (error: any) {
      console.error('[Returns] Error creating return request', {
        payload,
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });
      this.errorMessage.set('No fue posible registrar la devolucion.');
    } finally {
      this.isSaving.set(false);
    }
  }

  canSubmit(): boolean {
    const currentOrder = this.order();
    return !!currentOrder && this.canCreateReturnForOrder(currentOrder) && !this.openReturnRequest();
  }

  canCreateReturnForOrder(order: Order): boolean {
    return [
      OrderStatus.Paid,
      OrderStatus.Shipped,
      OrderStatus.Delivered,
    ].includes(order.status);
  }

  clampQuantity(line: ReturnFormLine): void {
    line.returnQuantity = Math.min(line.purchasedQuantity, Math.max(1, Number(line.returnQuantity) || 1));
    this.lines.set([...this.lines()]);
  }

  updateLineQuantity(line: ReturnFormLine, value: number): void {
    line.returnQuantity = Math.min(line.purchasedQuantity, Math.max(1, Number(value) || 1));
    this.lines.set([...this.lines()]);
  }

  toggleLine(line: ReturnFormLine, selected: boolean): void {
    line.selected = selected;
    if (selected && line.returnQuantity < 1) {
      line.returnQuantity = 1;
    }
    this.lines.set([...this.lines()]);
  }

  private toFormLine(item: OrderItem): ReturnFormLine {
    return {
      selected: false,
      orderItemId: item.orderItemId ?? item.id ?? '',
      productId: item.productId,
      sku: item.sku,
      productName: item.productName,
      purchasedQuantity: item.quantity,
      returnQuantity: 1,
      unitPrice: item.unitPrice,
    };
  }
}
