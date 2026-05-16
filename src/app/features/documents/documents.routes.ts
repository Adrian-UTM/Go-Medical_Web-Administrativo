import { Routes } from '@angular/router';

export const DOCUMENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/document-list/document-list.component').then(m => m.DocumentListComponent),
    title: 'Go Medical | Documentos',
  },
  {
    path: 'nuevo',
    loadComponent: () =>
      import('./pages/document-form/document-form.component').then(m => m.DocumentFormComponent),
    title: 'Go Medical | Nuevo documento',
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/document-detail/document-detail.component').then(m => m.DocumentDetailComponent),
    title: 'Go Medical | Detalle de documento',
  },
];
