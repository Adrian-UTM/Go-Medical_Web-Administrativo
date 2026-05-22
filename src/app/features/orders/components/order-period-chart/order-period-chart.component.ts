import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface OrderPeriodChartDatum {
  label: string;
  value: number;
}

@Component({
  selector: 'bc-order-period-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="chart-card">
      <div class="chart-card__header">
        <div>
          <h2 class="chart-card__title">{{ title }}</h2>
          <p class="chart-card__subtitle">{{ subtitle }}</p>
        </div>
      </div>

      <div *ngIf="hasData(); else emptyState" class="chart-shell">
        <div class="chart-bars">
          <div *ngFor="let item of series" class="chart-bar-item">
            <span class="chart-bar-item__value">{{ formatValue(item.value) }}</span>
            <div class="chart-bar-item__track">
              <div class="chart-bar-item__fill" [style.height.%]="getBarHeight(item.value)"></div>
            </div>
            <span class="chart-bar-item__label">{{ item.label }}</span>
          </div>
        </div>
      </div>

      <ng-template #emptyState>
        <div class="chart-empty">
          <strong>No hay información suficiente para este periodo.</strong>
          <span>Los datos aparecerán cuando existan registros dentro del rango seleccionado.</span>
        </div>
      </ng-template>
    </section>
  `,
  styleUrl: './order-period-chart.component.css',
})
export class OrderPeriodChartComponent {
  @Input({ required: true }) title = '';
  @Input({ required: true }) subtitle = '';
  @Input({ required: true }) series: OrderPeriodChartDatum[] = [];
  @Input() valueType: 'count' | 'currency' = 'count';

  hasData(): boolean {
    return this.series?.some(item => item.value > 0) ?? false;
  }

  getBarHeight(value: number): number {
    const maxValue = Math.max(...this.series.map(item => item.value), 0);
    if (!maxValue) {
      return 0;
    }

    return Math.max((value / maxValue) * 100, value > 0 ? 8 : 0);
  }

  formatValue(value: number): string {
    if (this.valueType === 'currency') {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        maximumFractionDigits: 0,
      }).format(value);
    }

    return new Intl.NumberFormat('es-MX').format(value);
  }
}
