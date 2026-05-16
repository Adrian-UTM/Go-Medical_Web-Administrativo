import { Routes } from '@angular/router';

export const TICKETS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/ticket-list/ticket-list.component').then(m => m.TicketListComponent),
    title: 'Go Medical | Tickets',
  },
  {
    path: 'nuevo',
    loadComponent: () =>
      import('./pages/ticket-form/ticket-form.component').then(m => m.TicketFormComponent),
    title: 'Go Medical | Nuevo ticket',
  },
  {
    path: ':id/editar',
    loadComponent: () =>
      import('./pages/ticket-form/ticket-form.component').then(m => m.TicketFormComponent),
    title: 'Go Medical | Editar ticket',
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/ticket-detail/ticket-detail.component').then(m => m.TicketDetailComponent),
    title: 'Go Medical | Detalle de ticket',
  },
];
