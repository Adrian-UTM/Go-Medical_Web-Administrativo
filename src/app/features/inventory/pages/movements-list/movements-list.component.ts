import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { Product, ProductCategory } from '../../../../models/product.model';
import { InventorySupabaseService } from '../../services/inventory.supabase.service';
import { InventoryMovement, MovementType, ReferenceType } from '../../../../models/inventory.model';

@Component({
  selector: 'bc-movements-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DatePipe,
    StatusBadgeComponent,
    LoaderComponent,
    EmptyStateComponent,
    CustomSelectComponent,
  ],
  templateUrl: './movements-list.component.html',
  styleUrl: './movements-list.component.css',
})
export class MovementsListComponent {
  private readonly inventoryService = inject(InventorySupabaseService);
  private readonly route = inject(ActivatedRoute);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly movements = signal<InventoryMovement[]>([]);
  readonly products = signal<Product[]>([]);
  readonly selectedMovementType = signal<MovementType | ''>('');
  readonly selectedProductId = signal('');
  readonly selectedCategory = signal<ProductCategory | ''>('');
  readonly sortDirection = signal<'asc' | 'desc'>('desc');

  readonly movementTypeOptions = [
    { value: '', label: 'Todos los movimientos' },
    { value: MovementType.Entry, label: 'Entrada' },
    { value: MovementType.Exit, label: 'Salida' },
    { value: MovementType.Return, label: 'Devolución recibida' },
  ];

  readonly categoryOptions = [
    { value: '', label: 'Todas las categorias' },
    { value: ProductCategory.EquipoMedico, label: 'Equipo medico' },
    { value: ProductCategory.UltrasonidoHumano, label: 'Ultrasonido humano' },
    { value: ProductCategory.UltrasonidoVeterinario, label: 'Ultrasonido veterinario' },
    { value: ProductCategory.Consumible, label: 'Consumibles' },
    { value: ProductCategory.Refaccion, label: 'Refacciones' },
    { value: ProductCategory.Accesorio, label: 'Accesorios' },
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
      const normalizedType = this.getNormalizedMovementType(movement.movementType);
      if (!normalizedType) {
        return false;
      }

      const matchesType = !movementType || normalizedType === movementType;
      const matchesProduct = !productId || movement.productId === productId;
      const matchesCategory = !category || movement.productCategory === category;
      const isPhysicalProduct = movement.productCategory !== ProductCategory.Servicio
        && movement.productCategory !== ProductCategory.Services;
      return isPhysicalProduct && matchesType && matchesProduct && matchesCategory;
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
    this.errorMessage.set('');

    try {
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
    } catch (error) {
      this.products.set([]);
      this.movements.set([]);
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible cargar los movimientos de inventario.');
    } finally {
      this.isLoading.set(false);
    }
  }

  clearFilters(): void {
    this.selectedMovementType.set('');
    this.selectedProductId.set('');
    this.selectedCategory.set('');
    this.sortDirection.set('desc');
  }

  get emptyStateDescription(): string {
    if (this.errorMessage()) {
      return this.errorMessage();
    }

    return this.hasActiveFilters()
      ? 'No existen movimientos que coincidan con los filtros seleccionados.'
      : 'No hay movimientos de inventario registrados.';
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

  getOriginLabel(movement: InventoryMovement): string {
    if (movement.movementType === MovementType.Return) {
      return 'Devolución';
    }

    const labels: Record<ReferenceType, string> = {
      [ReferenceType.Manual]: 'Manual',
      [ReferenceType.Order]: 'Pedido',
      [ReferenceType.Product]: 'Sistema',
      [ReferenceType.Service]: 'Sistema',
      [ReferenceType.Inventory]: 'Sistema',
    };

    return labels[movement.referenceType] ?? 'Manual';
  }

  getUserLabel(movement: InventoryMovement): string {
    const createdBy = movement.createdBy?.trim();
    if (!createdBy || this.isUuid(createdBy)) {
      return 'Usuario no disponible';
    }

    return createdBy;
  }

  getNotePreview(movement: InventoryMovement): string {
    const note = this.getFullNote(movement);
    if (!note) {
      return '—';
    }

    return note.length > 34 ? `${note.slice(0, 31).trim()}...` : note;
  }

  getFullNote(movement: InventoryMovement): string {
    return movement.notes?.trim() ?? '';
  }

  hasLongNote(movement: InventoryMovement): boolean {
    return this.getFullNote(movement).length > 34;
  }

  showFullNote(movement: InventoryMovement): void {
    const note = this.getFullNote(movement);
    if (!note) {
      return;
    }

    window.alert(note);
  }

  getMovementBadge(type: MovementType): { label: string; variant: BadgeVariant } {
    const normalizedType = this.getNormalizedMovementType(type);
    if (normalizedType === MovementType.Exit) {
      return { label: 'Salida', variant: 'danger' };
    }

    if (normalizedType === MovementType.Return) {
      return { label: 'Devolución recibida', variant: 'info' };
    }

    return { label: 'Entrada', variant: 'success' };
  }

  getQuantityClass(movement: InventoryMovement): string {
    const normalizedType = this.getNormalizedMovementType(movement.movementType);
    if (normalizedType === MovementType.Exit || movement.quantity < 0) {
      return 'quantity-negative';
    }

    return 'quantity-positive';
  }

  private getNormalizedMovementType(type: MovementType): MovementType.Entry | MovementType.Exit | MovementType.Return | null {
    if (type === MovementType.InitialLoad || type === MovementType.Entry) {
      return MovementType.Entry;
    }

    if (type === MovementType.Exit) {
      return MovementType.Exit;
    }

    if (type === MovementType.Return) {
      return MovementType.Return;
    }

    return null;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}

