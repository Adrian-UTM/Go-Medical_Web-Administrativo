// app.routes.ts — Rutas raíz de la aplicación
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: '',
    loadComponent: () =>
      import('./layouts/auth-layout/auth-layout.component').then(m => m.AuthLayoutComponent),
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/pages/login/login.component').then(m => m.LoginComponent),
        title: 'Go Medical | Iniciar sesión',
      },
      {
        path: 'registro',
        loadComponent: () =>
          import('./features/auth/pages/register/register.component').then(m => m.RegisterComponent),
        title: 'Go Medical | Registrarse',
      },
    ],
  },
  {
    path: '',
    loadComponent: () =>
      import('./layouts/admin-layout/admin-layout.component').then(m => m.AdminLayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
        title: 'Go Medical | Dashboard',
      },
      {
        path: 'productos',
        loadChildren: () =>
          import('./features/products/products.routes').then(m => m.PRODUCTS_ROUTES),
        title: 'Go Medical | Productos',
      },
      {
        path: 'clientes',
        loadChildren: () =>
          import('./features/clients/clients.routes').then(m => m.CLIENT_ROUTES),
        title: 'Go Medical | Clientes',
      },
      {
        path: 'pedidos',
        loadChildren: () =>
          import('./features/orders/orders.routes').then(m => m.ORDERS_ROUTES),
        title: 'Go Medical | Pedidos',
      },
      {
        path: 'inventario',
        loadChildren: () =>
          import('./features/inventory/inventory.routes').then(m => m.INVENTORY_ROUTES),
        title: 'Go Medical | Inventario',
      },
      {
        path: 'cotizaciones',
        loadChildren: () =>
          import('./features/quotes/quotes.routes').then(m => m.QUOTES_ROUTES),
        title: 'Go Medical | Cotizaciones',
      },
      {
        path: 'oportunidades',
        loadChildren: () =>
          import('./features/opportunities/opportunities.routes').then(m => m.OPPORTUNITIES_ROUTES),
        title: 'Go Medical | Oportunidades',
      },
      {
        path: 'reportes',
        loadChildren: () =>
          import('./features/reports/reports.routes').then(m => m.REPORTS_ROUTES),
        title: 'Go Medical | Reportes Comerciales',
      },
      {
        path: 'documentos',
        loadChildren: () =>
          import('./features/documents/documents.routes').then(m => m.DOCUMENTS_ROUTES),
        title: 'Go Medical | Documentos',
      },
      {
        path: 'tickets',
        loadChildren: () =>
          import('./features/tickets/tickets.routes').then(m => m.TICKETS_ROUTES),
        title: 'Go Medical | Tickets de soporte',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];




