import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { OrderStatus } from '../../../models/order.model';

export type DashboardReportPeriod = 'day' | 'week' | 'month';

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

export interface DashboardReportRange {
  period: DashboardReportPeriod;
  label: string;
  from: Date;
  to: Date;
}

export interface DashboardReportData extends DashboardSnapshot {
  range: DashboardReportRange;
  periodOrders: DashboardRecentOrder[];
  periodTickets: Array<{ id: string; ticketNumber: string; title: string; status: string; clientName: string; occurredAt: string }>;
  lowStockItems: Array<{ productId: string; productName: string; quantity: number; minStock: number }>;
  ordersByStatus: Array<{ status: string; label: string; count: number }>;
  totalRevenue: number;
  averageTicket: number;
  periodQuotes: number;
  periodClients: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardSupabaseService {
  constructor(private readonly supabase: SupabaseService) {}

  async getSnapshot(): Promise<DashboardSnapshot> {
    const data = await this.loadDashboardRows();
    return this.buildSnapshot(data);
  }

  async getReportData(period: DashboardReportPeriod): Promise<DashboardReportData> {
    const data = await this.loadDashboardRows();
    const range = this.resolveReportRange(period);
    const snapshot = this.buildSnapshot(data);
    const periodOrdersRaw = data.orders.filter(row => this.isRowInRange(row, range, ['created_at', 'order_date', 'issued_at', 'date', 'updated_at']));
    const periodQuotesRaw = data.quotes.filter(row => this.isRowInRange(row, range, ['created_at', 'issued_at', 'quote_date', 'updated_at']));
    const periodTicketsRaw = data.tickets.filter(row => this.isRowInRange(row, range, ['requested_at', 'created_at', 'updated_at']));
    const periodClientsRaw = data.clients.filter(row => this.isCommercialClientRecord(row, data.internalEmails) && this.isRowInRange(row, range, ['created_at', 'updated_at']));
    const periodOrders = this.mapRecentOrders(periodOrdersRaw);
    const revenueOrders = periodOrders.filter(order => this.isRevenueStatus(String(order.status)));
    const totalRevenue = this.roundCurrency(revenueOrders.reduce((sum, order) => sum + order.total, 0));
    const lowStockItems = this.getLowStockItems(data.stock, data.products);

    return {
      ...snapshot,
      range,
      periodOrders,
      periodTickets: periodTicketsRaw.map(row => this.mapTicket(row)),
      lowStockItems,
      ordersByStatus: this.buildOrdersByStatus(periodOrders),
      totalRevenue,
      averageTicket: revenueOrders.length ? this.roundCurrency(totalRevenue / revenueOrders.length) : 0,
      periodQuotes: periodQuotesRaw.length,
      periodClients: periodClientsRaw.length,
    };
  }

  private async loadDashboardRows(): Promise<{ products: any[]; clients: any[]; internalEmails: Set<string>; orders: any[]; quotes: any[]; tickets: any[]; stock: any[] }> {
    const [products, clients, profiles, orders, quotes, tickets, stock] = await Promise.all([
      this.supabase.client.from('products').select('*').order('created_at', { ascending: false }),
      this.supabase.client.from('clients').select('*').order('created_at', { ascending: false }),
      this.supabase.client.from('profiles').select('email, role').neq('role', 'client'),
      this.supabase.client.from('orders').select('*').order('created_at', { ascending: false }),
      this.supabase.client.from('quotes').select('*').order('created_at', { ascending: false }),
      this.supabase.client.from('service_tickets').select('*').order('updated_at', { ascending: false }),
      this.supabase.client.from('inventory_stock').select('*').order('updated_at', { ascending: false }),
    ]);

    const responses = [products, clients, profiles, orders, quotes, tickets, stock];
    const failed = responses.find(response => response.error);
    if (failed?.error) {
      throw this.toAppError(failed.error.message, 'No fue posible cargar la información del dashboard.');
    }

    return {
      products: products.data ?? [],
      clients: clients.data ?? [],
      internalEmails: new Set((profiles.data ?? []).map(row => String(row.email ?? '').trim().toLowerCase()).filter(Boolean)),
      orders: orders.data ?? [],
      quotes: quotes.data ?? [],
      tickets: tickets.data ?? [],
      stock: stock.data ?? [],
    };
  }

  private buildSnapshot(data: { products: any[]; clients: any[]; internalEmails: Set<string>; orders: any[]; quotes: any[]; tickets: any[]; stock: any[] }): DashboardSnapshot {
    const recentOrders = this.mapRecentOrders(data.orders);
    const tickets = data.tickets.map(row => this.mapTicket(row));
    const quotes = data.quotes.map(row => this.mapQuote(row));
    const lowStockItems = this.getLowStockItems(data.stock, data.products);
    const openTickets = tickets.filter(ticket => this.isOpenTicketStatus(ticket.status)).length;
    const lowStockActivities = lowStockItems.slice(0, 3).map(item => ({
      id: `stock-${item.productId}`,
      type: 'Inventario',
      description: `${item.productName} requiere seguimiento (${item.quantity} unidades disponibles).`,
      time: 'Inventario',
      badge: item.quantity <= 0 ? 'Sin stock' : 'Stock bajo',
      badgeVariant: item.quantity <= 0 ? 'danger' as const : 'warning' as const,
      occurredAt: new Date().toISOString(),
    }));

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

    return {
      totalProducts: data.products.filter(product => product.is_active !== false).length,
      totalClients: data.clients.filter(client => this.isCommercialClientRecord(client, data.internalEmails)).length,
      totalOrders: data.orders.length,
      totalQuotes: data.quotes.length,
      openTickets,
      lowStockProducts: lowStockItems.length,
      recentOrders,
      recentActivity: [...orderActivities, ...quoteActivities, ...ticketActivities, ...lowStockActivities]
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
        .slice(0, 8),
    };
  }

  private mapRecentOrders(rows: any[]): DashboardRecentOrder[] {
    return [...rows]
      .sort((a, b) => new Date(this.resolveRowDate(b, ['created_at', 'order_date', 'issued_at', 'date', 'updated_at'])).getTime() - new Date(this.resolveRowDate(a, ['created_at', 'order_date', 'issued_at', 'date', 'updated_at'])).getTime())
      .map(row => ({
        id: String(row.id),
        folio: this.resolveOrderNumber(row),
        clientName: row.client_name_snapshot ?? row.client_name ?? 'Cliente no disponible',
        total: Number(row.total ?? row.total_amount ?? row.grand_total ?? row.total_mxn ?? 0),
        status: row.status ?? OrderStatus.Draft,
        createdAt: this.resolveRowDate(row, ['created_at', 'order_date', 'issued_at', 'date', 'updated_at']),
      }));
  }

  private mapTicket(row: any): { id: string; ticketNumber: string; title: string; status: string; clientName: string; occurredAt: string } {
    return {
      id: String(row.id),
      ticketNumber: row.ticket_number ?? row.ticketNumber ?? `TKT-${this.getShortId(row.id)}`,
      title: row.title ?? 'Ticket de soporte',
      status: String(row.status ?? 'open'),
      clientName: row.client_name_snapshot ?? row.client_name ?? 'Cliente no disponible',
      occurredAt: this.resolveRowDate(row, ['updated_at', 'requested_at', 'created_at']),
    };
  }

  private mapQuote(row: any): { id: string; quoteNumber: string; clientName: string; status: string; occurredAt: string } {
    return {
      id: String(row.id),
      quoteNumber: row.quote_number ?? row.quoteNumber ?? `COT-${this.getShortId(row.id)}`,
      clientName: row.client_name_snapshot ?? row.client_name ?? 'Cliente no disponible',
      status: String(row.status ?? 'draft'),
      occurredAt: this.resolveRowDate(row, ['updated_at', 'created_at', 'issued_at']),
    };
  }

  private getLowStockItems(stockRows: any[], products: any[]): Array<{ productId: string; productName: string; quantity: number; minStock: number }> {
    const physicalProducts = new Map(
      products
        .filter(product => product.is_active !== false && String(product.item_type ?? 'product') !== 'service')
        .map(product => [String(product.id), product])
    );
    const stockByProduct = new Map<string, { quantity: number; minStock: number }>();

    stockRows.forEach(row => {
      const productId = String(row.product_id ?? '');
      if (!physicalProducts.has(productId)) {
        return;
      }
      const current = stockByProduct.get(productId) ?? { quantity: 0, minStock: 0 };
      current.quantity += this.resolveStockQuantity(row);
      current.minStock = Math.max(current.minStock, Number(row.min_stock ?? row.minimum_stock ?? 0));
      stockByProduct.set(productId, current);
    });

    return Array.from(stockByProduct.entries())
      .filter(([, stock]) => stock.quantity <= 0 || (stock.minStock > 0 && stock.quantity <= stock.minStock))
      .map(([productId, stock]) => ({
        productId,
        productName: physicalProducts.get(productId)?.name ?? 'Producto sin nombre',
        quantity: this.roundCurrency(stock.quantity),
        minStock: stock.minStock,
      }));
  }

  private buildOrdersByStatus(orders: DashboardRecentOrder[]): Array<{ status: string; label: string; count: number }> {
    const registry = new Map<string, { status: string; label: string; count: number }>();
    orders.forEach(order => {
      const status = String(order.status ?? 'draft');
      const current = registry.get(status) ?? { status, label: this.getOrderBadgeLabel(status), count: 0 };
      current.count += 1;
      registry.set(status, current);
    });
    return Array.from(registry.values());
  }

  private isCommercialClientRecord(item: any, internalEmails: Set<string>): boolean {
    if (!item) return false;
    const email = String(item.email ?? '').trim().toLowerCase();
    if (email && internalEmails.has(email)) return false;
    if (item.is_active === false) return false;
    const status = String(item.status ?? '').trim().toLowerCase();
    if (['inactive', 'archived', 'deleted'].includes(status)) return false;
    const classifier = [item.source, item.origin, item.client_origin, item.record_type, item.entity_type, item.kind, item.role, item.user_role, item.profile_role]
      .map(value => String(value ?? '').trim().toLowerCase()).filter(Boolean).join(' ');
    if (['admin', 'staff', 'technician', 'tech', 'manager', 'employee', 'internal', 'interno', 'profile', 'user'].some(marker => classifier.includes(marker))) return false;
    return !!String(item.business_name ?? item.trade_name ?? item.contact_name ?? item.rfc ?? item.email ?? '').trim();
  }

  private resolveOrderNumber(row: any): string {
    return row.order_number ?? row.folio ?? `PED-${this.getShortId(row.id)}`;
  }

  private resolveStockQuantity(row: any): number {
    return Number(row.quantity ?? row.current_stock ?? row.stock ?? 0);
  }

  private resolveReportRange(period: DashboardReportPeriod): DashboardReportRange {
    const today = new Date();
    if (period === 'week') {
      const day = today.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset, 0, 0, 0, 0);
      const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6, 23, 59, 59, 999);
      return { period, label: 'Semana', from, to };
    }
    if (period === 'month') {
      return { period, label: 'Mes', from: new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0), to: new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999) };
    }
    return { period, label: 'Día', from: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0), to: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999) };
  }

  private isRowInRange(row: any, range: DashboardReportRange, fields: string[]): boolean {
    const value = this.resolveRowDate(row, fields, '');
    if (!value) return false;
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time >= range.from.getTime() && time <= range.to.getTime();
  }

  private resolveRowDate(row: any, fields: string[], fallback = new Date().toISOString()): string {
    return fields.map(field => row?.[field]).find(Boolean) ?? fallback;
  }

  private isOpenTicketStatus(status: string): boolean {
    return ['open', 'assigned', 'in_progress', 'waiting_parts'].includes(String(status ?? '').toLowerCase());
  }

  private isRevenueStatus(status: string): boolean {
    return ['paid', 'shipped', 'delivered', 'completed'].includes(String(status ?? '').toLowerCase());
  }

  private getShortId(value: unknown): string {
    return String(value ?? '').replace(/-/g, '').slice(0, 8).toUpperCase() || '0000';
  }

  private formatRelativeTime(value?: string): string {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    const diffMinutes = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));
    if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffHours < 48) return 'Ayer';
    return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' }).format(date);
  }

  private getOrderBadgeLabel(status: string): string {
    const map: Record<string, string> = { draft: 'Borrador', pending: 'Pendiente', pending_review: 'Revisión', pending_payment: 'Pago pendiente', paid: 'Pagado', processing: 'En proceso', in_progress: 'En proceso', shipped: 'Enviado', delivered: 'Entregado', completed: 'Entregado', canceled: 'Cancelado', cancelled: 'Cancelado' };
    return map[String(status ?? '').toLowerCase()] ?? 'Pedido';
  }

  private getOrderBadgeVariant(status: string): DashboardRecentActivity['badgeVariant'] {
    const map: Record<string, DashboardRecentActivity['badgeVariant']> = { draft: 'neutral', pending: 'warning', pending_review: 'warning', pending_payment: 'warning', paid: 'success', processing: 'info', in_progress: 'info', shipped: 'info', delivered: 'success', completed: 'success', canceled: 'danger', cancelled: 'danger' };
    return map[String(status ?? '').toLowerCase()] ?? 'neutral';
  }

  private getQuoteBadgeLabel(status: string): string {
    const map: Record<string, string> = { draft: 'Borrador', sent: 'Enviada', approved: 'Aprobada', rejected: 'Rechazada', expired: 'Vencida', converted: 'Convertida' };
    return map[String(status ?? '').toLowerCase()] ?? 'Cotización';
  }

  private getQuoteBadgeVariant(status: string): DashboardRecentActivity['badgeVariant'] {
    const map: Record<string, DashboardRecentActivity['badgeVariant']> = { draft: 'neutral', sent: 'info', approved: 'success', rejected: 'danger', expired: 'warning', converted: 'success' };
    return map[String(status ?? '').toLowerCase()] ?? 'neutral';
  }

  private getTicketBadgeLabel(status: string): string {
    const map: Record<string, string> = { open: 'Abierto', assigned: 'Asignado', in_progress: 'En proceso', waiting_parts: 'Esperando partes', resolved: 'Resuelto', closed: 'Cerrado', canceled: 'Cancelado', cancelled: 'Cancelado' };
    return map[String(status ?? '').toLowerCase()] ?? 'Ticket';
  }

  private getTicketBadgeVariant(status: string): DashboardRecentActivity['badgeVariant'] {
    const map: Record<string, DashboardRecentActivity['badgeVariant']> = { open: 'warning', assigned: 'info', in_progress: 'info', waiting_parts: 'warning', resolved: 'success', closed: 'neutral', canceled: 'danger', cancelled: 'danger' };
    return map[String(status ?? '').toLowerCase()] ?? 'neutral';
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private toAppError(message: string, fallback: string): Error {
    const lowered = String(message ?? '').toLowerCase();
    if (lowered.includes('permission') || lowered.includes('rls') || lowered.includes('policy')) {
      return new Error('No tienes permisos para consultar el resumen operativo.');
    }
    return new Error(fallback);
  }
}
