// features/products/products.routes.ts
import { Routes } from '@angular/router';

export const PRODUCTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/product-list/product-list.component').then(m => m.ProductListComponent),
  },
  {
    path: 'nuevo',
    loadComponent: () =>
      import('./pages/product-form/product-form.component').then(m => m.ProductFormComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/product-detail/product-detail.component').then(m => m.ProductDetailComponent),
  },
  {
    path: ':id/editar',
    loadComponent: () =>
      import('./pages/product-form/product-form.component').then(m => m.ProductFormComponent),
  },
];
