import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { startWith } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { Product } from '../../../../models/product.model';
import {
  InventoryStock,
  MovementType,
} from '../../../../models/inventory.model';
import { InventoryMockService } from '../../services/inventory.mock.service';

@Component({
  selector: 'bc-inventory-adjustment-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    LoaderComponent,
    CustomSelectComponent,
  ],
  templateUrl: './inventory-adjustment-form.component.html',
  styleUrl: './inventory-adjustment-form.component.css',
})
export class InventoryAdjustmentFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inventoryService = inject(InventoryMockService);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly products = signal<Product[]>([]);
  readonly currentStock = signal<InventoryStock | null>(null);
  readonly projectedStock = signal<number | null>(null);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly selectedProduct = signal<Product | null>(null);

  readonly movementTypeOptions = [
    { value: MovementType.InitialLoad, label: 'Carga inicial' },
    { value: MovementType.Entry, label: 'Entrada' },
    { value: MovementType.Exit, label: 'Salida' },
    { value: MovementType.Adjustment, label: 'Ajuste' },
  ];

  readonly productOptions = computed(() =>
    this.products().map(product => ({
      value: product.id,
      label: `${product.sku} · ${product.name}`,
    }))
  );

  readonly form = this.fb.group({
    productId: ['', Validators.required],
    movementType: [MovementType.Entry, Validators.required],
    quantity: [1, [Validators.required]],
    notes: ['', Validators.maxLength(500)],
  });

  constructor() {
    this.form.valueChanges
      .pipe(
        startWith(this.form.getRawValue()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => void this.syncPreview());

    void this.initialize();
  }

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Inventario', routerLink: '/inventario' },
      { label: 'Registrar movimiento' },
    ];
  }

  get quantityHint(): string {
    const movementType = this.form.get('movementType')?.value;

    if (movementType === MovementType.Adjustment) {
      return 'Para ajuste puedes capturar un valor positivo o negativo.';
    }

    if (movementType === MovementType.InitialLoad) {
      return 'Usa carga inicial para productos del catalogo que aun no tienen existencias registradas.';
    }

    return 'Captura un valor positivo. El sistema aplicara la direccion del movimiento.';
  }

  get isInitialLoadSelected(): boolean {
    return this.form.get('movementType')?.value === MovementType.InitialLoad;
  }

  get hasSelectedProductWithoutStock(): boolean {
    return !!this.selectedProduct() && !this.currentStock();
  }

  get projectedUnit(): string {
    return this.currentStock()?.unit ?? 'unidad';
  }

  get projectedWarehouse(): string {
    return this.currentStock()?.warehouseName ?? 'Almacen General';
  }

  get emptyPreviewMessage(): string {
    if (this.hasSelectedProductWithoutStock) {
      return 'Este producto existe en el catalogo pero aun no tiene stock registrado. Puedes usar una carga inicial para darlo de alta en inventario.';
    }

    return 'Selecciona un producto para visualizar el stock actual y el resultado esperado.';
  }

  get projectedStockInvalid(): boolean {
    return this.projectedStock() !== null && this.projectedStock()! < 0;
  }

  async initialize(): Promise<void> {
    this.isLoading.set(true);
    this.products.set(await this.inventoryService.getInventoryProducts());

    const productId = this.route.snapshot.queryParamMap.get('productId');
    if (productId) {
      this.form.patchValue({ productId }, { emitEvent: true });
    }

    this.isLoading.set(false);
    await this.syncPreview();
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Completa los campos requeridos para registrar el ajuste.');
      this.successMessage.set('');
      return;
    }

    if (this.projectedStockInvalid) {
      this.errorMessage.set('El movimiento no puede dejar stock negativo.');
      this.successMessage.set('');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const movement = await this.inventoryService.registerManualMovement({
        productId: this.form.get('productId')?.value ?? '',
        movementType: this.form.get('movementType')?.value ?? MovementType.Entry,
        quantity: Number(this.form.get('quantity')?.value ?? 0),
        notes: this.form.get('notes')?.value ?? '',
        createdBy: 'Administrador Go Medical',
      });

      await this.refreshCurrentStock(movement.productId);
      this.projectedStock.set(this.currentStock()?.currentStock ?? 0);
      this.successMessage.set(`Movimiento registrado correctamente. Stock resultante: ${movement.resultingStock}.`);
      this.form.patchValue({
        movementType: MovementType.Entry,
        quantity: 1,
        notes: '',
      }, { emitEvent: true });
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible registrar el movimiento.');
      this.successMessage.set('');
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

  private async syncPreview(): Promise<void> {
    const productId = this.form.get('productId')?.value ?? '';
    const movementType = this.form.get('movementType')?.value ?? MovementType.Entry;
    const quantity = Number(this.form.get('quantity')?.value ?? 0);

    this.errorMessage.set('');
    this.selectedProduct.set(this.products().find(product => product.id === productId) ?? null);

    if (!productId) {
      this.currentStock.set(null);
      this.projectedStock.set(null);
      return;
    }

    await this.refreshCurrentStock(productId);
    this.projectedStock.set(this.inventoryService.getProjectedStock(productId, movementType, quantity));
  }

  private async refreshCurrentStock(productId: string): Promise<void> {
    this.currentStock.set(await this.inventoryService.getStockByProductId(productId) ?? null);
  }
}

