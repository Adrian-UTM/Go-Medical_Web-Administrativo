import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { startWith } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { Client } from '../../../../core/models/client.model';
import { Product, ProductCategory } from '../../../../models/product.model';
import {
  DEFAULT_ORDER_TAX_PCT,
  Order,
  OrderItem,
  OrderItemDraft,
  OrderStatus,
  OrderTotals,
  OrderUpsertPayload,
} from '../../../../models/order.model';
import { OrderSupabaseService } from '../../services/order.supabase.service';

@Component({
  selector: 'bc-order-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    LoaderComponent,
    CustomSelectComponent,
  ],
  templateUrl: './order-form.component.html',
  styleUrl: './order-form.component.css',
})
export class OrderFormComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly orderService = inject(OrderSupabaseService);

  readonly isEditMode = signal(false);
  readonly isLoadingData = signal(true);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly clients = signal<Client[]>([]);
  readonly products = signal<Product[]>([]);
  readonly selectedClient = signal<Client | null>(null);
  readonly totals = signal<OrderTotals>({ subtotal: 0, tax: 0, total: 0 });

  orderId: string | null = null;

  readonly statusOptions = [
    { value: OrderStatus.Draft, label: 'Borrador' },
    { value: OrderStatus.PendingReview, label: 'Pendiente de revision' },
    { value: OrderStatus.PendingPayment, label: 'Pendiente de pago' },
    { value: OrderStatus.Paid, label: 'Pagado' },
    { value: OrderStatus.Processing, label: 'En proceso' },
    { value: OrderStatus.Shipped, label: 'Enviado' },
    { value: OrderStatus.Delivered, label: 'Entregado' },
    { value: OrderStatus.Canceled, label: 'Cancelado' },
  ];

  readonly clientOptions = computed(() =>
    this.clients().map(client => ({
      value: client.id,
      label: client.tradeName
        ? `${client.businessName} (${client.tradeName})`
        : client.businessName,
    }))
  );

  readonly productOptions = computed(() =>
    this.products().map(product => ({
      value: product.id,
      label: `${product.sku} · ${product.name}`,
    }))
  );

  readonly form = this.fb.group({
    clientId: ['', Validators.required],
    clientNameSnapshot: [''],
    status: [OrderStatus.Draft, Validators.required],
    taxExempt: [false],
    taxPct: [DEFAULT_ORDER_TAX_PCT, [Validators.required, Validators.min(0)]],
    notes: ['', Validators.maxLength(800)],
    items: this.fb.array([]),
  });

  constructor() {
    this.form.valueChanges
      .pipe(
        startWith(this.form.getRawValue()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.recalculateTotals());

    void this.initialize();
  }

  get pageTitle(): string {
    return this.isEditMode() ? 'Editar pedido' : 'Nuevo pedido';
  }

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Pedidos', routerLink: '/pedidos' },
      { label: this.pageTitle },
    ];
  }

  get itemsArray(): FormArray {
    return this.form.get('items') as FormArray;
  }

  private async initialize(): Promise<void> {
    this.orderId = this.route.snapshot.paramMap.get('id');
    const isEditing = !!this.orderId && this.route.snapshot.url.some(segment => segment.path === 'editar');
    this.isEditMode.set(isEditing);

    try {
      const [clients, products] = await Promise.all([
        this.orderService.getActiveClients(),
        this.orderService.getAvailableProducts(),
      ]);

      this.clients.set(clients);
      this.products.set(products);

      if (isEditing && this.orderId) {
        await this.loadOrder(this.orderId);
      } else {
        this.addOrderLine();
      }
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible preparar el formulario del pedido.');
    } finally {
      this.isLoadingData.set(false);
    }
  }

  async loadOrder(id: string): Promise<void> {
    const order = await this.orderService.getOrderById(id);

    if (!order) {
      await this.router.navigate(['/pedidos']);
      return;
    }

    this.form.patchValue({
      clientId: order.clientId,
      clientNameSnapshot: order.clientNameSnapshot,
      status: order.status,
      taxExempt: order.taxExempt,
      taxPct: order.taxPct,
      notes: order.notes,
    }, { emitEvent: false });

    this.syncSelectedClient(order.clientId, order.clientNameSnapshot);

    this.itemsArray.clear();
    if (order.items.length > 0) {
      order.items.forEach(item => this.addOrderLine(item));
    } else {
      this.addOrderLine();
    }
    this.recalculateTotals();
  }

  addOrderLine(item?: Partial<OrderItem>): void {
    const lineGroup = this.fb.group({
      productId: [item?.productId ?? '', Validators.required],
      sku: [item?.sku ?? ''],
      productName: [item?.productName ?? ''],
      productCategory: [item?.productCategory ?? ''],
      quantity: [item?.quantity ?? 1, [Validators.required, Validators.min(1)]],
      unitPrice: [item?.unitPrice ?? 0, [Validators.required, Validators.min(0)]],
      totalLinePrice: [item?.totalLinePrice ?? 0],
    });

    lineGroup.get('productId')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(productId => {
        this.syncLineProduct(lineGroup, String(productId ?? ''));
      });

    this.itemsArray.push(lineGroup);
    this.recalculateTotals();
  }

  removeOrderLine(index: number): void {
    this.itemsArray.removeAt(index);

    if (this.itemsArray.length === 0) {
      this.addOrderLine();
      return;
    }

    this.recalculateTotals();
  }

  onClientSelected(clientId: string): void {
    this.syncSelectedClient(clientId);
  }

  onProductSelected(index: number, productId: string): void {
    const lineGroup = this.itemsArray.at(index) as FormGroup;
    this.syncLineProduct(lineGroup, productId);
  }

  private syncLineProduct(lineGroup: FormGroup, productId: string): void {
    const product = this.products().find(item => item.id === productId);

    if (!product) {
      lineGroup.patchValue({
        productId,
        sku: '',
        productName: '',
        productCategory: '',
        unitPrice: 0,
        totalLinePrice: 0,
      }, { emitEvent: false });
      this.recalculateTotals();
      return;
    }

    lineGroup.patchValue({
      productId,
      sku: product.sku,
      productName: product.name,
      productCategory: product.category,
      unitPrice: product.price_mxn ?? product.unit_price_mxn ?? 0,
    }, { emitEvent: false });

    this.recalculateTotals();
  }

  async onSubmit(): Promise<void> {
    const canSaveBaseOrder = this.isEditMode()
      ? this.isBaseOrderDataValid()
      : this.form.valid;

    if (!canSaveBaseOrder) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Completa los campos requeridos antes de guardar el pedido.');
      return;
    }

    const payload = this.buildPayload();
    if (!this.isEditMode() && !payload.items.length) {
      this.errorMessage.set('Agrega al menos un concepto valido al pedido.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');

    try {
      const savedOrder = this.isEditMode() && this.orderId
        ? await this.orderService.updateOrder(this.orderId, payload)
        : await this.orderService.createOrder(payload);

      if (!savedOrder) {
        this.errorMessage.set('No fue posible guardar el pedido.');
        return;
      }

      await this.router.navigate(['/pedidos', savedOrder.id]);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Ocurrio un error al guardar el pedido. Intenta nuevamente.');
    } finally {
      this.isSaving.set(false);
    }
  }

  hasError(controlName: string, errorName?: string): boolean {
    const control = this.form.get(controlName);
    if (!control || !(control.touched || control.dirty)) {
      return false;
    }

    return errorName ? control.hasError(errorName) : control.invalid;
  }

  hasLineError(index: number, controlName: string, errorName?: string): boolean {
    const group = this.itemsArray.at(index) as FormGroup;
    const control = group.get(controlName);

    if (!control || !(control.touched || control.dirty)) {
      return false;
    }

    return errorName ? control.hasError(errorName) : control.invalid;
  }

  getLineCategory(index: number): string {
    const group = this.itemsArray.at(index) as FormGroup;
    const category = group.get('productCategory')?.value as ProductCategory | '';
    return category ? this.getCategoryLabel(category) : 'Sin categoria';
  }

  getLineSubtotal(index: number): number {
    const group = this.itemsArray.at(index) as FormGroup;
    return Number(group.get('totalLinePrice')?.value ?? 0);
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

  private syncSelectedClient(clientId: string, clientNameSnapshot?: string): void {
    const client = this.clients().find(item => item.id === clientId) ?? null;
    this.selectedClient.set(client);
    this.form.patchValue({
      clientNameSnapshot: clientNameSnapshot ?? client?.businessName ?? '',
    }, { emitEvent: false });
  }

  private recalculateTotals(): void {
    const draftItems = this.itemsArray.controls.map(control => {
      const group = control as FormGroup;
      const quantity = Math.max(1, Number(group.get('quantity')?.value) || 1);
      const unitPrice = Number(group.get('unitPrice')?.value) || 0;
      const totalLinePrice = this.roundCurrency(quantity * unitPrice);

      group.patchValue({
        quantity,
        totalLinePrice,
      }, { emitEvent: false });

      return {
        productId: String(group.get('productId')?.value ?? ''),
        sku: String(group.get('sku')?.value ?? ''),
        productName: String(group.get('productName')?.value ?? ''),
        productCategory: (group.get('productCategory')?.value ?? '') as ProductCategory,
        quantity,
        unitPrice,
      } satisfies OrderItemDraft;
    });

    const taxPct = Number(this.form.get('taxPct')?.value ?? DEFAULT_ORDER_TAX_PCT);
    const taxExempt = !!this.form.get('taxExempt')?.value;
    this.totals.set(this.orderService.calculateTotals(draftItems, taxPct, taxExempt));
  }

  private isBaseOrderDataValid(): boolean {
    const requiredControls = ['clientId', 'status', 'taxPct'];
    return requiredControls.every(controlName => this.form.get(controlName)?.valid);
  }

  private buildPayload(): OrderUpsertPayload {
    const rawValue = this.form.getRawValue();
    const items = this.itemsArray.controls
      .map(control => this.buildDraftItemFromGroup(control as FormGroup))
      .filter((item): item is OrderItemDraft => !!item);

    return {
      clientId: rawValue.clientId ?? '',
      clientNameSnapshot: rawValue.clientNameSnapshot ?? '',
      status: rawValue.status ?? OrderStatus.Draft,
      taxPct: Number(rawValue.taxPct ?? DEFAULT_ORDER_TAX_PCT),
      taxExempt: !!rawValue.taxExempt,
      notes: rawValue.notes ?? '',
      items,
    };
  }

  private buildDraftItemFromGroup(group: FormGroup): OrderItemDraft | null {
    const rawProductId = String(group.get('productId')?.value ?? '').trim();
    const rawSku = String(group.get('sku')?.value ?? '').trim();
    const rawProductName = String(group.get('productName')?.value ?? '').trim();
    const product = this.products().find(candidate =>
      candidate.id === rawProductId
      || (!!rawSku && candidate.sku === rawSku)
      || (!!rawProductName && candidate.name === rawProductName)
    );

    const productId = rawProductId || product?.id || '';
    if (!productId) {
      return null;
    }

    const quantity = Math.max(1, Number(group.get('quantity')?.value) || 1);
    const unitPrice = Number(group.get('unitPrice')?.value ?? product?.price_mxn ?? product?.unit_price_mxn ?? 0);

    return {
      productId,
      sku: rawSku || product?.sku || '',
      productName: rawProductName || product?.name || '',
      productCategory: (group.get('productCategory')?.value || product?.category || '') as ProductCategory,
      quantity,
      unitPrice,
    };
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}



