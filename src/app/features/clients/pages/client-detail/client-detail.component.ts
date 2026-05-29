import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { ClientHistorySnapshot, ClientSupabaseService } from '../../services/client.supabase.service';
import { Client, ClientStatus, ClientType } from '../../../../core/models/client.model';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'bc-client-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, LoaderComponent, StatusBadgeComponent],
  templateUrl: './client-detail.component.html',
  styleUrls: ['./client-detail.component.css']
})
export class ClientDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private clientService = inject(ClientSupabaseService);

  isLoading = signal<boolean>(true);
  isDeleting = signal<boolean>(false);
  actionError = signal<string>('');
  historyError = signal<string>('');
  client = signal<Client | null>(null);
  history = signal<ClientHistorySnapshot>({
    orders: [],
    quotes: [],
    tickets: [],
    returnRequests: [],
  });

  activeTab = signal<'info' | 'history'>('info');
  tabs = [
    { id: 'info' as const, label: 'Informacion general' },
    { id: 'history' as const, label: 'Historial comercial' }
  ];

  get breadcrumbs() {
    return [
      { label: 'Inicio', url: '/dashboard' },
      { label: 'Clientes', url: '/clientes' },
      { label: this.client() ? (this.client()!.businessName || this.client()!.business_name || 'Sin nombre') : 'Detalle' }
    ];
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      await this.loadClient(id);
    } else {
      await this.router.navigate(['/clientes']);
    }
  }

  async loadClient(id: string) {
    this.isLoading.set(true);
    this.actionError.set('');

    try {
      const data = await firstValueFrom(this.clientService.getClientById(id));
      if (data) {
        this.client.set(data);
        await this.loadClientHistory(id);
      } else {
        await this.router.navigate(['/clientes']);
      }
    } catch {
      await this.router.navigate(['/clientes']);
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadClientHistory(clientId: string) {
    this.historyError.set('');

    try {
      this.history.set(await firstValueFrom(this.clientService.getClientHistory(clientId)));
    } catch (error: any) {
      console.error('[Clients] Error loading client history', {
        clientId,
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code
      });
      this.history.set({ orders: [], quotes: [], tickets: [], returnRequests: [] });
      this.historyError.set('No fue posible cargar el historial del cliente.');
    }
  }

  setTab(tabId: 'info' | 'history') {
    this.activeTab.set(tabId);
  }

  async onDeleteClient() {
    const currentClient = this.client();
    if (!currentClient || this.isDeleting()) {
      return;
    }

    const confirmed = window.confirm(`Se eliminara el cliente "${currentClient.businessName}". Esta accion no se puede deshacer.`);
    if (!confirmed) {
      return;
    }

    this.isDeleting.set(true);
    this.actionError.set('');

    try {
      await firstValueFrom(this.clientService.deleteClient(currentClient.id));
      await this.router.navigate(['/clientes']);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible eliminar el cliente.';
      this.actionError.set(message);
    } finally {
      this.isDeleting.set(false);
    }
  }

  hasOrders(): boolean {
    return this.history().orders.length > 0;
  }

  hasQuotes(): boolean {
    return this.history().quotes.length > 0;
  }

  hasReturns(): boolean {
    return this.history().returnRequests.length > 0;
  }

  hasTickets(): boolean {
    return this.history().tickets.length > 0;
  }

  isHistoryEmpty(): boolean {
    const current = this.history();
    return current.orders.length === 0 &&
           current.quotes.length === 0 &&
           current.tickets.length === 0 &&
           (current.returnRequests.length === 0 || !!current.returnRequestsUnavailable);
  }

  getOrderStatusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: 'Borrador',
      pending_review: 'Pendiente de revision',
      pending_payment: 'Pendiente de pago',
      paid: 'Pagado',
      processing: 'En proceso',
      shipped: 'Enviado',
      delivered: 'Entregado',
      completed: 'Entregado',
      canceled: 'Cancelado',
      cancelled: 'Cancelado',
    };
    return map[String(status ?? '').toLowerCase()] ?? 'Pedido';
  }

  getQuoteStatusLabel(status: string): string {
    const map: Record<string, string> = {
      draft: 'Borrador',
      sent: 'Enviada',
      approved: 'Aprobada',
      rejected: 'Rechazada',
      expired: 'Vencida',
      converted: 'Convertida',
    };
    return map[String(status ?? '').toLowerCase()] ?? 'Cotizacion';
  }

  getTicketStatusLabel(status: string): string {
    const map: Record<string, string> = {
      open: 'Abierto',
      assigned: 'Asignado',
      in_progress: 'En proceso',
      waiting_parts: 'Esperando refaccion',
      resolved: 'Resuelto',
      closed: 'Cerrado',
      canceled: 'Cancelado',
      cancelled: 'Cancelado',
    };
    return map[String(status ?? '').toLowerCase()] ?? 'Ticket';
  }

  getReturnStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pending_review: 'Pendiente de revision',
      approved: 'Aprobada',
      rejected: 'Rechazada',
      product_received: 'Producto recibido',
      refund_processed: 'Reembolso procesado',
      replacement_sent: 'Cambio enviado',
      closed: 'Cerrada',
      cancelled: 'Cancelada',
    };
    return map[String(status ?? '').toLowerCase()] ?? 'Devolucion';
  }

  getReturnReasonLabel(reason: string): string {
    const map: Record<string, string> = {
      defective_product: 'Producto defectuoso',
      wrong_product: 'Producto equivocado',
      damaged_shipping: 'Dano en envio',
      customer_error: 'Error del cliente',
      warranty: 'Garantia',
      other: 'Otro',
    };
    return map[String(reason ?? '').toLowerCase()] ?? 'Otro';
  }

  getTypeLabel(type: ClientType | string): string {
    switch (type) {
      case ClientType.Clinica: return 'Clínica';
      case ClientType.Hospital: return 'Hospital';
      case ClientType.Medico: return 'Médico';
      case ClientType.Veterinario: return 'Veterinaria';
      case ClientType.Institucion: return 'Institución';
      case ClientType.Distribuidor: return 'Distribuidor';
      case ClientType.Empresa: return 'Empresa';
      case ClientType.Otro: return 'Otro';
      default: return type;
    }
  }

  getStatusBadge(status: ClientStatus) {
    return {
      label: status === ClientStatus.Active ? 'Activo' : 'Inactivo',
      variant: status === ClientStatus.Active ? 'success' : 'neutral'
    } as const;
  }
}
