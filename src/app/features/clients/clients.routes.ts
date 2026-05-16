import { Routes } from '@angular/router';

export const CLIENT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/client-list/client-list.component').then(m => m.ClientListComponent),
    title: 'Clientes | Go Medical'
  },
  {
    path: 'nuevo',
    loadComponent: () => import('./pages/client-form/client-form.component').then(m => m.ClientFormComponent),
    title: 'Nuevo Cliente | Go Medical'
  },
  {
    path: ':id',
    loadComponent: () => import('./pages/client-detail/client-detail.component').then(m => m.ClientDetailComponent),
    title: 'Detalle de Cliente | Go Medical'
  },
  {
    path: ':id/editar',
    loadComponent: () => import('./pages/client-form/client-form.component').then(m => m.ClientFormComponent),
    title: 'Editar Cliente | Go Medical'
  }
];

