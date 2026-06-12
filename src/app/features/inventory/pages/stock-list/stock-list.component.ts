import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ActionMenuComponent } from '../../../../shared/components/action-menu/action-menu.component';
import { ProductCategory } from '../../../../models/product.model';
import { InventorySupabaseService } from '../../services/inventory.supabase.service';
import { InventoryMovement, InventoryStock, InventoryStockStatus, MovementType } from '../../../../models/inventory.model';
import { PageVisibilityService } from '../../../../core/services/page-visibility.service';

@Component({
  selector: 'bc-stock-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoaderComponent,
    EmptyStateComponent,
    CustomSelectComponent,
    ActionMenuComponent,
  ],
  templateUrl: './stock-list.component.html',
  styleUrl: './stock-list.component.css',
})
export class StockListComponent implements OnInit {
  private readonly inventoryService = inject(InventorySupabaseService);
  private readonly pageVisibility = inject(PageVisibilityService);
  private readonly destroyRef = inject(DestroyRef);

  private loadInFlight = false;

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly stocks = signal<InventoryStock[]>([]);
  readonly movements = signal<InventoryMovement[]>([]);
  readonly searchQuery = signal('');
  readonly selectedCategory = signal<ProductCategory | ''>('');
  readonly selectedStockStatus = signal<InventoryStockStatus | ''>('');

  readonly categoryOptions = [
    { value: '', label: 'Todas las categorias' },
    { value: ProductCategory.EquipoMedico, label: 'Equipo medico' },
    { value: ProductCategory.UltrasonidoHumano, label: 'Ultrasonido humano' },
    { value: ProductCategory.UltrasonidoVeterinario, label: 'Ultrasonido veterinario' },
    { value: ProductCategory.Consumible, label: 'Consumibles' },
    { value: ProductCategory.Refaccion, label: 'Refacciones' },
    { value: ProductCategory.Accesorio, label: 'Accesorios' },
  ];

  readonly stockStatusOptions = [
    { value: '', label: 'Todos los estados' },
    { value: InventoryStockStatus.Normal, label: 'Normal' },
    { value: InventoryStockStatus.LowStock, label: 'Bajo stock' },
    { value: InventoryStockStatus.OutOfStock, label: 'Sin stock' },
  ];

  readonly visibleMovements = computed(() => this.movements().filter(movement => this.isVisibleMovement(movement)));

  readonly summaryCards = computed(() => {
    const stocks = this.stocks();
    const lowStock = stocks.filter(stock => this.inventoryService.getStockStatus(stock) === InventoryStockStatus.LowStock).length;
    const outOfStock = stocks.filter(stock => this.inventoryService.getStockStatus(stock) === InventoryStockStatus.OutOfStock).length;
    const monthMovements = this.visibleMovements().filter(movement => this.isCurrentMonth(movement.createdAt)).length;

    return [
      {
        label: 'Productos en inventario',
        value: stocks.length,
        hint: 'SKUs físicos activos',
        tone: 'teal',
        icon: 'box',
      },
      {
        label: 'Bajo stock',
        value: lowStock,
        hint: 'Requieren reposición',
        tone: 'warning',
        icon: 'warning',
      },
      {
        label: 'Sin stock',
        value: outOfStock,
        hint: 'Fuera de inventario',
        tone: 'danger',
        icon: 'out',
      },
      {
        label: 'Movimientos del mes',
        value: monthMovements,
        hint: this.visibleMovements().length ? 'Entradas, salidas y devoluciones' : 'No disponible',
        tone: 'info',
        icon: 'chart',
      },
    ];
  });

  readonly recentMovements = computed(() => this.visibleMovements().slice(0, 5));

  readonly lowStockCount = computed(() =>
    this.stocks().filter(stock => this.inventoryService.getStockStatus(stock) === InventoryStockStatus.LowStock).length
  );

  readonly outOfStockCount = computed(() =>
    this.stocks().filter(stock => this.inventoryService.getStockStatus(stock) === InventoryStockStatus.OutOfStock).length
  );

  readonly noMinStockCount = computed(() =>
    this.stocks().filter(stock => Number(stock.minStock) <= 0).length
  );

  readonly InventoryStockStatus = InventoryStockStatus;

  readonly filteredStocks = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const category = this.selectedCategory();
    const stockStatus = this.selectedStockStatus();

    return this.stocks().filter(stock => {
      // Excluir servicios (por seguridad, aunque el servicio de DB ya los filtra)
      if (stock.productCategory === ProductCategory.Servicio) return false;
      if (String(stock.unit).toLowerCase() === 'servicio') return false;

      const matchesQuery = !query || [
        stock.sku,
        stock.productName,
        stock.warehouseName,
        stock.brand ?? '',
        stock.model ?? ''
      ].some(value => value.toLowerCase().includes(query));

      const matchesCategory = !category || stock.productCategory === category;
      const matchesStatus = !stockStatus || this.inventoryService.getStockStatus(stock) === stockStatus;

      return matchesQuery && matchesCategory && matchesStatus;
    });
  });

  readonly hasActiveFilters = computed(() =>
    !!this.searchQuery().trim() || !!this.selectedCategory() || !!this.selectedStockStatus()
  );

  ngOnInit(): void {
    void this.loadStocks();

    this.pageVisibility.visible$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.loadStocks();
      });
  }

  async loadStocks(): Promise<void> {
    if (this.loadInFlight) {
      return;
    }

    this.loadInFlight = true;
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const [stocks, movements] = await Promise.all([
        this.inventoryService.getStocks(),
        this.inventoryService.getMovements(),
      ]);
      this.stocks.set(stocks);
      this.movements.set(movements);
    } catch (error) {
      this.stocks.set([]);
      this.movements.set([]);
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible cargar el inventario.');
    } finally {
      this.loadInFlight = false;
      this.isLoading.set(false);
    }
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedCategory.set('');
    this.selectedStockStatus.set('');
  }

  applyStockStatusFilter(status: InventoryStockStatus): void {
    this.selectedStockStatus.set(status);
  }

  get emptyStateTitle(): string {
    return this.errorMessage() ? 'Inventario no disponible' : 'Sin registros de inventario';
  }

  get emptyStateDescription(): string {
    if (this.errorMessage()) {
      return this.errorMessage();
    }

    return this.hasActiveFilters()
      ? 'No se encontraron existencias con los filtros aplicados.'
      : 'No hay existencias registradas para mostrar en este módulo.';
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

  getStockStatusBadge(stock: InventoryStock): { label: string; variant: BadgeVariant } {
    const status = this.inventoryService.getStockStatus(stock);
    const map: Record<InventoryStockStatus, { label: string; variant: BadgeVariant }> = {
      [InventoryStockStatus.Normal]: { label: 'Normal', variant: 'success' },
      [InventoryStockStatus.LowStock]: { label: 'Bajo stock', variant: 'warning' },
      [InventoryStockStatus.OutOfStock]: { label: 'Sin stock', variant: 'danger' },
    };

    return map[status];
  }

  getMovementLabel(type: MovementType): string {
    if (type === MovementType.Exit) {
      return 'Salida';
    }

    if (type === MovementType.Return) {
      return 'Devolución recibida';
    }

    return 'Entrada';
  }

  getMovementTone(movement: InventoryMovement): 'positive' | 'negative' | 'neutral' {
    if (movement.quantity > 0) return 'positive';
    if (movement.quantity < 0) return 'negative';
    return 'neutral';
  }

  getMovementQuantityLabel(movement: InventoryMovement): string {
    const quantity = Number(movement.quantity ?? 0);
    return `${quantity > 0 ? '+' : ''}${quantity}`;
  }

  private isCurrentMonth(value: string): boolean {
    const date = new Date(value);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  private isVisibleMovement(movement: InventoryMovement): boolean {
    const isPhysicalProduct = movement.productCategory !== ProductCategory.Servicio
      && movement.productCategory !== ProductCategory.Services;

    return isPhysicalProduct && [
      MovementType.InitialLoad,
      MovementType.Entry,
      MovementType.Exit,
      MovementType.Return,
    ].includes(movement.movementType);
  }
}
