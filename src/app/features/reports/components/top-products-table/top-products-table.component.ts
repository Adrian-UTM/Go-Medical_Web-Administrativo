// features/reports/components/top-products-table/top-products-table.component.ts
import { Component, Input } from '@angular/core';
import { CurrencyPipe, DecimalPipe, NgFor, NgIf, PercentPipe } from '@angular/common';
import { ProductSalesRow } from '../../models/report.model';

@Component({
  selector: 'bc-top-products-table',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, PercentPipe, NgFor, NgIf],
  template: `
    <div class="report-table-wrap">
      <table class="report-table" *ngIf="rows && rows.length > 0; else emptyState">
        <thead>
          <tr>
            <th>#</th>
            <th>Producto</th>
            <th>Categoría</th>
            <th class="text-right">Unidades</th>
            <th class="text-right">Total Vendido</th>
            <th class="text-right">Ganancia Est.</th>
            <th class="text-right">Margen</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let row of rows; let i = index">
            <td class="rank-cell">
              <span class="rank-badge" [class.rank-badge--gold]="i === 0"
                    [class.rank-badge--silver]="i === 1"
                    [class.rank-badge--bronze]="i === 2">
                {{ i + 1 }}
              </span>
            </td>
            <td>
              <div class="product-cell">
                <span class="product-name">{{ row.productName }}</span>
                <span class="product-sku">{{ row.sku }}</span>
              </div>
            </td>
            <td><span class="category-badge">{{ row.category }}</span></td>
            <td class="text-right num-cell">{{ row.unitsSold | number }}</td>
            <td class="text-right num-cell">{{ row.totalRevenue | currency:'MXN':'symbol-narrow':'1.0-0' }}</td>
            <td class="text-right num-cell profit-cell">{{ row.estimatedProfit | currency:'MXN':'symbol-narrow':'1.0-0' }}</td>
            <td class="text-right">
              <span class="margin-bar-wrap">
                <span class="margin-bar" [style.width.%]="row.marginPct * 100"></span>
                <span class="margin-label">{{ row.marginPct | percent:'1.0-0' }}</span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <ng-template #emptyState>
        <div class="report-empty">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p>Sin datos para mostrar con los filtros seleccionados.</p>
        </div>
      </ng-template>
    </div>
  `,
  styleUrl: './top-products-table.component.css',
})
export class TopProductsTableComponent {
  @Input() rows: ProductSalesRow[] | null = null;
}
