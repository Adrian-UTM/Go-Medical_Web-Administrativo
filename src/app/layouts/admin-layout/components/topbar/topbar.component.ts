// layouts/admin-layout/components/topbar/topbar.component.ts
import { Component, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { SupabaseService } from '../../../../core/services/supabase.service';

interface GlobalSearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  route: string[];
}

@Component({
  selector: 'bc-topbar',
  standalone: true,
  imports: [NgIf, NgFor],
  template: `
    <header class="topbar" role="banner">
      <div class="topbar__search-wrap">
        <div class="topbar__search">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
               class="topbar__search-icon">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            class="topbar__search-input"
            placeholder="Buscar clientes, pedidos, prod..."
            aria-label="Búsqueda global"
            [value]="searchQuery()"
            (input)="onSearchChange($any($event.target).value)"
            (focus)="showSearchPanel.set(true)"
            (keydown.enter)="goToFirstResult()"
            (keydown.escape)="clearSearch()">

          <div class="topbar__search-panel" *ngIf="showSearchPanel() && searchQuery().trim().length >= 2">
            <div class="topbar__search-state" *ngIf="isSearching()">Buscando...</div>
            <button
              *ngFor="let result of searchResults()"
              type="button"
              class="topbar__search-result"
              (mousedown)="$event.preventDefault()"
              (click)="openResult(result)">
              <span class="topbar__search-result-type">{{ result.type }}</span>
              <span class="topbar__search-result-title">{{ result.title }}</span>
              <span class="topbar__search-result-subtitle">{{ result.subtitle }}</span>
            </button>
            <div class="topbar__search-state" *ngIf="!isSearching() && searchResults().length === 0">
              No se encontraron resultados.
            </div>
          </div>
        </div>
      </div>

      <div class="topbar__actions">
        <button class="topbar__icon-btn" aria-label="Notificaciones" title="Notificaciones">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </button>

        <div class="topbar__divider" aria-hidden="true"></div>

        <div class="topbar__user" *ngIf="auth.currentUser">
          <div class="topbar__user-avatar" aria-hidden="true">
            {{ getUserInitials() }}
          </div>
          <div class="topbar__user-info">
            <span class="topbar__user-name">{{ auth.currentUser.full_name }}</span>
            <span class="topbar__user-role">{{ getRoleLabel() }}</span>
          </div>
          <button
            class="topbar__icon-btn topbar__logout"
            (click)="onSignOut()"
            [disabled]="isSigningOut()"
            aria-label="Cerrar sesión"
            title="Cerrar sesión">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </header>
  `,
  styleUrl: './topbar.component.css'
})
export class TopbarComponent {
  readonly auth = inject(AuthService);
  readonly isSigningOut = signal(false);
  readonly searchQuery = signal('');
  readonly searchResults = signal<GlobalSearchResult[]>([]);
  readonly isSearching = signal(false);
  readonly showSearchPanel = signal(false);

  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchToken = 0;

  getUserInitials(): string {
    const name = this.auth.currentUser?.full_name ?? '';
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  }

  getRoleLabel(): string {
    const roleLabels: Record<string, string> = {
      admin: 'Administrador',
      manager: 'Gerente',
      sales: 'Ventas',
      tech: 'Técnico',
      viewer: 'Solo lectura',
    };
    return roleLabels[this.auth.currentUser?.role ?? ''] ?? '';
  }

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.showSearchPanel.set(true);

    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    const query = value.trim();
    if (query.length < 2) {
      this.searchResults.set([]);
      this.isSearching.set(false);
      return;
    }

    this.searchTimer = setTimeout(() => {
      void this.runSearch(query);
    }, 220);
  }

  async goToFirstResult(): Promise<void> {
    const first = this.searchResults()[0];
    if (first) {
      await this.openResult(first);
    }
  }

  async openResult(result: GlobalSearchResult): Promise<void> {
    this.clearSearch();
    await this.router.navigate(result.route);
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.showSearchPanel.set(false);
    this.isSearching.set(false);
  }

  async onSignOut(): Promise<void> {
    if (this.isSigningOut()) {
      return;
    }
    this.isSigningOut.set(true);
    try {
      await this.auth.signOut();
    } finally {
      this.isSigningOut.set(false);
    }
  }

  private async runSearch(query: string): Promise<void> {
    const token = ++this.searchToken;
    this.isSearching.set(true);

    try {
      const [products, clients, orders, tickets] = await Promise.all([
        this.searchProducts(query),
        this.searchClients(query),
        this.searchOrders(query),
        this.searchTickets(query),
      ]);

      if (token !== this.searchToken) {
        return;
      }

      this.searchResults.set([...products, ...clients, ...orders, ...tickets].slice(0, 10));
    } finally {
      if (token === this.searchToken) {
        this.isSearching.set(false);
      }
    }
  }

  private async searchProducts(query: string): Promise<GlobalSearchResult[]> {
    const term = this.toIlikeTerm(query);
    const { data, error } = await this.supabase.client
      .from('products')
      .select('id, name, sku, category')
      .or(`name.ilike.${term},sku.ilike.${term},category.ilike.${term}`)
      .limit(4);

    if (error) {
      console.warn('[GlobalSearch] Products search failed', error);
      return [];
    }

    return (data ?? []).map((row: any) => ({
      id: String(row.id),
      type: 'Producto',
      title: row.name ?? 'Producto sin nombre',
      subtitle: [row.sku, row.category].filter(Boolean).join(' · ') || 'Catálogo',
      route: ['/productos', String(row.id)],
    }));
  }

  private async searchClients(query: string): Promise<GlobalSearchResult[]> {
    const term = this.toIlikeTerm(query);
    const { data, error } = await this.supabase.client
      .from('clients')
      .select('id, business_name, trade_name, contact_name, email')
      .or(`business_name.ilike.${term},trade_name.ilike.${term},contact_name.ilike.${term},email.ilike.${term}`)
      .limit(4);

    if (error) {
      console.warn('[GlobalSearch] Clients search failed', error);
      return [];
    }

    return (data ?? []).map((row: any) => ({
      id: String(row.id),
      type: 'Cliente',
      title: row.business_name ?? row.trade_name ?? 'Cliente sin nombre',
      subtitle: [row.contact_name, row.email].filter(Boolean).join(' · ') || 'Cliente comercial',
      route: ['/clientes', String(row.id)],
    }));
  }

  private async searchOrders(query: string): Promise<GlobalSearchResult[]> {
    const term = this.toIlikeTerm(query);
    const { data, error } = await this.supabase.client
      .from('orders')
      .select('id, order_number, client_name_snapshot, status')
      .or(`order_number.ilike.${term},client_name_snapshot.ilike.${term},status.ilike.${term}`)
      .limit(4);

    if (error) {
      console.warn('[GlobalSearch] Orders search failed', error);
      return [];
    }

    return (data ?? []).map((row: any) => ({
      id: String(row.id),
      type: 'Pedido',
      title: row.order_number ?? `PED-${String(row.id).slice(0, 8)}`,
      subtitle: [row.client_name_snapshot, this.getStatusLabel(String(row.status ?? ''))].filter(Boolean).join(' · '),
      route: ['/pedidos', String(row.id)],
    }));
  }

  private async searchTickets(query: string): Promise<GlobalSearchResult[]> {
    const term = this.toIlikeTerm(query);
    const { data, error } = await this.supabase.client
      .from('service_tickets')
      .select('id, ticket_number, title, client_name_snapshot, status')
      .or(`ticket_number.ilike.${term},title.ilike.${term},client_name_snapshot.ilike.${term},status.ilike.${term}`)
      .limit(4);

    if (error) {
      console.warn('[GlobalSearch] Tickets search failed', error);
      return [];
    }

    return (data ?? []).map((row: any) => ({
      id: String(row.id),
      type: 'Ticket',
      title: row.ticket_number ?? `TKT-${String(row.id).slice(0, 8)}`,
      subtitle: [row.title, row.client_name_snapshot].filter(Boolean).join(' · ') || this.getTicketLabel(String(row.status ?? '')),
      route: ['/tickets', String(row.id)],
    }));
  }

  private toIlikeTerm(query: string): string {
    return `%${query.replace(/[%,]/g, '').trim()}%`;
  }

  private getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: 'Borrador',
      pending_review: 'Revisión',
      pending_payment: 'Pago pendiente',
      paid: 'Pagado',
      processing: 'En proceso',
      shipped: 'Enviado',
      delivered: 'Entregado',
      canceled: 'Cancelado',
    };
    return map[status] ?? status;
  }

  private getTicketLabel(status: string): string {
    const map: Record<string, string> = {
      open: 'Abierto',
      assigned: 'Asignado',
      in_progress: 'En proceso',
      waiting_parts: 'Esperando partes',
      resolved: 'Resuelto',
      closed: 'Cerrado',
      canceled: 'Cancelado',
    };
    return map[status] ?? status;
  }
}
