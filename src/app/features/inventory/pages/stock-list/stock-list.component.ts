import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ProductCategory } from '../../../../models/product.model';
import { InventorySupabaseService } from '../../services/inventory.supabase.service';
import { InventoryStock, InventoryStockStatus } from '../../../../models/inventory.model';

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
  ],
  templateUrl: './stock-list.component.html',
  styleUrl: './stock-list.component.css',
})
export class StockListComponent {
  private readonly inventoryService = inject(InventorySupabaseService);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly stocks = signal<InventoryStock[]>([]);
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
    { value: ProductCategory.Servicio, label: 'Servicios' },
  ];

  readonly stockStatusOptions = [
    { value: '', label: 'Todos los estados' },
    { value: InventoryStockStatus.Normal, label: 'Normal' },
    { value: InventoryStockStatus.LowStock, label: 'Bajo stock' },
    { value: InventoryStockStatus.OutOfStock, label: 'Sin stock' },
  ];

  readonly filteredStocks = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const category = this.selectedCategory();
    const stockStatus = this.selectedStockStatus();

    return this.stocks().filter(stock => {
      const matchesQuery = !query || [
        stock.sku,
        stock.productName,
        stock.warehouseName,
      ].some(value => value.toLowerCase().includes(query));

      const matchesCategory = !category || stock.productCategory === category;
      const matchesStatus = !stockStatus || this.inventoryService.getStockStatus(stock) === stockStatus;

      return matchesQuery && matchesCategory && matchesStatus;
    });
  });

  readonly hasActiveFilters = computed(() =>
    !!this.searchQuery().trim() || !!this.selectedCategory() || !!this.selectedStockStatus()
  );

  constructor() {
    void this.loadStocks();
  }

  async loadStocks(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      this.stocks.set(await this.inventoryService.getStocks());
    } catch (error) {
      this.stocks.set([]);
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible cargar el inventario.');
    } finally {
      this.isLoading.set(false);
    }
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedCategory.set('');
    this.selectedStockStatus.set('');
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
}

