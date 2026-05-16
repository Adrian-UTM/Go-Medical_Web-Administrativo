// features/products/pages/product-list/product-list.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgFor, NgIf, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ProductsMockService } from '../../services/products.mock.service';
import {
  Product, ProductCategory, ProductStatus, ProductFilters
} from '../../../../models/product.model';

@Component({
  selector: 'bc-product-list',
  standalone: true,
  imports: [
    RouterLink, NgFor, NgIf, CurrencyPipe, FormsModule,
    PageHeaderComponent, StatusBadgeComponent, LoaderComponent, EmptyStateComponent, CustomSelectComponent
  ],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.css'
})
export class ProductListComponent implements OnInit {
  private productsService = inject(ProductsMockService);

  products = signal<Product[]>([]);
  isLoading = signal(true);
  deletingId = signal('');
  actionMessage = signal('');

  searchTerm = '';
  selectedCategory = '';
  selectedStatus = '';

  readonly categories: { value: string; label: string }[] = [
    { value: '', label: 'Todas las categorias' },
    { value: ProductCategory.UltrasoundVet, label: 'Ultrasonido Veterinario' },
    { value: ProductCategory.UltrasoundHuman, label: 'Ultrasonido Humano' },
    { value: ProductCategory.Consumables, label: 'Consumibles' },
    { value: ProductCategory.SpareParts, label: 'Refacciones' },
    { value: ProductCategory.Services, label: 'Servicios' },
  ];

  readonly statuses: { value: string; label: string }[] = [
    { value: '', label: 'Todos los estados' },
    { value: ProductStatus.Active, label: 'Activo' },
    { value: ProductStatus.Inactive, label: 'Inactivo' },
    { value: ProductStatus.Discontinued, label: 'Descontinuado' },
    { value: ProductStatus.Draft, label: 'Borrador' },
  ];

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts(): void {
    this.isLoading.set(true);
    const filters: ProductFilters = {
      search: this.searchTerm || undefined,
      category: this.selectedCategory as ProductCategory || undefined,
      status: this.selectedStatus as ProductStatus || undefined,
    };

    this.productsService.getProducts(filters).subscribe({
      next: (res) => {
        this.products.set(res.data);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });
  }

  onSearch(): void {
    this.loadProducts();
  }

  onFilterChange(): void {
    this.loadProducts();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedCategory = '';
    this.selectedStatus = '';
    this.loadProducts();
  }

  deleteProduct(product: Product): void {
    const confirmed = window.confirm(`Se eliminara el producto ${product.name}. Esta accion es mock pero quitara el registro del catalogo actual. Deseas continuar?`);
    if (!confirmed) {
      return;
    }

    this.deletingId.set(product.id);
    this.productsService.deleteProduct(product.id).subscribe({
      next: (success) => {
        if (success) {
          this.products.update(current => current.filter(item => item.id !== product.id));
          this.actionMessage.set(`Producto ${product.name} eliminado del catalogo mock.`);
        }
        this.deletingId.set('');
      },
      error: () => {
        this.deletingId.set('');
        this.actionMessage.set('No fue posible eliminar el producto. Intenta nuevamente.');
      }
    });
  }

  getCategoryLabel(cat: ProductCategory): string {
    const labels: Record<ProductCategory, string> = {
      [ProductCategory.UltrasoundVet]: 'Ultrasonido Vet.',
      [ProductCategory.UltrasoundHuman]: 'Ultrasonido Hum.',
      [ProductCategory.Consumables]: 'Consumibles',
      [ProductCategory.SpareParts]: 'Refacciones',
      [ProductCategory.Services]: 'Servicios',
    };
    return labels[cat] ?? cat;
  }

  getStatusBadge(status: ProductStatus): { label: string; variant: BadgeVariant } {
    const map: Record<ProductStatus, { label: string; variant: BadgeVariant }> = {
      [ProductStatus.Active]: { label: 'Activo', variant: 'success' },
      [ProductStatus.Inactive]: { label: 'Inactivo', variant: 'neutral' },
      [ProductStatus.Discontinued]: { label: 'Descontinuado', variant: 'danger' },
      [ProductStatus.Draft]: { label: 'Borrador', variant: 'warning' },
    };
    return map[status] ?? { label: status, variant: 'neutral' };
  }

  get hasActiveFilters(): boolean {
    return !!(this.searchTerm || this.selectedCategory || this.selectedStatus);
  }
}
