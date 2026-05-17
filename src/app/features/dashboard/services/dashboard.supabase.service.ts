import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { OrderStatus } from '../../../models/order.model';

export interface DashboardMetricCardData {
  id: string;
  label: string;
  value: number;
  delta?: string;
  deltaPositive?: boolean;
}

export interface DashboardRecentOrder {
  id: string;
  folio: string;
  clientName: string;
  total: number;
  status: OrderStatus | string;
  createdAt: string;
}

export interface DashboardRecentActivity {
  id: string;
  type: string;
  description: string;
  time: string;
  badge: string;
  badgeVariant: 'success' | 'warning' | 'info' | 'neutral' | 'danger';
  occurredAt: string;
}

export interface DashboardSnapshot {
  totalProducts: number;
  totalClients: number;
  totalOrders: number;
  totalQuotes: number;
  openTickets: number;
  lowStockProducts: number;
  recentOrders: DashboardRecentOrder[];
  recentActivity: DashboardRecentActivity[];
}

@Injectable({
  providedIn: 'root'
})
export class DashboardSupabaseService {
  constructor(private readonly supabase: SupabaseService) {}

  async getSnapshot(): Promise<DashboardSnapshot> {
    const [
      totalProducts,
      totalClients,
      totalOrders,
      totalQuotes,
      orderResponse,
      quoteResponse,
      ticketResponse,
      stockResponse,
    ] = await Promise.all([
      this.countRows('products', 'No fue posible cargar el resumen operativo.'),
      this.countRows('clients', 'No fue posible cargar el resumen operativo.'),
      this.countRows('orders', 'No fue posible cargar el resumen operativo.'),
      this.countRows('quotes', 'No fue posible cargar el resumen operativo.'),
      this.supabase.client
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8),
      this.supabase.client
        .from('quotes')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(6),
      this.supabase.client
        .from('service_tickets')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(8),
      this.supabase.client
        .from('inventory_stock')
        .select('*')
        .order('updated_at', { ascending: false }),
    ]);

    if (orderResponse.error) {
      throw this.toAppError(orderResponse.error.message, 'No se pudo cargar el resumen operativo.');
    }

    if (quoteResponse.error) {
      throw this.toAppError(quoteResponse.error.message, 'No se pudo cargar el resumen operativo.');
    }

    if (ticketResponse.error) {
      throw this.toAppError(ticketResponse.error.message, 'No se pudo cargar el resumen operativo.');
    }

    if (stockResponse.error) {
      throw this.toAppError(stockResponse.error.message, 'No se pudo cargar el resumen operativo.');
    }

    const recentOrders = (orderResponse.data ?? []).map((row: any) => ({
      id: String(row.id),
      folio: this.resolveOrderNumber(row),
      clientName: row.client_name_snapshot ?? row.client_name ?? 'Cliente no disponible',
      total: Number(row.total ?? 0),
      status: row.status ?? OrderStatus.Draft,
      createdAt: row.created_at ?? row.updated_at ?? new Date().toISOString(),
    }));

    const tickets = (ticketResponse.data ?? []).map((row: any) => ({
      id: String(row.id),
      ticketNumber: row.ticket_number ?? row.ticketNumber ?? `TKT-${this.getShortId(row.id)}`,
      title: row.title ?? 'Ticket de soporte',
      status: String(row.status ?? 'open'),
      clientName: row.client_name_snapshot ?? row.client_name ?? 'Cliente no disponible',
      occurredAt: row.updated_at ?? row.requested_at ?? new Date().toISOString(),
    }));

    const quotes = (quoteResponse.data ?? []).map((row: any) => ({
      id: String(row.id),
      quoteNumber: row.quote_number ?? row.quoteNumber ?? `COT-${this.getShortId(row.id)}`,
      clientName: row.client_name_snapshot ?? row.client_name ?? 'Cliente no disponible',
      status: String(row.status ?? 'draft'),
      occurredAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    }));

    const lowStockRows = (stockResponse.data ?? []).filter((row: any) => {
      const quantity = this.resolveStockQuantity(row);
      const minStock = Number(row.min_stock ?? row.minimum_stock ?? 0);
      return quantity <= 0 || (minStock > 0 && quantity <= minStock);
    });

    const lowStockProducts = lowStockRows.length;
    const openTickets = tickets.filter(ticket => !['resolved', 'closed', 'canceled'].includes(ticket.status)).length;

    const stockActivities = lowStockRows.slice(0, 3).map((row: any) => {
      const quantity = this.resolveStockQuantity(row);
      return {
        id: `stock-${row.id}`,
        type: 'Inventario',
        description: `${this.resolveStockProductName(row)} requiere seguimiento (${quantity} unidades disponibles).`,
        time: this.formatRelativeTime(row.updated_at),
        badge: quantity <= 0 ? 'Sin stock' : 'Stock bajo',
        badgeVariant: quantity <= 0 ? 'danger' as const : 'warning' as const,
        occurredAt: row.updated_at ?? new Date().toISOString(),
      };
    });

    const orderActivities = recentOrders.map(order => ({
      id: `order-${order.id}`,
      type: 'Pedido',
      description: `${order.folio} registrado para ${order.clientName}.`,
      time: this.formatRelativeTime(order.createdAt),
      badge: this.getOrderBadgeLabel(String(order.status)),
      badgeVariant: this.getOrderBadgeVariant(String(order.status)),
      occurredAt: order.createdAt,
    }));

    const quoteActivities = quotes.map(quote => ({
      id: `quote-${quote.id}`,
      type: 'Cotización',
      description: `${quote.quoteNumber} actualizada para ${quote.clientName}.`,
      time: this.formatRelativeTime(quote.occurredAt),
      badge: this.getQuoteBadgeLabel(quote.status),
      badgeVariant: this.getQuoteBadgeVariant(quote.status),
      occurredAt: quote.occurredAt,
    }));

    const ticketActivities = tickets.map(ticket => ({
      id: `ticket-${ticket.id}`,
      type: 'Ticket',
      description: `${ticket.ticketNumber} · ${ticket.title} (${ticket.clientName}).`,
      time: this.formatRelativeTime(ticket.occurredAt),
      badge: this.getTicketBadgeLabel(ticket.status),
      badgeVariant: this.getTicketBadgeVariant(ticket.status),
      occurredAt: ticket.occurredAt,
    }));

    const recentActivity = [...orderActivities, ...quoteActivities, ...ticketActivities, ...stockActivities]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 8);

    return {
      totalProducts,
      totalClients,
      totalOrders,
      totalQuotes,
      openTickets,
      lowStockProducts,
      recentOrders,
      recentActivity,
    };
  }

  private async countRows(table: string, fallback: string): Promise<number> {
    const { count, error } = await this.supabase.client
      .from(table)
      .select('id', { count: 'exact', head: true });

    if (error) {
      throw this.toAppError(error.message, fallback);
    }

    return Number(count ?? 0);
  }

  private resolveOrderNumber(row: any): string {
    return row.order_number ?? row.folio ?? `PED-${this.getShortId(row.id)}`;
  }

  private resolveStockQuantity(row: any): number {
    return Number(row.quantity ?? row.current_stock ?? row.stock ?? 0);
  }

  private resolveStockProductName(row: any): string {
    return row.product_name ?? row.productName ?? 'Producto sin nombre';
  }

  private getShortId(value: unknown): string {
    const normalized = String(value ?? '').replace(/-/g, '').slice(0, 8).toUpperCase();
    return normalized || '0000';
  }

  private formatRelativeTime(value?: string): string {
    if (!value) {
      return 'Sin fecha';
    }

    const date = new Date(value);
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

    if (diffMinutes < 60) {
      return `Hace ${diffMinutes} min`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `Hace ${diffHours} h`;
    }

    if (diffHours < 48) {
      return 'Ayer';
    }

    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
    }).format(date);
  }

  private getOrderBadgeLabel(status: string): string {
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

    return map[status] ?? 'Pedido';
  }

  private getOrderBadgeVariant(status: string): DashboardRecentActivity['badgeVariant'] {
    const map: Record<string, DashboardRecentActivity['badgeVariant']> = {
      draft: 'neutral',
      pending_review: 'warning',
      pending_payment: 'warning',
      paid: 'success',
      processing: 'info',
      shipped: 'info',
      delivered: 'success',
      canceled: 'danger',
    };

    return map[status] ?? 'neutral';
  }

  private getQuoteBadgeLabel(status: string): string {
    const map: Record<string, string> = {
      draft: 'Borrador',
      sent: 'Enviada',
      approved: 'Aprobada',
      rejected: 'Rechazada',
      expired: 'Vencida',
      converted: 'Convertida',
    };

    return map[status] ?? 'Cotización';
  }

  private getQuoteBadgeVariant(status: string): DashboardRecentActivity['badgeVariant'] {
    const map: Record<string, DashboardRecentActivity['badgeVariant']> = {
      draft: 'neutral',
      sent: 'info',
      approved: 'success',
      rejected: 'danger',
      expired: 'warning',
      converted: 'success',
    };

    return map[status] ?? 'neutral';
  }

  private getTicketBadgeLabel(status: string): string {
    const map: Record<string, string> = {
      open: 'Abierto',
      assigned: 'Asignado',
      in_progress: 'En proceso',
      waiting_parts: 'Esperando partes',
      resolved: 'Resuelto',
      closed: 'Cerrado',
      canceled: 'Cancelado',
    };

    return map[status] ?? 'Ticket';
  }

  private getTicketBadgeVariant(status: string): DashboardRecentActivity['badgeVariant'] {
    const map: Record<string, DashboardRecentActivity['badgeVariant']> = {
      open: 'warning',
      assigned: 'info',
      in_progress: 'info',
      waiting_parts: 'warning',
      resolved: 'success',
      closed: 'neutral',
      canceled: 'danger',
    };

    return map[status] ?? 'neutral';
  }

  private toAppError(message: string, fallback: string): Error {
    const lowered = String(message ?? '').toLowerCase();
    if (lowered.includes('permission') || lowered.includes('rls') || lowered.includes('policy')) {
      return new Error('No tienes permisos para consultar el resumen operativo.');
    }

    return new Error(fallback);
  }
}
