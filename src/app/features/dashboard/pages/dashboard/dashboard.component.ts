// features/dashboard/pages/dashboard/dashboard.component.ts
import { Component } from '@angular/core';
import { NgFor, NgIf, CurrencyPipe } from '@angular/common';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';

interface MetricCard {
  id: string;
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean;
  icon: string;
  accentColor: string;
}

interface RecentActivity {
  id: string;
  type: string;
  description: string;
  time: string;
  badge: string;
  badgeVariant: 'success' | 'warning' | 'info' | 'neutral';
}

@Component({
  selector: 'bc-dashboard',
  standalone: true,
  imports: [NgFor, NgIf, PageHeaderComponent, StatusBadgeComponent, CurrencyPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {
  readonly metrics: MetricCard[] = [
    {
      id: 'metric-pedidos',
      label: 'Pedidos este mes',
      value: '12',
      delta: '+3 vs. mes anterior',
      deltaPositive: true,
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
      accentColor: 'var(--color-accent)',
    },
    {
      id: 'metric-clientes',
      label: 'Clientes activos',
      value: '48',
      delta: '+2 nuevos',
      deltaPositive: true,
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      accentColor: 'var(--color-primary-light)',
    },
    {
      id: 'metric-tickets',
      label: 'Tickets abiertos',
      value: '5',
      delta: '2 críticos',
      deltaPositive: false,
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      accentColor: 'var(--color-warning)',
    },
    {
      id: 'metric-productos',
      label: 'Productos catálogo',
      value: '24',
      delta: '3 con stock bajo',
      deltaPositive: false,
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
      accentColor: 'var(--color-success)',
    },
  ];

  readonly recentActivity: RecentActivity[] = [
    { id: 'act-001', type: 'Pedido', description: 'Pedido BCO-2025-0012 confirmado — Clínica Veterinaria del Sur', time: 'Hace 2 h', badge: 'Confirmado', badgeVariant: 'success' },
    { id: 'act-002', type: 'Ticket', description: 'Ticket BCT-2025-0005 asignado — Mantenimiento correctivo MedScan Pro 500', time: 'Hace 4 h', badge: 'Asignado', badgeVariant: 'info' },
    { id: 'act-003', type: 'Cotización', description: 'Cotización BCQ-2025-0008 enviada — Hospital Regional Mérida Norte', time: 'Hace 6 h', badge: 'Enviada', badgeVariant: 'info' },
    { id: 'act-004', type: 'Cliente', description: 'Nuevo cliente registrado — Biomédica Peninsular S.A. de C.V.', time: 'Ayer', badge: 'Nuevo', badgeVariant: 'success' },
    { id: 'act-005', type: 'Inventario', description: 'Alerta de stock bajo — Gel conductor BioGel 500 ml (8 unidades)', time: 'Ayer', badge: 'Stock bajo', badgeVariant: 'warning' },
  ];
}
