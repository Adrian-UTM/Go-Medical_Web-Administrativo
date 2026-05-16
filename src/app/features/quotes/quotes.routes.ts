import { Routes } from '@angular/router';

export const QUOTES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/quote-list/quote-list.component').then(m => m.QuoteListComponent),
    title: 'Cotizaciones | Go Medical',
  },
  {
    path: 'nueva',
    loadComponent: () =>
      import('./pages/quote-form/quote-form.component').then(m => m.QuoteFormComponent),
    title: 'Nueva Cotizacion | Go Medical',
  },
  {
    path: 'pdfs',
    loadComponent: () =>
      import('./pages/quote-pdf-list/quote-pdf-list.component').then(m => m.QuotePdfListComponent),
    title: 'PDFs Generados | Go Medical',
  },
  {
    path: ':id/editar',
    loadComponent: () =>
      import('./pages/quote-form/quote-form.component').then(m => m.QuoteFormComponent),
    title: 'Editar Cotizacion | Go Medical',
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/quote-detail/quote-detail.component').then(m => m.QuoteDetailComponent),
    title: 'Detalle de Cotizacion | Go Medical',
  },
];
