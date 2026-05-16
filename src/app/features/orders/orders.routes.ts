import { Routes } from '@angular/router';

export const ORDERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/order-list/order-list.component').then(m => m.OrderListComponent),
    title: 'Pedidos | Go Medical',
  },
  {
    path: 'estadisticas',
    redirectTo: '/reportes',
    pathMatch: 'full',
  },
  {
    path: 'nuevo',
    loadComponent: () =>
      import('./pages/order-form/order-form.component').then(m => m.OrderFormComponent),
    title: 'Nuevo Pedido | Go Medical',
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/order-detail/order-detail.component').then(m => m.OrderDetailComponent),
    title: 'Detalle de Pedido | Go Medical',
  },
  {
    path: ':id/editar',
    loadComponent: () =>
      import('./pages/order-form/order-form.component').then(m => m.OrderFormComponent),
    title: 'Editar Pedido | Go Medical',
  },
];
