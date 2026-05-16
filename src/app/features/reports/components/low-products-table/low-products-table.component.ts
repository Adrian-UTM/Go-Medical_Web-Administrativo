// features/reports/components/low-products-table/low-products-table.component.ts
import { Component, Input } from '@angular/core';
import { DatePipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import { ProductLowSalesRow } from '../../models/report.model';

@Component({
  selector: 'bc-low-products-table',
  standalone: true,
  imports: [DatePipe, DecimalPipe, NgFor, NgIf],
  template: `
    <div class="report-table-wrap">
      <table class="report-table" *ngIf="rows && rows.length > 0; else emptyState">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Categoría</th>
            <th class="text-right">Unidades Vendidas</th>
            <th class="text-right">Stock Actual</th>
            <th class="text-right">Última Venta</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let row of rows">
            <td>
              <div class="product-cell">
                <span class="product-name">{{ row.productName }}</span>
                <span class="product-sku">{{ row.sku }}</span>
              </div>
            </td>
            <td><span class="category-badge">{{ row.category }}</span></td>
            <td class="text-right num-cell">{{ row.unitsSold | number }}</td>
            <td class="text-right">
              <span class="stock-value" [class.stock-value--zero]="row.currentStock === 0"
                    [class.stock-value--low]="row.currentStock > 0 && row.currentStock <= 2">
                {{ row.currentStock | number }}
              </span>
            </td>
            <td class="text-right date-cell">
              <span *ngIf="row.lastSaleDate">{{ row.lastSaleDate | date:'dd/MM/yyyy' }}</span>
              <span *ngIf="!row.lastSaleDate" class="no-sale">Sin ventas</span>
            </td>
            <td>
              <span class="status-badge"
                    [class.status-badge--alert]="row.unitsSold === 0"
                    [class.status-badge--warning]="row.unitsSold > 0 && row.unitsSold <= 5"
                    [class.status-badge--ok]="row.unitsSold > 5">
                {{ row.unitsSold === 0 ? 'Sin movimiento' : row.unitsSold <= 5 ? 'Baja rotación' : 'Normal' }}
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
  styleUrl: './low-products-table.component.css',
})
export class LowProductsTableComponent {
  @Input() rows: ProductLowSalesRow[] | null = null;
}
