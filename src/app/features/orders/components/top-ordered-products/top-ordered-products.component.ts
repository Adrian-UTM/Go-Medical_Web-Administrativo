import { Component, Input } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { ProductCategory } from '../../../../models/product.model';
import { TopOrderedProductRow } from '../../../../models/order.model';

@Component({
  selector: 'bc-top-ordered-products',
  standalone: true,
  imports: [CommonModule, CurrencyPipe],
  template: `
    <section class="products-card">
      <div class="products-card__header">
        <div>
          <h2 class="products-card__title">Productos mas pedidos</h2>
          <p class="products-card__subtitle">Concentrado de unidades y monto estimado por producto.</p>
        </div>
      </div>

      <div *ngIf="rows.length; else emptyState" class="products-table-wrapper">
        <table class="products-table" aria-label="Productos mas pedidos">
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col">Categoria</th>
              <th scope="col" class="text-center">Unidades</th>
              <th scope="col" class="text-right">Total estimado</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of rows" class="products-table__row">
              <td>
                <span class="product-name">{{ row.productName }}</span>
              </td>
              <td>{{ getCategoryLabel(row.productCategory) }}</td>
              <td class="text-center">{{ row.unitsOrdered }}</td>
              <td class="text-right">{{ row.totalAmount | currency:'MXN':'symbol-narrow':'1.0-0' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <ng-template #emptyState>
        <div class="products-empty">No hay productos acumulados para el periodo seleccionado.</div>
      </ng-template>
    </section>
  `,
  styleUrl: './top-ordered-products.component.css',
})
export class TopOrderedProductsComponent {
  @Input({ required: true }) rows: TopOrderedProductRow[] = [];

  getCategoryLabel(category: ProductCategory): string {
    const labels: Record<string, string> = {
      [ProductCategory.UltrasoundVet]: 'Ultrasonido veterinario',
      [ProductCategory.UltrasoundHuman]: 'Ultrasonido humano',
      [ProductCategory.Consumables]: 'Consumibles',
      [ProductCategory.SpareParts]: 'Refacciones',
      [ProductCategory.Services]: 'Servicios',
    };

    return labels[category] ?? category;
  }
}
