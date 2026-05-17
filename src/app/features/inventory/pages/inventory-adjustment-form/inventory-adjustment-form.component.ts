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
import { InventorySupabaseService } from '../../services/inventory.supabase.service';

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
  private readonly inventoryService = inject(InventorySupabaseService);

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
    return this.currentStock()?.warehouseName ?? 'Almacen general';
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
    this.errorMessage.set('');

    try {
      this.products.set(await this.inventoryService.getInventoryProducts());

      const productId = this.route.snapshot.queryParamMap.get('productId');
      if (productId) {
        this.form.patchValue({ productId }, { emitEvent: true });
      }

      await this.syncPreview();
    } catch (error) {
      this.products.set([]);
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible preparar el formulario de inventario.');
    } finally {
      this.isLoading.set(false);
    }
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
      this.projectedStock.set(movement.resultingStock);
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
    const baseStock = this.currentStock()?.currentStock ?? 0;
    this.projectedStock.set(this.calculateProjectedStock(baseStock, movementType, quantity));
  }

  private async refreshCurrentStock(productId: string): Promise<void> {
    this.currentStock.set(await this.inventoryService.getStockByProductId(productId) ?? null);
  }

  private calculateProjectedStock(currentStock: number, movementType: MovementType, quantity: number): number {
    const normalized = Math.abs(Number(quantity) || 0);

    if (movementType === MovementType.Adjustment) {
      return currentStock + (Number(quantity) || 0);
    }

    if (movementType === MovementType.Exit) {
      return currentStock - normalized;
    }

    return currentStock + normalized;
  }
}
