import { Injectable, computed, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ClientSupabaseService } from '../../clients/services/client.supabase.service';
import { ProductSupabaseService } from '../../products/services/product.supabase.service';
import { Client, ClientStatus } from '../../../core/models/client.model';
import { Product, ProductItemType } from '../../../models/product.model';
import {
  ServiceTicket,
  TicketFilters,
  TicketHistoryItem,
  TicketPriority,
  TicketStatus,
  TicketType,
  TicketTechnician,
  TicketUpsertPayload,
} from '../models/ticket.model';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';

@Injectable({ providedIn: 'root' })
export class TicketSupabaseService {
  private readonly tableName = 'service_tickets';
  private readonly profilesTable = 'profiles';

  private readonly _technicians = signal<TicketTechnician[]>([]);
  readonly technicians = computed(() => this._technicians());
  private techniciansLoaded = false;
  private techniciansLoadingPromise: Promise<void> | null = null;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly clientsService: ClientSupabaseService,
    private readonly productsService: ProductSupabaseService,
    private readonly authService: AuthService,
  ) {
    void this.loadTechnicians();
  }

  async getTickets(filters?: TicketFilters): Promise<ServiceTicket[]> {
    await this.loadTechnicians();

    const response = await this.supabase.client
      .from(this.tableName)
      .select(`
        *,
        clients!client_id (
          business_name,
          trade_name,
          contact_name,
          email,
          phone
        ),
        products!product_id (
          name,
          sku,
          item_type
        ),
        equipment_units!equipment_unit_id (
          serial_number
        )
      `)
      .order('created_at', { ascending: false });

    if (response.error) {
      throw this.toAppError(response.error.message, 'No fue posible cargar los tickets de soporte.');
    }

    await this.ensureAssignedTechniciansAvailable(response.data ?? []);

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
    await this.loadTechnicians();

    const response = await this.supabase.client
      .from(this.tableName)
      .select(`
        *,
        clients!client_id (
          business_name,
          trade_name,
          contact_name,
          email,
          phone
        ),
        products!product_id (
          name,
          sku,
          item_type
        ),
        equipment_units!equipment_unit_id (
          serial_number
        )
      `)
      .eq('id', id)
      .single();

    if (response.error) {
      if (response.error.code === 'PGRST116') {
        return undefined;
      }

      throw this.toAppError(response.error.message, 'No fue posible cargar el ticket solicitado.');
    }

    await this.ensureAssignedTechniciansAvailable([response.data]);

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
    const technicians = await this.getTechnicianProfiles();
    return technicians.map(technician => technician.fullName);
  }

  async getTechnicianProfiles(): Promise<TicketTechnician[]> {
    if (!this.techniciansLoaded) {
      await this.loadTechnicians();
    }

    return this._technicians();
  }

  supportsExternalTechnicianName(): boolean {
    return true;
  }

  async getClientById(id: string): Promise<Client | undefined> {
    try {
      return await firstValueFrom(this.clientsService.getClientById(id));
    } catch {
      return undefined;
    }
  }

  async getProductById(id: string): Promise<Product | undefined> {
    try {
      return await firstValueFrom(this.productsService.getProductById(id));
    } catch {
      return undefined;
    }
  }

  async createTicket(payload: TicketUpsertPayload): Promise<ServiceTicket | undefined> {
    const insertPayload = await this.buildDbPayload(payload);

    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .insert(insertPayload)
      .select(`
        *,
        clients!client_id (
          business_name,
          trade_name,
          contact_name,
          email,
          phone
        ),
        products!product_id (
          name,
          sku,
          item_type
        ),
        equipment_units!equipment_unit_id (
          serial_number
        )
      `)
      .single();

    if (error) {
      console.error('[Tickets] Error creating ticket', {
        payload: insertPayload,
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });
      throw this.toAppError(error.message, 'No fue posible crear el ticket.');
    }

    return this.mapTicket(data);
  }
  async updateTicket(id: string, payload: TicketUpsertPayload): Promise<ServiceTicket | undefined> {
    const current = await this.getRawTicket(id);
    if (!current) {
      return undefined;
    }

    const updatePayload = await this.buildDbPayload(payload, true);
    updatePayload['updated_at'] = new Date().toISOString();

    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .update(updatePayload)
      .eq('id', id)
      .select(`
        *,
        clients!client_id (
          business_name,
          trade_name,
          contact_name,
          email,
          phone
        ),
        products!product_id (
          name,
          sku,
          item_type
        ),
        equipment_units!equipment_unit_id (
          serial_number
        )
      `)
      .single();

    if (error) {
      console.error('[Tickets] Error updating ticket', {
        payload: updatePayload,
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });
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
      .select(`
        *,
        clients!client_id (
          business_name,
          trade_name,
          contact_name,
          email,
          phone
        ),
        products!product_id (
          name,
          sku,
          item_type
        ),
        equipment_units!equipment_unit_id (
          serial_number
        )
      `)
      .single();

    if (error) {
      console.error('[Tickets] Error updating ticket status', { ticketId: id, status, error });
      throw this.toAppError(error.message, 'No fue posible actualizar el estado del ticket.');
    }

    return this.mapTicket(data);
  }

  async assignTechnician(
    id: string,
    technicianId: string,
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
      assigned_technician_id: this.normalizeUuid(technicianId),
      assigned_technician_custom_name: null,
    };

    const history = this.appendHistoryIfSupported(current, {
      status: nextStatus,
      comment: `Ticket asignado a ${this._technicians().find(technician => technician.id === technicianId)?.fullName ?? 'tecnico'}.`,
      authorName,
    });

    if (history) {
      updatePayload['history'] = history;
    }

    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .update(updatePayload)
      .eq('id', id)
      .select(`
        *,
        clients!client_id (
          business_name,
          trade_name,
          contact_name,
          email,
          phone
        ),
        products!product_id (
          name,
          sku,
          item_type
        ),
        equipment_units!equipment_unit_id (
          serial_number
        )
      `)
      .single();

    if (error) {
      console.error('[Tickets] Error assigning technician', { ticketId: id, technicianId, error });
      throw this.toAppError(error.message, 'No fue posible asignar el técnico.');
    }

    return this.mapTicket(data);
  }

  async assignExternalTechnician(
    id: string,
    technicianName: string,
    authorName = 'Coordinacion tecnica'
  ): Promise<ServiceTicket | undefined> {
    const current = await this.getRawTicket(id);
    if (!current) {
      return undefined;
    }

    const normalizedName = technicianName.trim();
    if (!normalizedName) {
      throw new Error('Ingresa el nombre del tecnico externo.');
    }

    const nextStatus = current.status === TicketStatus.Open ? TicketStatus.Assigned : current.status;
    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
      assigned_technician_id: null,
      assigned_technician_custom_name: normalizedName,
    };

    const history = this.appendHistoryIfSupported(current, {
      status: nextStatus,
      comment: `Ticket asignado a ${normalizedName}.`,
      authorName,
    });

    if (history) {
      updatePayload['history'] = history;
    }

    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .update(updatePayload)
      .eq('id', id)
      .select(`
        *,
        clients!client_id (
          business_name,
          trade_name,
          contact_name,
          email,
          phone
        ),
        products!product_id (
          name,
          sku,
          item_type
        ),
        equipment_units!equipment_unit_id (
          serial_number
        )
      `)
      .single();

    if (error) {
      console.error('[Tickets] Error assigning external technician', { ticketId: id, technicianName: normalizedName, error });
      throw this.toAppError(error.message, 'No fue posible asignar el tecnico externo.');
    }

    return this.mapTicket(data);
  }

  private async buildDbPayload(payload: TicketUpsertPayload, isUpdate = false): Promise<Record<string, unknown>> {
    const product = payload.productId ? (await this.getAvailableProducts()).find(item => item.id === payload.productId) : undefined;
    const equipmentUnitId = await this.resolveEquipmentUnitId(payload, product);
    const assignedTechnicianId = this.normalizeUuid(payload.assignedTechnicianId);
    const assignedTechnicianCustomName = assignedTechnicianId
      ? null
      : payload.assignedTechnicianCustomName?.trim() || null;

    const dbPayload: Record<string, unknown> = {
      client_id: payload.clientId,
      product_id: this.normalizeUuid(payload.productId),
      title: payload.title?.trim(),
      description: payload.description?.trim() || null,
      status: payload.status ?? TicketStatus.Open,
      priority: payload.priority,
      type: payload.type,
      equipment_unit_id: equipmentUnitId,
      assigned_technician_id: assignedTechnicianId,
      assigned_technician_custom_name: assignedTechnicianCustomName,
    };

    if (!isUpdate) {
      const currentUserId = this.normalizeUuid(this.authService.currentUserId());
      if (currentUserId) {
        dbPayload['requested_by'] = currentUserId;
      }
    }

    return dbPayload;
  }

  private async resolveEquipmentUnitId(payload: TicketUpsertPayload, product?: Product): Promise<string | null> {
    const explicitEquipmentId = this.normalizeUuid(payload.equipmentUnitId);
    if (explicitEquipmentId) {
      return explicitEquipmentId;
    }

    if (!product || (product.item_type ?? ProductItemType.Product) === ProductItemType.Service) {
      return null;
    }

    const serialNumber = payload.equipmentSerialNumber?.trim();
    if (!serialNumber) {
      return null;
    }

    const { data, error } = await this.supabase.client
      .from('equipment_units')
      .select('id')
      .eq('product_id', product.id)
      .eq('serial_number', serialNumber)
      .maybeSingle();

    if (error) {
      console.warn('[Tickets] No fue posible resolver equipment_unit_id', {
        productId: product.id,
        serialNumber,
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });
      return null;
    }

    return this.normalizeUuid(data?.id);
  }

  private normalizeUuid(value?: string | null): string | null {
    const normalized = String(value ?? '').trim();
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidPattern.test(normalized) ? normalized : null;
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
      .select('id, full_name, email, role, is_active');

    if (error) {
      this._technicians.set([]);
      this.techniciansLoaded = true;
      return;
    }

    const technicians = (data ?? [])
      .filter((profile: any) => profile.is_active !== false)
      .filter((profile: any) => ['technician', 'tecnico', 'técnico', 'staff', 'admin'].includes(String(profile.role ?? '').toLowerCase()))
      .map((profile: any) => ({
        id: String(profile.id ?? ''),
        fullName: String(profile.full_name ?? profile.email ?? '').trim(),
        role: profile.role ? String(profile.role) : undefined,
      }))
      .filter((technician: TicketTechnician) => this.normalizeUuid(technician.id) && technician.fullName);

    this._technicians.set(technicians.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es-MX')));
    this.techniciansLoaded = true;
  }

  private async ensureAssignedTechniciansAvailable(rows: any[]): Promise<void> {
    const missingIds = [...new Set(rows
      .map(row => this.normalizeUuid(row?.assigned_technician_id))
      .filter((id): id is string => !!id && !this._technicians().some(technician => technician.id === id))
    )];

    if (!missingIds.length) {
      return;
    }

    const { data, error } = await this.supabase.client
      .from(this.profilesTable)
      .select('id, full_name, email, role, is_active')
      .in('id', missingIds);

    if (error) {
      console.warn('[Tickets] No fue posible cargar perfiles de tecnicos asignados.', {
        technicianIds: missingIds,
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });
      return;
    }

    const assignedProfiles = (data ?? [])
      .map((profile: any) => ({
        id: String(profile.id ?? ''),
        fullName: String(profile.full_name ?? profile.email ?? '').trim(),
        role: profile.role ? String(profile.role) : undefined,
      }))
      .filter((technician: TicketTechnician) => this.normalizeUuid(technician.id) && technician.fullName);

    if (!assignedProfiles.length) {
      return;
    }

    const merged = new Map(this._technicians().map(technician => [technician.id, technician]));
    assignedProfiles.forEach(technician => merged.set(technician.id, technician));
    this._technicians.set(Array.from(merged.values()).sort((a, b) => a.fullName.localeCompare(b.fullName, 'es-MX')));
  }

  private mapTicket(row: any): ServiceTicket {
    const history = Array.isArray(row.history)
      ? row.history.map((item: any, index: number) => this.mapHistoryItem(item, row.status, index))
      : [];

    const assignedTechnicianId = this.normalizeUuid(row.assigned_technician_id);
    const assignedTechnicianCustomName = String(row.assigned_technician_custom_name ?? '').trim() || undefined;
    const assignedTechnician = assignedTechnicianId
      ? this._technicians().find(technician => technician.id === assignedTechnicianId)
      : undefined;

    // Resolver detalles del cliente vía join relacional
    const clientObj = row.clients;
    let clientName = 'Cliente no asociado';
    if (clientObj) {
      clientName = clientObj.trade_name 
        ? `${clientObj.business_name} (${clientObj.trade_name})` 
        : clientObj.business_name;
    } else if (row.client_name_snapshot) {
      clientName = row.client_name_snapshot;
    }

    // Resolver detalles del producto vía join relacional
    const productObj = row.products;
    let productName = 'Sin asociar';
    if (productObj) {
      productName = productObj.name;
    } else if (row.product_name_snapshot) {
      productName = row.product_name_snapshot;
    }

    // Resolver número de serie del equipo vía join relacional
    const eqObj = row.equipment_units;
    const serialNumber = eqObj ? eqObj.serial_number : (row.equipment_serial_number ?? undefined);

    return {
      id: String(row.id),
      ticketNumber: row.ticket_number ?? row.ticketNumber ?? 'Sin folio',
      clientId: String(row.client_id ?? ''),
      clientNameSnapshot: clientName,
      title: row.title ?? '',
      description: row.description ?? '',
      status: (row.status ?? TicketStatus.Open) as TicketStatus,
      priority: (row.priority ?? TicketPriority.Medium) as TicketPriority,
      type: (row.type ?? TicketType.Other) as TicketType,
      productId: row.product_id ?? undefined,
      productNameSnapshot: productName,
      equipmentSerialNumber: serialNumber,
      assignedTechnicianId: assignedTechnicianId ?? undefined,
      assignedTechnicianCustomName,
      assignedTechnicianName: assignedTechnicianCustomName ?? assignedTechnician?.fullName ?? row.assigned_technician?.full_name ?? undefined,
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

    if (lowered.includes('assigned_technician_custom_name') || lowered.includes('column')) {
      return new Error('Para asignar un técnico externo, primero debe habilitarse el campo de técnico manual.');
    }

    return new Error(fallback);
  }
}
