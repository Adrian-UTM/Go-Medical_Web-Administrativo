import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { startWith } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { Product } from '../../../../models/product.model';
import { InventoryStock, MovementType } from '../../../../models/inventory.model';
import { InventorySupabaseService } from '../../services/inventory.supabase.service';
import { AuthService } from '../../../../core/services/auth.service';

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
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inventoryService = inject(InventorySupabaseService);
  private readonly authService = inject(AuthService);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly products = signal<Product[]>([]);
  readonly currentStock = signal<InventoryStock | null>(null);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly selectedProduct = signal<Product | null>(null);
  readonly minimumOnlyMode = signal(false);

  readonly productOptions = computed(() =>
    this.products().map(product => ({
      value: product.id,
      label: `${product.sku} · ${product.name}`,
    }))
  );

  readonly form = this.fb.group({
    productId: ['', Validators.required],
    movementType: ['entry', Validators.required],
    quantity: [null as number | null, [Validators.required, Validators.min(1)]],
    minStock: [null as number | null, [Validators.required, Validators.min(0)]],
  });

  readonly movementTypeOptions = [
    { value: 'entry', label: 'Entrada' },
    { value: 'exit', label: 'Salida' },
    { value: 'return', label: 'Devolución recibida' },
  ];

  constructor() {
    this.form.get('productId')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.syncPreview());

    void this.initialize();
  }

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Inventario', routerLink: '/inventario' },
      { label: this.minimumOnlyMode() ? 'Configurar stock mínimo' : 'Movimiento de inventario' },
    ];
  }

  get pageTitle(): string {
    return this.minimumOnlyMode() ? 'Configurar stock mínimo' : 'Registrar movimiento de inventario';
  }

  get pageSubtitle(): string {
    return this.minimumOnlyMode()
      ? 'Stock mínimo es una configuración del producto, no un movimiento de inventario.'
      : 'Registra entradas, salidas o devoluciones recibidas con impacto real en stock.';
  }

  get hasSelectedProductWithoutStock(): boolean {
    return !!this.selectedProduct() && !this.currentStock();
  }

  get projectedUnit(): string {
    return this.currentStock()?.unit ?? 'unidad';
  }

  get projectedWarehouse(): string {
    return this.currentStock()?.warehouseName ?? 'Almacén principal';
  }

  get emptyPreviewMessage(): string {
    if (this.hasSelectedProductWithoutStock) {
      return 'Este producto aún no tiene existencias registradas. Puedes realizar una Entrada inicial.';
    }
    return 'Selecciona un producto para visualizar el stock actual.';
  }

  get projectedStock(): number {
    const current = this.currentStock()?.currentStock ?? 0;
    if (this.minimumOnlyMode()) {
      return current;
    }

    const type = this.form.get('movementType')?.value;
    const qty = Number(this.form.get('quantity')?.value ?? 0);
    return type === 'exit' ? current - qty : current + qty;
  }

  get projectedStockInvalid(): boolean {
    return this.projectedStock < 0;
  }

  async initialize(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      this.products.set(await this.inventoryService.getInventoryProducts());

      const mode = this.route.snapshot.queryParamMap.get('mode');
      this.minimumOnlyMode.set(mode === 'min');
      this.syncQuantityValidators();

      const movementType = this.route.snapshot.queryParamMap.get('movementType');
      if (this.isMovementTypeOption(movementType)) {
        this.form.patchValue({ movementType }, { emitEvent: false });
      }

      const productId = this.route.snapshot.queryParamMap.get('productId');
      if (productId) {
        this.form.patchValue({ productId }, { emitEvent: true });
        await this.syncPreview();
      }
    } catch (error) {
      this.products.set([]);
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible preparar el formulario de inventario.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async syncPreview(): Promise<void> {
    const productId = this.form.get('productId')?.value;
    if (!productId) {
      this.selectedProduct.set(null);
      this.currentStock.set(null);
      return;
    }

    const product = this.products().find(p => p.id === productId) ?? null;
    this.selectedProduct.set(product);

    if (product) {
      try {
        const stock = await this.inventoryService.getStockByProductId(product.id);
        this.currentStock.set(stock ?? null);
        if (stock) {
          this.form.patchValue({ minStock: stock.minStock === 0 ? null : stock.minStock }, { emitEvent: false });
        }
      } catch (error) {
        console.error('Error syncing preview', error);
        this.currentStock.set(null);
      }
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.projectedStockInvalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Verifica los campos antes de continuar.');
      this.successMessage.set('');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const productId = this.form.get('productId')?.value ?? '';
      const minStock = Number(this.form.get('minStock')?.value ?? 0);
      const newStock = this.projectedStock;
      const typeValue = this.form.get('movementType')?.value as 'entry' | 'exit' | 'return';
      const movementType = typeValue === 'exit'
        ? MovementType.Exit
        : typeValue === 'return'
          ? MovementType.Return
          : MovementType.Entry;
      
      await this.inventoryService.updateStockLevels(
        productId,
        newStock,
        minStock,
        movementType,
        this.authService.currentUserId() ?? undefined
      );

      this.successMessage.set(this.minimumOnlyMode()
        ? 'Stock mínimo actualizado correctamente.'
        : 'Movimiento de inventario registrado correctamente.');
      
      setTimeout(() => {
        this.router.navigate(['/inventario']);
      }, 1500);

    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible actualizar el stock.');
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

  private isMovementTypeOption(value: string | null): value is 'entry' | 'exit' | 'return' {
    return value === 'entry' || value === 'exit' || value === 'return';
  }

  private syncQuantityValidators(): void {
    const quantityControl = this.form.get('quantity');
    if (!quantityControl) {
      return;
    }

    if (this.minimumOnlyMode()) {
      quantityControl.clearValidators();
      quantityControl.setValue(null, { emitEvent: false });
    } else {
      quantityControl.setValidators([Validators.required, Validators.min(1)]);
    }

    quantityControl.updateValueAndValidity({ emitEvent: false });
  }

}
