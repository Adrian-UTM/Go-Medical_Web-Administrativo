// features/reports/reports.routes.ts
import { Routes } from '@angular/router';

export const REPORTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/reports-dashboard/reports-dashboard.component').then(
        m => m.ReportsDashboardComponent
      ),
    title: 'Go Medical | Reportes Comerciales',
  },
];
