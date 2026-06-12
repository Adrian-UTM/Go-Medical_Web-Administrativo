import { Injectable, computed, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ClientSupabaseService } from '../../clients/services/client.supabase.service';
import { ProductSupabaseService } from '../../products/services/product.supabase.service';
import { Client, ClientStatus } from '../../../core/models/client.model';
import { Product, ProductItemType } from '../../../models/product.model';
import {
  ServiceTicket,
  TechnicalRouteCandidate,
  TicketFilters,
  TicketHistoryItem,
  TicketPriority,
  TicketStatus,
  TicketType,
  TicketTechnician,
  TicketUpsertPayload,
  ServiceTicketMessage,
} from '../models/ticket.model';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';

@Injectable({ providedIn: 'root' })
export class TicketSupabaseService {
  private readonly tableName = 'service_tickets';
  private readonly profilesTable = 'profiles';
  private readonly engineerRoles = new Set(['technician']);
  private readonly nonEngineerRoles = new Set(['admin', 'super_admin', 'staff', 'client']);

  private readonly _technicians = signal<TicketTechnician[]>([]);
  private readonly assignedProfileNames = new Map<string, string>();
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
          phone,
          billing_address,
          shipping_address,
          city,
          state,
          country
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
          phone,
          billing_address,
          shipping_address,
          city,
          state,
          country
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

  async getRouteCandidates(): Promise<TechnicalRouteCandidate[]> {
    const { data, error } = await this.supabase.client
      .from('technical_route_candidates')
      .select('service_city, service_state, service_region, services_count')
      .order('services_count', { ascending: false });

    if (error) {
      console.warn('[Tickets] No fue posible cargar candidatos de ruta tecnica.', {
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });
      return [];
    }

    return (data ?? []).map((row: any) => ({
      serviceCity: String(row.service_city ?? '').trim(),
      serviceState: String(row.service_state ?? '').trim(),
      serviceRegion: String(row.service_region ?? '').trim() || undefined,
      count: Number(row.services_count ?? 0),
      servicesCount: Number(row.services_count ?? 0),
    })).filter(candidate => candidate.serviceCity && candidate.serviceState);
  }

  async authorizeExternalRouteForTicket(
    ticketId: string,
    notes = 'Ruta externa autorizada administrativamente.'
  ): Promise<ServiceTicket | undefined> {
    const current = await this.getRawTicket(ticketId);
    if (!current) {
      return undefined;
    }

    if (this.isTerminalStatus(current.status)) {
      throw new Error('Los tickets cerrados o cancelados no permiten acciones operativas.');
    }

    const city = String(current.service_city ?? '').trim();
    const state = String(current.service_state ?? '').trim();
    const region = String(current.service_region ?? '').trim() || null;

    if (!city || !state || this.isMeridaLocation(city, state)) {
      throw new Error('Solo las solicitudes fuera de Mérida requieren autorización de ruta.');
    }

    const compatibleTickets = await this.getCompatibleExternalTickets(city, state);
    if (compatibleTickets.length < 3) {
      throw new Error('Ruta pendiente: se requieren al menos 3 servicios en esta ubicación.');
    }

    const now = new Date().toISOString();
    const routePayload: Record<string, unknown> = {
      city,
      state,
      region,
      status: 'authorized',
      authorized_by: this.normalizeUuid(this.authService.currentUserId()),
      authorized_at: now,
      notes: notes.trim() || null,
      updated_at: now,
    };

    const { data: route, error: routeError } = await this.supabase.client
      .from('technical_service_routes')
      .insert(routePayload)
      .select('id')
      .single();

    if (routeError) {
      console.error('[Tickets] Error authorizing technical route', {
        city,
        state,
        error: routeError,
        message: routeError?.message,
        details: routeError?.details,
        hint: routeError?.hint,
        code: routeError?.code,
      });
      throw this.toAppError(routeError.message, 'No fue posible autorizar la ruta técnica.');
    }

    const routeId = String(route?.id ?? '');
    if (!routeId) {
      throw new Error('No fue posible identificar la ruta técnica autorizada.');
    }

    const routeItems = compatibleTickets.map(ticket => ({
      route_id: routeId,
      ticket_id: ticket.id,
    }));

    const { error: itemsError } = await this.supabase.client
      .from('technical_service_route_tickets')
      .insert(routeItems);

    if (itemsError) {
      console.error('[Tickets] Error linking tickets to technical route', {
        routeId,
        routeItems,
        error: itemsError,
        message: itemsError?.message,
        details: itemsError?.details,
        hint: itemsError?.hint,
        code: itemsError?.code,
      });
      throw this.toAppError(itemsError.message, 'No fue posible vincular los tickets a la ruta técnica.');
    }

    const compatibleIds = compatibleTickets.map(ticket => ticket.id);
    const { error: updateError } = await this.supabase.client
      .from(this.tableName)
      .update({
        route_required: true,
        route_authorized: true,
        route_notes: notes.trim() || null,
        updated_at: now,
      })
      .in('id', compatibleIds);

    if (updateError) {
      console.error('[Tickets] Error marking route as authorized on tickets', {
        routeId,
        ticketIds: compatibleIds,
        error: updateError,
        message: updateError?.message,
        details: updateError?.details,
        hint: updateError?.hint,
        code: updateError?.code,
      });
      throw this.toAppError(updateError.message, 'La ruta fue creada, pero no fue posible actualizar los tickets.');
    }

    return this.getTicketById(ticketId);
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
          phone,
          billing_address,
          shipping_address,
          city,
          state,
          country
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

    const updatePayload = await this.buildDbPayload(payload, true, current);
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
          phone,
          billing_address,
          shipping_address,
          city,
          state,
          country
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
          phone,
          billing_address,
          shipping_address,
          city,
          state,
          country
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

    if (this.isTerminalStatus(current.status)) {
      throw new Error('Los tickets cerrados o cancelados no permiten reasignar ingeniero.');
    }

    const nextStatus = current.status === TicketStatus.Open ? TicketStatus.Assigned : current.status;
    const selectedEngineer = this._technicians().find(technician => technician.id === technicianId);
    if (!selectedEngineer) {
      throw new Error('Selecciona un ingeniero de servicio válido.');
    }

    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
      assigned_technician_id: this.normalizeUuid(technicianId),
      assigned_technician_custom_name: null,
    };

    const history = this.appendHistoryIfSupported(current, {
      status: nextStatus,
      comment: `Ticket asignado a ${selectedEngineer.fullName}.`,
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
          phone,
          billing_address,
          shipping_address,
          city,
          state,
          country
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
      throw this.toAppError(error.message, 'No fue posible asignar el ingeniero de servicio.');
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

    if (this.isTerminalStatus(current.status)) {
      throw new Error('Los tickets cerrados o cancelados no permiten reasignar ingeniero.');
    }

    const normalizedName = technicianName.trim();
    if (!normalizedName) {
      throw new Error('Ingresa el nombre del ingeniero externo.');
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
      throw this.toAppError(error.message, 'No fue posible asignar el ingeniero externo.');
    }

    return this.mapTicket(data);
  }

  async scheduleService(
    id: string,
    scheduledStartAt: string,
    scheduledEndAt: string | null,
    notes: string,
    technicianId?: string | null,
    customTechName?: string | null,
    serviceType?: TicketType
  ): Promise<ServiceTicket | undefined> {
    const current = await this.getRawTicket(id);
    if (!current) return undefined;

    if (this.isTerminalStatus(current.status)) {
      throw new Error('Los tickets cerrados o cancelados no permiten programar servicio.');
    }

    const address = String(current.service_address ?? current.client_address ?? '').trim();
    const city = String(current.service_city ?? current.client_city ?? '').trim();
    const state = String(current.service_state ?? current.client_state ?? '').trim();
    if (!address && !city) {
      throw new Error('Falta dirección de atención. No se puede programar el servicio.');
    }

    const startIso = this.toIsoOrNull(scheduledStartAt);
    const endIso = scheduledEndAt ? this.toIsoOrNull(scheduledEndAt) : null;

    if (startIso && endIso && new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      throw new Error('La hora de fin debe ser posterior a la hora de inicio.');
    }

    const resolvedTechId = technicianId ? this.normalizeUuid(technicianId) : null;
    if (resolvedTechId && startIso) {
      const hasConflict = await this.hasTechnicianScheduleConflict(resolvedTechId, startIso, id);
      if (hasConflict) {
        throw new Error('El ingeniero seleccionado ya tiene un servicio programado en ese horario.');
      }
    }

    const resolvedCustomName = !resolvedTechId && customTechName ? customTechName.trim() : null;
    const nextStatus = current.status === TicketStatus.Open || current.status === TicketStatus.Assigned
      ? TicketStatus.InProgress
      : current.status;

    const updatePayload: Record<string, unknown> = {
      scheduled_start_at: startIso,
      scheduled_end_at: endIso,
      notes: notes.trim() || current.notes || null,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    if (serviceType) updatePayload['type'] = serviceType;
    if (resolvedTechId) {
      updatePayload['assigned_technician_id'] = resolvedTechId;
      updatePayload['assigned_technician_custom_name'] = null;
    } else if (resolvedCustomName) {
      updatePayload['assigned_technician_id'] = null;
      updatePayload['assigned_technician_custom_name'] = resolvedCustomName;
    }

    const history = this.appendHistoryIfSupported(current, {
      status: nextStatus as TicketStatus,
      comment: `Servicio programado para ${new Date(startIso!).toLocaleString('es-MX')}.`,
      authorName: 'Coordinacion tecnica',
    });
    if (history) updatePayload['history'] = history;

    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .update(updatePayload)
      .eq('id', id)
      .select(`*, clients!client_id(business_name,trade_name,contact_name,email,phone,billing_address,shipping_address,city,state,country), products!product_id(name,sku,item_type), equipment_units!equipment_unit_id(serial_number)`)
      .single();

    if (error) {
      console.error('[Tickets] Error scheduling service', { ticketId: id, error });
      throw this.toAppError(error.message, 'No fue posible programar el servicio.');
    }

    return this.mapTicket(data);
  }

  private async buildDbPayload(payload: TicketUpsertPayload, isUpdate = false, current?: any): Promise<Record<string, unknown>> {
    const product = payload.productId ? (await this.getAvailableProducts()).find(item => item.id === payload.productId) : undefined;
    const equipmentUnitId = await this.resolveEquipmentUnitId(payload, product);
    const assignedTechnicianId = this.normalizeUuid(payload.assignedTechnicianId);
    const assignedTechnicianCustomName = assignedTechnicianId
      ? null
      : payload.assignedTechnicianCustomName?.trim() || null;
    const client = payload.clientId ? await this.getClientById(payload.clientId) : undefined;
    const serviceAddress = this.toNullable(payload.serviceAddress ?? current?.service_address ?? client?.formattedShippingAddress ?? client?.formattedBillingAddress ?? client?.shippingAddress ?? client?.address);
    const serviceCity = this.toNullable(payload.serviceCity ?? current?.service_city ?? client?.city);
    const serviceState = this.toNullable(payload.serviceState ?? current?.service_state ?? client?.state);
    const serviceRegion = this.toNullable(payload.serviceRegion ?? current?.service_region);
    const scheduledStartAt = this.toIsoOrNull(payload.scheduledStartAt ?? payload.scheduledAt ?? current?.scheduled_start_at);
    const scheduledEndAt = this.toIsoOrNull(payload.scheduledEndAt ?? current?.scheduled_end_at);
    const requestedServiceDate = this.toDateOrNull(payload.requestedServiceDate ?? current?.requested_service_date);
    const isLocalService = serviceCity && serviceState ? this.isMeridaLocation(serviceCity, serviceState) : false;
    const routeRequired = !!serviceCity && !!serviceState && !isLocalService;
    const routeAuthorized = routeRequired ? Boolean(payload.routeAuthorized ?? current?.route_authorized ?? false) : false;

    if (scheduledStartAt && scheduledEndAt && new Date(scheduledEndAt).getTime() <= new Date(scheduledStartAt).getTime()) {
      throw new Error('La hora de fin debe ser posterior a la hora de inicio.');
    }

    if (assignedTechnicianId && scheduledStartAt) {
      const hasConflict = await this.hasTechnicianScheduleConflict(assignedTechnicianId, scheduledStartAt, current?.id);
      if (hasConflict) {
        throw new Error('El ingeniero seleccionado ya tiene un servicio programado en ese horario.');
      }
    }

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
      service_address: serviceAddress,
      service_city: serviceCity,
      service_state: serviceState,
      service_region: serviceRegion,
      requested_service_date: requestedServiceDate,
      scheduled_start_at: scheduledStartAt,
      scheduled_end_at: scheduledEndAt,
      is_local_service: isLocalService,
      route_required: routeRequired,
      route_authorized: routeAuthorized,
      route_notes: this.toNullable(payload.routeNotes ?? current?.route_notes),
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
      .filter((profile: any) => this.isServiceEngineerRole(profile.role))
      .map((profile: any) => ({
        id: String(profile.id ?? ''),
        fullName: String(profile.full_name ?? profile.email ?? '').trim(),
        role: profile.role ? String(profile.role) : undefined,
      }))
      .filter((technician: TicketTechnician) => this.normalizeUuid(technician.id) && technician.fullName);

    technicians.forEach(technician => this.assignedProfileNames.set(technician.id, technician.fullName));

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
      console.warn('[Tickets] No fue posible cargar perfiles de ingenieros asignados.', {
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

    assignedProfiles.forEach(profile => this.assignedProfileNames.set(profile.id, profile.fullName));
    const assignableProfiles = assignedProfiles.filter(profile => this.isServiceEngineerRole(profile.role));
    const merged = new Map(this._technicians().map(technician => [technician.id, technician]));
    assignableProfiles.forEach(technician => merged.set(technician.id, technician));
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
    const clientAddress = String(clientObj?.shipping_address ?? clientObj?.billing_address ?? '').trim() || undefined;
    const clientCity = String(clientObj?.city ?? '').trim() || undefined;
    const clientState = String(clientObj?.state ?? '').trim() || undefined;
    const clientCountry = String(clientObj?.country ?? '').trim() || undefined;
    const serviceAddress = String(row.service_address ?? clientAddress ?? '').trim() || undefined;
    const serviceCity = String(row.service_city ?? clientCity ?? '').trim() || undefined;
    const serviceState = String(row.service_state ?? clientState ?? '').trim() || undefined;
    const serviceRegion = String(row.service_region ?? '').trim() || undefined;
    const isLocalService = typeof row.is_local_service === 'boolean'
      ? row.is_local_service
      : !!serviceCity && !!serviceState && this.isMeridaLocation(serviceCity, serviceState);

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
      assignedTechnicianName: assignedTechnicianCustomName ?? assignedTechnician?.fullName ?? (assignedTechnicianId ? this.assignedProfileNames.get(assignedTechnicianId) : undefined) ?? row.assigned_technician?.full_name ?? undefined,
      clientAddress,
      clientCity,
      clientState,
      clientCountry,
      serviceAddress,
      serviceCity,
      serviceState,
      serviceRegion,
      requestedServiceDate: row.requested_service_date ?? undefined,
      scheduledStartAt: row.scheduled_start_at ?? undefined,
      scheduledEndAt: row.scheduled_end_at ?? undefined,
      isLocalService,
      routeRequired: typeof row.route_required === 'boolean' ? row.route_required : (!!serviceCity && !!serviceState && !isLocalService),
      routeAuthorized: Boolean(row.route_authorized),
      routeNotes: row.route_notes ?? undefined,
      requestedAt: row.requested_at ?? row.created_at ?? new Date().toISOString(),
      scheduledAt: row.scheduled_start_at ?? row.scheduled_at ?? undefined,
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

  private isServiceEngineerRole(role: unknown): boolean {
    const normalized = this.normalizeLocationText(role);
    return this.engineerRoles.has(normalized) && !this.nonEngineerRoles.has(normalized);
  }

  private async getCompatibleExternalTickets(city: string, state: string): Promise<any[]> {
    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .select('id, status, service_city, service_state, service_region, route_required, route_authorized')
      .eq('route_required', true);

    if (error) {
      console.error('[Tickets] Error loading compatible external tickets', {
        city,
        state,
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });
      throw this.toAppError(error.message, 'No fue posible validar los servicios compatibles para la ruta.');
    }

    const normalizedCity = this.normalizeLocationText(city);
    const normalizedState = this.normalizeLocationText(state);

    return (data ?? []).filter((ticket: any) =>
      this.normalizeLocationText(ticket.service_city) === normalizedCity &&
      this.normalizeLocationText(ticket.service_state) === normalizedState &&
      !this.isTerminalStatus(ticket.status) &&
      ticket.route_authorized !== true
    );
  }

  async getMessages(ticketId: string): Promise<ServiceTicketMessage[]> {
    const { data, error } = await this.supabase.client
      .from('service_ticket_messages')
      .select(`
        *,
        profiles (
          full_name,
          role
        )
      `)
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('No se pudieron cargar los mensajes del ticket.', error);
      return [];
    }

    return (data || []).map((row: any) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        ticketId: row.ticket_id,
        senderType: row.sender_type,
        senderProfileId: row.sender_profile_id,
        message: row.message,
        attachmentUrl: row.attachment_url,
        isInternal: row.is_internal,
        createdAt: row.created_at,
        readAt: row.read_at,
        senderName: profile?.full_name || 'Usuario desconocido',
        senderRole: profile?.role || 'admin'
      };
    });
  }

  async uploadMessageAttachment(file: File, ticketId: string): Promise<string> {
    const ext = file.name.split('.').pop();
    const fileName = `${ticketId}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
    
    const { data, error } = await this.supabase.client.storage
      .from('ticket-attachments')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (error) {
      console.error('Error uploading message attachment:', error);
      throw new Error('No fue posible subir la imagen.');
    }

    const { data: publicUrlData } = this.supabase.client.storage
      .from('ticket-attachments')
      .getPublicUrl(data.path);

    return publicUrlData.publicUrl;
  }

  async sendMessage(ticketId: string, message: string, attachmentUrl?: string, isInternal = false): Promise<ServiceTicketMessage | null> {
    const userId = this.authService.currentUserId();
    if (!userId) throw new Error('Usuario no autenticado.');

    const payload = {
      ticket_id: ticketId,
      sender_type: 'staff',
      sender_profile_id: userId,
      message: message.trim(),
      attachment_url: attachmentUrl || null,
      is_internal: isInternal
    };

    const { data, error } = await this.supabase.client
      .from('service_ticket_messages')
      .insert(payload)
      .select(`
        *,
        profiles (
          full_name,
          role
        )
      `)
      .single();

    if (error) {
      console.error('Error al enviar mensaje del ticket:', error);
      throw new Error('No fue posible enviar el mensaje.');
    }

    return {
      id: data.id,
      ticketId: data.ticket_id,
      senderType: data.sender_type,
      senderProfileId: data.sender_profile_id,
      message: data.message,
      attachmentUrl: data.attachment_url,
      isInternal: data.is_internal,
      createdAt: data.created_at,
      readAt: data.read_at,
      senderName: data.profiles?.full_name || 'Tú',
      senderRole: data.profiles?.role || 'admin'
    };
  }

  async getUnreadMessagesCountByTicket(): Promise<Record<string, number>> {
    const { data, error } = await this.supabase.client
      .from('service_ticket_messages')
      .select('ticket_id')
      .eq('sender_type', 'client')
      .is('read_at', null);

    if (error) {
      console.warn('Error al obtener conteo de mensajes no leídos:', error);
      return {};
    }

    const counts: Record<string, number> = {};
    (data || []).forEach((row: any) => {
      if (row.ticket_id) {
        counts[row.ticket_id] = (counts[row.ticket_id] || 0) + 1;
      }
    });
    return counts;
  }

  async markMessagesAsRead(ticketId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('service_ticket_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('ticket_id', ticketId)
      .eq('sender_type', 'client')
      .is('read_at', null);

    if (error) {
      console.warn(`Error al marcar mensajes como leídos para ticket ${ticketId}:`, error);
    }
  }

  private async hasTechnicianScheduleConflict(technicianId: string, scheduledStartAt: string, exceptTicketId?: string): Promise<boolean> {
    let query = this.supabase.client
      .from(this.tableName)
      .select('id, status', { count: 'exact', head: true })
      .eq('assigned_technician_id', technicianId)
      .eq('scheduled_start_at', scheduledStartAt)
      .neq('status', 'closed')
      .neq('status', 'cancelled');

    if (exceptTicketId) {
      query = query.neq('id', exceptTicketId);
    }

    const { count, error } = await query;
    if (error) {
      console.warn('[Tickets] No fue posible validar conflicto de agenda.', {
        technicianId,
        scheduledStartAt,
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });
      return false;
    }

    return (count ?? 0) > 0;
  }

  private isTerminalStatus(status: unknown): boolean {
    const normalized = this.normalizeLocationText(status);
    return normalized === 'closed' || normalized === 'cancelled' || normalized === 'canceled' || normalized === 'cerrado' || normalized === 'cancelado';
  }

  private isMeridaLocation(city?: string | null, state?: string | null): boolean {
    const normalizedCity = this.normalizeLocationText(city);
    const normalizedState = this.normalizeLocationText(state);

    return normalizedCity === 'merida' && (normalizedState === 'yucatan' || normalizedState === 'yuc');
  }

  private normalizeLocationText(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private toNullable(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : null;
  }

  private toIsoOrNull(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return null;
    }

    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private toDateOrNull(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return null;
    }

    return normalized.slice(0, 10);
  }

  private toAppError(message: string, fallback: string): Error {
    const lowered = message.toLowerCase();
    if (lowered.includes('permission') || lowered.includes('rls') || lowered.includes('policy')) {
      return new Error('No tienes permisos para consultar o modificar tickets de soporte.');
    }

    if (lowered.includes('assigned_technician_custom_name') || lowered.includes('column')) {
      return new Error('Para asignar un ingeniero externo, primero debe habilitarse el campo de nombre manual.');
    }

    return new Error(fallback);
  }
}
