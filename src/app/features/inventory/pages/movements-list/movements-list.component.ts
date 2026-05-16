import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { Product, ProductCategory } from '../../../../models/product.model';
import { InventoryMockService } from '../../services/inventory.mock.service';
import { InventoryMovement, MovementType, ReferenceType } from '../../../../models/inventory.model';

@Component({
  selector: 'bc-movements-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DatePipe,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoaderComponent,
    EmptyStateComponent,
    CustomSelectComponent,
  ],
  templateUrl: './movements-list.component.html',
  styleUrl: './movements-list.component.css',
})
export class MovementsListComponent {
  private readonly inventoryService = inject(InventoryMockService);
  private readonly route = inject(ActivatedRoute);

  readonly isLoading = signal(true);
  readonly movements = signal<InventoryMovement[]>([]);
  readonly products = signal<Product[]>([]);
  readonly selectedMovementType = signal<MovementType | ''>('');
  readonly selectedProductId = signal('');
  readonly selectedCategory = signal<ProductCategory | ''>('');
  readonly sortDirection = signal<'asc' | 'desc'>('desc');

  readonly movementTypeOptions = [
    { value: '', label: 'Todos los movimientos' },
    { value: MovementType.InitialLoad, label: 'Carga inicial' },
    { value: MovementType.Entry, label: 'Entrada' },
    { value: MovementType.Exit, label: 'Salida' },
    { value: MovementType.Adjustment, label: 'Ajuste' },
    { value: MovementType.OrderReserve, label: 'Reserva de pedido' },
    { value: MovementType.OrderDiscount, label: 'Descuento por pedido' },
    { value: MovementType.Return, label: 'Devolucion' },
    { value: MovementType.ServiceUsage, label: 'Uso en servicio' },
  ];

  readonly categoryOptions = [
    { value: '', label: 'Todas las categorias' },
    { value: ProductCategory.UltrasoundVet, label: 'Ultrasonido veterinario' },
    { value: ProductCategory.UltrasoundHuman, label: 'Ultrasonido humano' },
    { value: ProductCategory.Consumables, label: 'Consumibles' },
    { value: ProductCategory.SpareParts, label: 'Refacciones' },
  ];

  readonly sortOptions = [
    { value: 'desc', label: 'Mas recientes primero' },
    { value: 'asc', label: 'Mas antiguos primero' },
  ];

  readonly productOptions = computed(() => [
    { value: '', label: 'Todos los productos' },
    ...this.products().map(product => ({
      value: product.id,
      label: `${product.sku} · ${product.name}`,
    })),
  ]);

  readonly filteredMovements = computed(() => {
    const movementType = this.selectedMovementType();
    const productId = this.selectedProductId();
    const category = this.selectedCategory();
    const sortDirection = this.sortDirection();

    const result = this.movements().filter(movement => {
      const matchesType = !movementType || movement.movementType === movementType;
      const matchesProduct = !productId || movement.productId === productId;
      const matchesCategory = !category || movement.productCategory === category;
      return matchesType && matchesProduct && matchesCategory;
    });

    return [...result].sort((a, b) => {
      const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDirection === 'asc' ? delta : -delta;
    });
  });

  readonly hasActiveFilters = computed(() =>
    !!this.selectedMovementType() || !!this.selectedProductId() || !!this.selectedCategory() || this.sortDirection() !== 'desc'
  );

  constructor() {
    void this.initialize();
  }

  async initialize(): Promise<void> {
    this.isLoading.set(true);

    const [products, movements] = await Promise.all([
      this.inventoryService.getInventoryProducts(),
      this.inventoryService.getMovements(),
    ]);

    this.products.set(products);
    this.movements.set(movements);

    const productId = this.route.snapshot.queryParamMap.get('productId');
    if (productId) {
      this.selectedProductId.set(productId);
    }

    this.isLoading.set(false);
  }

  clearFilters(): void {
    this.selectedMovementType.set('');
    this.selectedProductId.set('');
    this.selectedCategory.set('');
    this.sortDirection.set('desc');
  }

  getCategoryLabel(category: ProductCategory): string {
    const labels: Record<ProductCategory, string> = {
      [ProductCategory.UltrasoundVet]: 'Ultrasonido veterinario',
      [ProductCategory.UltrasoundHuman]: 'Ultrasonido humano',
      [ProductCategory.Consumables]: 'Consumibles',
      [ProductCategory.SpareParts]: 'Refacciones',
      [ProductCategory.Services]: 'Servicios',
    };

    return labels[category];
  }

  getMovementTypeLabel(type: MovementType): string {
    const labels: Record<MovementType, string> = {
      [MovementType.InitialLoad]: 'Carga inicial',
      [MovementType.Entry]: 'Entrada',
      [MovementType.Exit]: 'Salida',
      [MovementType.Adjustment]: 'Ajuste',
      [MovementType.OrderReserve]: 'Reserva de pedido',
      [MovementType.OrderDiscount]: 'Descuento por pedido',
      [MovementType.Return]: 'Devolucion',
      [MovementType.ServiceUsage]: 'Uso en servicio',
    };

    return labels[type];
  }

  getReferenceLabel(type: ReferenceType): string {
    const labels: Record<ReferenceType, string> = {
      [ReferenceType.Manual]: 'Manual',
      [ReferenceType.Order]: 'Pedido',
      [ReferenceType.Product]: 'Producto',
      [ReferenceType.Service]: 'Servicio',
      [ReferenceType.Inventory]: 'Inventario',
    };

    return labels[type];
  }

  getMovementBadge(type: MovementType): { label: string; variant: BadgeVariant } {
    const map: Record<MovementType, { label: string; variant: BadgeVariant }> = {
      [MovementType.InitialLoad]: { label: 'Carga inicial', variant: 'primary' },
      [MovementType.Entry]: { label: 'Entrada', variant: 'success' },
      [MovementType.Exit]: { label: 'Salida', variant: 'danger' },
      [MovementType.Adjustment]: { label: 'Ajuste', variant: 'info' },
      [MovementType.OrderReserve]: { label: 'Reserva', variant: 'warning' },
      [MovementType.OrderDiscount]: { label: 'Descuento', variant: 'danger' },
      [MovementType.Return]: { label: 'Devolucion', variant: 'success' },
      [MovementType.ServiceUsage]: { label: 'Servicio', variant: 'warning' },
    };

    return map[type];
  }
}
