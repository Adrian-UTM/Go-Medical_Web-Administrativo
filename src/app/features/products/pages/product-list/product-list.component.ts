import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgFor, NgIf, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ProductSupabaseService } from '../../services/product.supabase.service';
import { Product, ProductCategory, ProductFilters, ProductItemType, ProductCondition } from '../../../../models/product.model';
import { PageVisibilityService } from '../../../../core/services/page-visibility.service';

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
  private productsService = inject(ProductSupabaseService);
  private readonly pageVisibility = inject(PageVisibilityService);
  private readonly destroyRef = inject(DestroyRef);

  private loadInFlight = false;

  products = signal<Product[]>([]);
  isLoading = signal(false);
  deletingId = signal('');
  actionMessage = signal('');

  searchTerm = '';
  selectedCategory = '';
  selectedStatus = '';
  activeTab: ProductItemType = ProductItemType.Product;
  selectedCondition: '' | ProductCondition = '';

  readonly categories: { value: string; label: string }[] = [
    { value: '', label: 'Todas las categorías' },
    { value: ProductCategory.EquipoMedico, label: 'Equipo médico' },
    { value: ProductCategory.UltrasonidoHumano, label: 'Ultrasonido humano' },
    { value: ProductCategory.UltrasonidoVeterinario, label: 'Ultrasonido veterinario' },
    { value: ProductCategory.Consumible, label: 'Consumibles' },
    { value: ProductCategory.Refaccion, label: 'Refacciones' },
    { value: ProductCategory.Accesorio, label: 'Accesorios' },
    { value: ProductCategory.Servicio, label: 'Servicios' },
  ];

  readonly conditionOptions: { value: '' | ProductCondition; label: string }[] = [
    { value: '', label: 'Todos' },
    { value: ProductCondition.New, label: 'Nuevos' },
    { value: ProductCondition.Preowned, label: 'Seminuevos' },
  ];
  readonly statuses: { value: string; label: string }[] = [
    { value: '', label: 'Todos los estados' },
    { value: 'true', label: 'Activo' },
    { value: 'false', label: 'Inactivo' },
  ];

  ngOnInit(): void {
    this.loadProducts();

    this.pageVisibility.visible$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadProducts();
      });
  }

  loadProducts(): void {
    if (this.loadInFlight) {
      return;
    }

    this.loadInFlight = true;
    this.isLoading.set(true);
    const filters: ProductFilters = {
      search: this.searchTerm || undefined,
      category: this.selectedCategory as ProductCategory || undefined,
      is_active: this.selectedStatus === '' ? undefined : this.selectedStatus === 'true',
      item_type: this.activeTab,
      product_condition: this.activeTab === ProductItemType.Product ? this.selectedCondition || undefined : undefined,
    };

    this.productsService.getProducts(filters)
      .pipe(
        finalize(() => {
          this.loadInFlight = false;
          this.isLoading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (res) => {
          this.products.set(res);
        },
        error: () => {
          this.products.set([]);
        }
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
    this.selectedCondition = '';
    this.loadProducts();
  }

  setTab(tab: ProductItemType): void {
    if (this.activeTab === tab) {
      return;
    }

    this.activeTab = tab;
    this.selectedCondition = '';
    this.selectedCategory = '';
    this.loadProducts();
  }

  deleteProduct(product: Product): void {
    const confirmed = window.confirm(`Se eliminara el producto ${product.name}. Esta accion eliminara el registro de la base de datos. Deseas continuar?`);
    if (!confirmed) {
      return;
    }

    this.deletingId.set(product.id);
    this.productsService.deleteProduct(product.id).subscribe({
      next: () => {
        this.products.update(current => current.filter(item => item.id !== product.id));
        this.actionMessage.set(`Producto ${product.name} eliminado del catalogo.`);
        this.deletingId.set('');
      },
      error: () => {
        this.deletingId.set('');
        this.actionMessage.set('No fue posible eliminar el producto. Intenta nuevamente.');
      }
    });
  }

  getCategoryLabel(cat: ProductCategory): string {
    const labels: Record<string, string> = {
      [ProductCategory.EquipoMedico]: 'Equipo Médico',
      [ProductCategory.UltrasonidoHumano]: 'Ultrasonido Hum.',
      [ProductCategory.UltrasonidoVeterinario]: 'Ultrasonido Vet.',
      [ProductCategory.Consumible]: 'Consumibles',
      [ProductCategory.Refaccion]: 'Refacciones',
      [ProductCategory.Accesorio]: 'Accesorios',
      [ProductCategory.Servicio]: 'Servicios',
    };
    return labels[cat] ?? cat;
  }

  getItemTypeLabel(product: Product): string {
    return (product.item_type ?? ProductItemType.Product) === ProductItemType.Service ? 'Servicio' : 'Producto físico';
  }

  getConditionLabel(condition?: ProductCondition | null): string {
    return condition === ProductCondition.Preowned ? 'Seminuevo' : 'Nuevo';
  }

  getVisitLabel(product: Product): string {
    return product.service_requires_visit ? 'Requiere visita' : 'Sin visita';
  }

  getDurationLabel(minutes?: number | null): string {
    return minutes ? `${minutes} min` : 'No definida';
  }

  get activeTabLabel(): string {
    return this.activeTab === ProductItemType.Service ? 'servicio' : 'producto';
  }

  get isServicesTab(): boolean {
    return this.activeTab === ProductItemType.Service;
  }

  get ProductItemType() {
    return ProductItemType;
  }

  getStatusBadge(isActive: boolean): { label: string; variant: BadgeVariant } {
    if (isActive) {
      return { label: 'Activo', variant: 'success' };
    }
    return { label: 'Inactivo', variant: 'neutral' };
  }

  get hasActiveFilters(): boolean {
    return !!(this.searchTerm || this.selectedCategory || this.selectedStatus || this.selectedCondition);
  }
}
