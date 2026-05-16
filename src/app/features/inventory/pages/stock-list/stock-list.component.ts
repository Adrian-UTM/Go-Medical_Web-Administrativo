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
import { InventoryMockService } from '../../services/inventory.mock.service';
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
  private readonly inventoryService = inject(InventoryMockService);

  readonly isLoading = signal(true);
  readonly stocks = signal<InventoryStock[]>([]);
  readonly searchQuery = signal('');
  readonly selectedCategory = signal<ProductCategory | ''>('');
  readonly selectedStockStatus = signal<InventoryStockStatus | ''>('');

  readonly categoryOptions = [
    { value: '', label: 'Todas las categorias' },
    { value: ProductCategory.UltrasoundVet, label: 'Ultrasonido veterinario' },
    { value: ProductCategory.UltrasoundHuman, label: 'Ultrasonido humano' },
    { value: ProductCategory.Consumables, label: 'Consumibles' },
    { value: ProductCategory.SpareParts, label: 'Refacciones' },
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
    this.stocks.set(await this.inventoryService.getStocks());
    this.isLoading.set(false);
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedCategory.set('');
    this.selectedStockStatus.set('');
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
