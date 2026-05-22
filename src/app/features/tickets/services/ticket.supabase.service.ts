import { Injectable, computed, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ClientSupabaseService } from '../../clients/services/client.supabase.service';
import { ProductSupabaseService } from '../../products/services/product.supabase.service';
import { Client, ClientStatus } from '../../../core/models/client.model';
import { Product } from '../../../models/product.model';
import {
  ServiceTicket,
  TicketFilters,
  TicketHistoryItem,
  TicketPriority,
  TicketStatus,
  TicketType,
  TicketUpsertPayload,
} from '../models/ticket.model';
import { SupabaseService } from '../../../core/services/supabase.service';

@Injectable({ providedIn: 'root' })
export class TicketSupabaseService {
  private readonly tableName = 'service_tickets';
  private readonly profilesTable = 'profiles';

  private readonly _technicians = signal<string[]>([]);
  readonly technicians = computed(() => this._technicians());
  private techniciansLoaded = false;
  private techniciansLoadingPromise: Promise<void> | null = null;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly clientsService: ClientSupabaseService,
    private readonly productsService: ProductSupabaseService,
  ) {
    void this.loadTechnicians();
  }

  async getTickets(filters?: TicketFilters): Promise<ServiceTicket[]> {
    const response = await this.supabase.client
      .from(this.tableName)
      .select('*')
      .order('requested_at', { ascending: false });

    if (response.error) {
      throw this.toAppError(response.error.message, 'No fue posible cargar los tickets de soporte.');
    }

    let tickets = (response.data ?? []).map(row => this.mapTicket(row));

    if (filters?.search?.trim()) {
      const query = filters.search.trim().toLowerCase();
      tickets = tickets.filter(ticket =>
        ticket.ticketNumber.toLowerCase().includes(query) ||
        ticket.clientNameSnapshot.toLowerCase().includes(query) ||
        ticket.title.toLowerCase().includes(query) ||
        ticket.description.toLowerCase().includes(query) ||
        (ticket.productNameSnapshot?.toLowerCase().includes(query) ?? false) ||
        (ticket.equipmentSerialNumber?.toLowerCase().includes(query) ?? false) ||
        (ticket.assignedTechnicianName?.toLowerCase().includes(query) ?? false)
      );
    }

    if (filters?.status) {
      tickets = tickets.filter(ticket => ticket.status === filters.status);
    }

    if (filters?.priority) {
      tickets = tickets.filter(ticket => ticket.priority === filters.priority);
    }

    if (filters?.type) {
      tickets = tickets.filter(ticket => ticket.type === filters.type);
    }

    return tickets;
  }

  async getTicketById(id: string): Promise<ServiceTicket | undefined> {
    const response = await this.supabase.client
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (response.error) {
      if (response.error.code === 'PGRST116') {
        return undefined;
      }

      throw this.toAppError(response.error.message, 'No fue posible cargar el ticket solicitado.');
    }

    return this.mapTicket(response.data);
  }

  async getActiveClients(): Promise<Client[]> {
    const clients = await firstValueFrom(this.clientsService.getClients());
    return clients.filter(client => client.status === ClientStatus.Active);
  }

  async getAvailableProducts(): Promise<Product[]> {
    const products = await firstValueFrom(this.productsService.getProducts());
    return products.filter(product => product.is_active !== false);
  }

  async getTechnicians(): Promise<string[]> {
    if (!this.techniciansLoaded) {
      await this.loadTechnicians();
    }

    return this._technicians();
  }

  async getClientById(id: string): Promise<Client | undefined> {
    try {
      return await firstValueFrom(this.clientsService.getClientById(id));
    } catch {
      return undefined;
    }
  }

  async createTicket(payload: TicketUpsertPayload): Promise<ServiceTicket | undefined> {
    const client = await this.getClientById(payload.clientId);
    const product = payload.productId ? (await this.getAvailableProducts()).find(item => item.id === payload.productId) : undefined;

    const insertPayload: Record<string, unknown> = {
      ticket_number: await this.generateNextTicketNumber(),
      client_id: payload.clientId,
      client_name_snapshot: payload.clientNameSnapshot?.trim() || client?.businessName || '',
      title: payload.title.trim(),
      description: payload.description.trim(),
      status: payload.status ?? TicketStatus.Open,
      priority: payload.priority,
      type: payload.type,
      product_id: payload.productId || null,
      product_name_snapshot: payload.productNameSnapshot?.trim() || product?.name || null,
      requested_at: new Date().toISOString(),
      scheduled_at: payload.scheduledAt || null,
      notes: payload.notes?.trim() || '',
      attachments: payload.attachments ?? null,
    };

    // Use actual DB columns if present in payload
    if ('assignedTechnicianId' in payload) insertPayload['assigned_technician_id'] = (payload as any).assignedTechnicianId;
    if ('equipmentUnitId' in payload) insertPayload['equipment_unit_id'] = (payload as any).equipmentUnitId;

    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      console.error('[Tickets] Error creating ticket', { payload: insertPayload, error });
      throw this.toAppError(error.message, 'No fue posible crear el ticket.');
    }

    return this.mapTicket(data);
  }

  async updateTicket(id: string, payload: TicketUpsertPayload): Promise<ServiceTicket | undefined> {
    const current = await this.getRawTicket(id);
    if (!current) {
      return undefined;
    }

    const history = this.appendHistoryIfSupported(current, {
      status: payload.status ?? (current.status as TicketStatus) ?? TicketStatus.Open,
      comment: 'Se actualizaron datos administrativos del ticket.',
      authorName: 'Mesa de soporte',
    });

    const updatePayload: Record<string, unknown> = {
      client_id: payload.clientId,
      client_name_snapshot: payload.clientNameSnapshot ?? current.client_name_snapshot ?? '',
      title: payload.title.trim(),
      description: payload.description.trim(),
      status: payload.status ?? current.status,
      priority: payload.priority,
      type: payload.type,
      product_id: payload.productId || null,
      product_name_snapshot: payload.productNameSnapshot || null,
      scheduled_at: payload.scheduledAt || null,
      notes: payload.notes?.trim() || '',
      attachments: payload.attachments ?? current.attachments ?? null,
      updated_at: new Date().toISOString(),
    };

    if ('assignedTechnicianId' in payload) updatePayload['assigned_technician_id'] = (payload as any).assignedTechnicianId;
    if ('equipmentUnitId' in payload) updatePayload['equipment_unit_id'] = (payload as any).equipmentUnitId;

    if (history) {
      updatePayload['history'] = history;
    }

    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[Tickets] Error updating ticket', { payload: updatePayload, error });
      throw this.toAppError(error.message, 'No fue posible actualizar el ticket.');
    }

    return this.mapTicket(data);
  }

  async updateTicketStatus(
    id: string,
    status: TicketStatus,
    comment: string,
    authorName = 'Coordinacion tecnica'
  ): Promise<ServiceTicket | undefined> {
    const current = await this.getRawTicket(id);
    if (!current) {
      return undefined;
    }

    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    const history = this.appendHistoryIfSupported(current, { status, comment, authorName });
    if (history) {
      updatePayload['history'] = history;
    }

    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[Tickets] Error updating ticket status', { ticketId: id, status, error });
      throw this.toAppError(error.message, 'No fue posible actualizar el estado del ticket.');
    }

    return this.mapTicket(data);
  }

  async assignTechnician(
    id: string,
    technicianName: string,
    authorName = 'Coordinacion tecnica'
  ): Promise<ServiceTicket | undefined> {
    const current = await this.getRawTicket(id);
    if (!current) {
      return undefined;
    }

    const nextStatus = current.status === TicketStatus.Open ? TicketStatus.Assigned : current.status;
    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    const history = this.appendHistoryIfSupported(current, {
      status: nextStatus,
      comment: `Ticket asignado a ${technicianName}.`,
      authorName,
    });

    if (history) {
      updatePayload['history'] = history;
    }

    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[Tickets] Error assigning technician', { ticketId: id, technicianName, error });
      throw this.toAppError(error.message, 'No fue posible asignar el técnico.');
    }

    return this.mapTicket(data);
  }

  private async loadTechnicians(): Promise<void> {
    if (this.techniciansLoadingPromise) {
      await this.techniciansLoadingPromise;
      return;
    }

    this.techniciansLoadingPromise = this.fetchTechnicians();
    await this.techniciansLoadingPromise;
    this.techniciansLoadingPromise = null;
  }

  private async fetchTechnicians(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from(this.profilesTable)
      .select('full_name, role, is_active');

    if (error) {
      this._technicians.set([]);
      this.techniciansLoaded = true;
      return;
    }

    const names = (data ?? [])
      .filter((profile: any) => profile.is_active !== false)
      .filter((profile: any) => ['tech', 'technician', 'manager', 'admin'].includes(String(profile.role ?? '').toLowerCase()))
      .map((profile: any) => String(profile.full_name ?? '').trim())
      .filter(Boolean);

    this._technicians.set([...new Set(names)].sort((a, b) => a.localeCompare(b, 'es-MX')));
    this.techniciansLoaded = true;
  }

  private mapTicket(row: any): ServiceTicket {
    const history = Array.isArray(row.history)
      ? row.history.map((item: any, index: number) => this.mapHistoryItem(item, row.status, index))
      : [];

    return {
      id: String(row.id),
      ticketNumber: row.ticket_number ?? row.ticketNumber ?? 'Sin folio',
      clientId: String(row.client_id ?? ''),
      clientNameSnapshot: row.client_name_snapshot ?? 'Cliente no disponible',
      title: row.title ?? '',
      description: row.description ?? '',
      status: (row.status ?? TicketStatus.Open) as TicketStatus,
      priority: (row.priority ?? TicketPriority.Medium) as TicketPriority,
      type: (row.type ?? TicketType.Other) as TicketType,
      productId: row.product_id ?? undefined,
      productNameSnapshot: row.product_name_snapshot ?? undefined,
      equipmentSerialNumber: row.equipment_serial_number ?? undefined,
      assignedTechnicianName: row.assigned_technician_name ?? row.assigned_technician?.full_name ?? undefined,
      requestedAt: row.requested_at ?? row.created_at ?? new Date().toISOString(),
      scheduledAt: row.scheduled_at ?? undefined,
      updatedAt: row.updated_at ?? row.requested_at ?? new Date().toISOString(),
      notes: row.notes ?? '',
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
      history,
    };
  }

  private mapHistoryItem(item: any, fallbackStatus: TicketStatus, index: number): TicketHistoryItem {
    return {
      id: String(item?.id ?? `hist-${index}`),
      date: item?.date ?? item?.created_at ?? new Date().toISOString(),
      status: (item?.status ?? fallbackStatus ?? TicketStatus.Open) as TicketStatus,
      comment: item?.comment ?? item?.message ?? 'Actualización registrada.',
      authorName: item?.authorName ?? item?.author_name ?? 'Sistema',
    };
  }

  private async getRawTicket(id: string): Promise<any | undefined> {
    const response = await this.supabase.client
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (response.error) {
      if (response.error.code === 'PGRST116') {
        return undefined;
      }

      throw this.toAppError(response.error.message, 'No fue posible consultar el ticket.');
    }

    return response.data;
  }

  private appendHistoryIfSupported(current: any, item: { status: TicketStatus; comment: string; authorName: string }): any[] | null {
    if (!Object.prototype.hasOwnProperty.call(current, 'history')) {
      return null;
    }

    const currentHistory = Array.isArray(current.history) ? [...current.history] : [];
    currentHistory.push({
      id: `hist-${Date.now()}`,
      date: new Date().toISOString(),
      status: item.status,
      comment: item.comment,
      authorName: item.authorName,
    });

    return currentHistory;
  }

  private async generateNextTicketNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .select('ticket_number')
      .like('ticket_number', `GST-${year}-%`);

    if (error) {
      return `GST-${year}-0001`;
    }

    const sequence = (data ?? [])
      .map((row: any) => Number(String(row.ticket_number ?? '').split('-').at(-1)))
      .filter((value: number) => Number.isFinite(value))
      .reduce((max: number, value: number) => Math.max(max, value), 0);

    return `GST-${year}-${String(sequence + 1).padStart(4, '0')}`;
  }

  private toAppError(message: string, fallback: string): Error {
    const lowered = message.toLowerCase();
    if (lowered.includes('permission') || lowered.includes('rls') || lowered.includes('policy')) {
      return new Error('No tienes permisos para consultar o modificar tickets de soporte.');
    }

    return new Error(fallback);
  }
}





