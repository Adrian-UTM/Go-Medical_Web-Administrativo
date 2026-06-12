import { Routes } from '@angular/router';

export const INVENTORY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/stock-list/stock-list.component').then(m => m.StockListComponent),
    title: 'Inventario | Go Medical',
  },
  {
    path: 'movimientos',
    loadComponent: () =>
      import('./pages/movements-list/movements-list.component').then(m => m.MovementsListComponent),
    title: 'Movimientos de Inventario | Go Medical',
  },
  {
    path: 'ajuste',
    loadComponent: () =>
      import('./pages/inventory-adjustment-form/inventory-adjustment-form.component').then(m => m.InventoryAdjustmentFormComponent),
    title: 'Movimiento de Inventario | Go Medical',
  },
];

