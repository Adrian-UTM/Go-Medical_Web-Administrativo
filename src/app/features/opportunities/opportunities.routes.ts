import { Routes } from '@angular/router';

export const OPPORTUNITIES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/opportunity-list/opportunity-list.component').then(m => m.OpportunityListComponent),
    title: 'Oportunidades | Go Medical',
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/opportunity-detail/opportunity-detail.component').then(m => m.OpportunityDetailComponent),
    title: 'Detalle de Oportunidad | Go Medical',
  },
];

