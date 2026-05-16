// features/reports/components/top-customers-table/top-customers-table.component.ts
import { Component, Input } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import { CustomerSalesRow } from '../../models/report.model';

@Component({
  selector: 'bc-top-customers-table',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, DecimalPipe, NgFor, NgIf],
  template: `
    <div class="report-table-wrap">
      <table class="report-table" *ngIf="rows && rows.length > 0; else emptyState">
        <thead>
          <tr>
            <th>#</th>
            <th>Cliente</th>
            <th class="text-right">Total Comprado</th>
            <th class="text-right">Pedidos</th>
            <th class="text-right">Última Compra</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let row of rows; let i = index">
            <td class="rank-cell">
              <span class="rank-badge"
                    [class.rank-badge--gold]="i === 0"
                    [class.rank-badge--silver]="i === 1"
                    [class.rank-badge--bronze]="i === 2">
                {{ i + 1 }}
              </span>
            </td>
            <td>
              <div class="client-cell">
                <span class="client-avatar">{{ initials(row.clientName) }}</span>
                <span class="client-name">{{ row.clientName }}</span>
              </div>
            </td>
            <td class="text-right revenue-cell">
              {{ row.totalPurchased | currency:'MXN':'symbol-narrow':'1.0-0' }}
            </td>
            <td class="text-right num-cell">{{ row.totalOrders }}</td>
            <td class="text-right date-cell">{{ row.lastPurchaseDate | date:'dd/MM/yyyy' }}</td>
          </tr>
        </tbody>
      </table>

      <ng-template #emptyState>
        <div class="report-empty">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
          </svg>
          <p>Sin datos de clientes para el período seleccionado.</p>
        </div>
      </ng-template>
    </div>
  `,
  styleUrl: './top-customers-table.component.css',
})
export class TopCustomersTableComponent {
  @Input() rows: CustomerSalesRow[] | null = null;

  initials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map(w => w.charAt(0).toUpperCase())
      .join('');
  }
}
