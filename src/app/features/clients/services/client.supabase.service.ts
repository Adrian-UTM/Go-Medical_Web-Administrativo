import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  Client,
  ClientAddressDetails,
  ClientFilters,
  ClientStatus,
  ClientType,
} from '../../../core/models/client.model';

export interface ClientHistoryOrder {
  id: string;
  folio: string;
  status: string;
  total: number;
  createdAt: string;
}

export interface ClientHistoryQuote {
  id: string;
  folio: string;
  status: string;
  total: number;
  createdAt: string;
}

export interface ClientHistoryTicket {
  id: string;
  folio: string;
  title: string;
  status: string;
  priority: string;
  technicianName: string;
  createdAt: string;
}

export interface ClientHistoryReturnRequest {
  id: string;
  folio: string;
  orderId: string;
  orderFolio: string;
  status: string;
  reason: string;
  createdAt: string;
}

export interface ClientHistorySnapshot {
  orders: ClientHistoryOrder[];
  quotes: ClientHistoryQuote[];
  tickets: ClientHistoryTicket[];
  returnRequests: ClientHistoryReturnRequest[];
  returnRequestsUnavailable?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ClientSupabaseService {
  private readonly tableName = 'clients';
  private readonly protectedDeleteMessage = 'No es posible eliminar este cliente porque tiene pedidos, cotizaciones, tickets o devoluciones asociadas.';
  private readonly allowedClientTypes = new Set<string>(Object.values(ClientType));
  private readonly allowedStatuses = new Set<string>(Object.values(ClientStatus));

  constructor(private supabase: SupabaseService) {}

  getClients(filters?: ClientFilters): Observable<Client[]> {
    let query = this.supabase.client
      .from(this.tableName)
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.search) {
      query = query.or(
        `business_name.ilike.%${filters.search}%,trade_name.ilike.%${filters.search}%,contact_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,rfc.ilike.%${filters.search}%`
      );
    }

    if (filters?.clientType) {
      let mappedType: string = filters.clientType;
      if (filters.clientType === ClientType.Hospital) {
        mappedType = 'clinica';
      } else if (filters.clientType === ClientType.Empresa) {
        mappedType = 'otro';
      }
      query = query.eq('client_type', mappedType);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    return from(
      this.supabase.client
        .from('profiles')
        .select('email')
        .neq('role', 'client')
    ).pipe(
      switchMap(({ data: internalProfiles }) => {
        const internalEmails = new Set(
          (internalProfiles ?? [])
            .map(p => String(p.email ?? '').trim().toLowerCase())
            .filter(Boolean)
        );

        return from(query).pipe(
          map(({ data, error }) => {
            if (error) {
              throw this.toAppError(error.message, 'No fue posible cargar los clientes.');
            }

            return (data ?? [])
              .filter(item => {
                const email = String(item.email ?? '').trim().toLowerCase();
                return !internalEmails.has(email) && this.isCommercialClientRecord(item);
              })
              .map(item => this.mapToLegacyClient(item));
          })
        );
      })
    );
  }

  getClientById(id: string): Observable<Client> {
    return from(
      this.supabase.client
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          throw this.toAppError(error.message, 'No fue posible cargar el cliente solicitado.');
        }

        if (!this.isCommercialClientRecord(data)) {
          throw new Error('El cliente solicitado no está disponible.');
        }

        return this.mapToLegacyClient(data);
      })
    );
  }

  createClient(clientData: Partial<Client>): Observable<Client> {
    return from(this.persistClient('insert', clientData));
  }

  updateClient(id: string, clientData: Partial<Client>): Observable<Client> {
    return from(this.persistClient('update', clientData, id));
  }

  deleteClient(id: string): Observable<void> {
    return from(this.deleteClientSafely(id));
  }

  getClientHistory(clientId: string): Observable<ClientHistorySnapshot> {
    return from(this.loadClientHistory(clientId));
  }

  private async persistClient(mode: 'insert' | 'update', clientData: Partial<Client>, id?: string): Promise<Client> {
    const payload = this.mapToSupabasePayload(clientData);

    const savedClient = mode === 'insert'
      ? await this.executeClientMutation('insert', payload)
      : await this.executeClientMutation('update', payload, id);

    const clientId = String(savedClient?.id ?? id ?? '').trim();
    if (!clientId) {
      throw new Error('No fue posible identificar el cliente guardado.');
    }

    try {
      const rawClient = await this.fetchRawClientById(clientId);
      if (this.isCommercialClientRecord(rawClient)) {
        return this.mapToLegacyClient(rawClient);
      }
    } catch {
      // Si el registro principal se guardó pero la recarga inmediata falla,
      // devolvemos una versión consistente basada en los datos recién guardados.
    }

    return this.buildFallbackClient(savedClient, clientData, clientId);
  }

  private async deleteClientSafely(id: string): Promise<void> {
    const relations = await this.getClientRelationCounts(id);
    if (relations.orders + relations.quotes + relations.tickets + relations.returnRequests > 0) {
      throw new Error(this.protectedDeleteMessage);
    }

    const { error } = await this.supabase.client
      .from(this.tableName)
      .delete()
      .eq('id', id);

    if (error) {
      throw this.toAppError(error.message, 'No fue posible eliminar el cliente.');
    }
  }

  private async getClientRelationCounts(id: string): Promise<{ orders: number; quotes: number; tickets: number; returnRequests: number }> {
    const [orders, quotes, tickets, returnRequests] = await Promise.all([
      this.countClientRelations('orders', id),
      this.countClientRelations('quotes', id),
      this.countClientRelations('service_tickets', id),
      this.countClientRelations('return_requests', id),
    ]);

    return { orders, quotes, tickets, returnRequests };
  }

  private async countClientRelations(table: string, clientId: string): Promise<number> {
    const { count, error } = await this.supabase.client
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId);

    if (error) {
      console.error('[Clients] Error checking client relations', {
        table,
        clientId,
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw this.toAppError(error.message, 'No fue posible verificar si el cliente tiene historial asociado.');
    }

    return count ?? 0;
  }

  private async loadClientHistory(clientId: string): Promise<ClientHistorySnapshot> {
    let ordersData: any[] = [];
    let quotesData: any[] = [];
    let ticketsData: any[] = [];
    let returnsData: any[] = [];
    let returnRequestsUnavailable = false;

    let ordersFailed = false;
    let quotesFailed = false;
    let ticketsFailed = false;

    // 1. Cargar Pedidos de forma segura
    try {
      const res = await this.supabase.client
        .from('orders')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (res.error) {
        ordersFailed = true;
        console.error('[Clients] Error loading client orders history', {
          clientId,
          error: res.error,
          message: res.error.message,
          code: res.error.code
        });
      } else {
        ordersData = res.data ?? [];
      }
    } catch (err) {
      ordersFailed = true;
      console.error('[Clients] Exception loading client orders history', err);
    }

    // 2. Cargar Cotizaciones de forma segura
    try {
      const res = await this.supabase.client
        .from('quotes')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (res.error) {
        quotesFailed = true;
        console.error('[Clients] Error loading client quotes history', {
          clientId,
          error: res.error,
          message: res.error.message,
          code: res.error.code
        });
      } else {
        quotesData = res.data ?? [];
      }
    } catch (err) {
      quotesFailed = true;
      console.error('[Clients] Exception loading client quotes history', err);
    }

    // 3. Cargar Tickets de soporte de forma segura
    try {
      const res = await this.supabase.client
        .from('service_tickets')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (res.error) {
        ticketsFailed = true;
        console.error('[Clients] Error loading client tickets history', {
          clientId,
          error: res.error,
          message: res.error.message,
          code: res.error.code
        });
      } else {
        ticketsData = res.data ?? [];
      }
    } catch (err) {
      ticketsFailed = true;
      console.error('[Clients] Exception loading client tickets history', err);
    }

    // 4. Cargar Devoluciones de forma segura (Opcional/Complementaria)
    try {
      const res = await this.supabase.client
        .from('return_requests')
        .select('*')
        .eq('client_id', clientId)
        .order('requested_at', { ascending: false });
      if (res.error) {
        returnRequestsUnavailable = true;
        console.warn('[Clients] Return requests history unavailable', {
          clientId,
          error: res.error,
          message: res.error.message,
          code: res.error.code
        });
      } else {
        returnsData = res.data ?? [];
      }
    } catch (err) {
      returnRequestsUnavailable = true;
      console.warn('[Clients] Exception loading client return requests history', err);
    }

    // Si fallan todas las consultas principales, lanzar un error fatal
    if (ordersFailed && quotesFailed && ticketsFailed) {
      throw new Error('No fue posible cargar el historial del cliente.');
    }

    const technicianIds = [
      ...new Set(ticketsData
        .map((ticket: any) => String(ticket.assigned_technician_id ?? '').trim())
        .filter(Boolean)
      ),
    ];
    const technicianNames = await this.getTechnicianNames(technicianIds);
    const orderFolios = new Map(ordersData.map((row: any) => [
      String(row.id),
      String(row.order_number ?? row.folio ?? `PED-${this.getShortId(row.id)}`),
    ]));

    return {
      orders: ordersData.map((row: any) => ({
        id: String(row.id),
        folio: row.order_number ?? row.folio ?? `PED-${this.getShortId(row.id)}`,
        status: String(row.status ?? ''),
        total: Number(row.total ?? row.total_amount ?? 0),
        createdAt: row.created_at ?? row.updated_at ?? new Date().toISOString(),
      })),
      quotes: quotesData.map((row: any) => ({
        id: String(row.id),
        folio: row.quote_number ?? `COT-${this.getShortId(row.id)}`,
        status: String(row.status ?? ''),
        total: Number(row.total ?? 0),
        createdAt: row.created_at ?? row.updated_at ?? new Date().toISOString(),
      })),
      tickets: ticketsData.map((row: any) => ({
        id: String(row.id),
        folio: row.ticket_number ?? `TKT-${this.getShortId(row.id)}`,
        title: row.title ?? 'Ticket de soporte',
        status: String(row.status ?? ''),
        priority: String(row.priority ?? ''),
        technicianName: String(row.assigned_technician_custom_name ?? '').trim()
          || technicianNames.get(String(row.assigned_technician_id ?? '').trim())
          || 'Sin tecnico asignado',
        createdAt: row.requested_at ?? row.created_at ?? row.updated_at ?? new Date().toISOString(),
      })),
      returnRequests: returnsData.map((row: any) => ({
        id: String(row.id),
        folio: row.return_number ?? `DEV-${this.getShortId(row.id)}`,
        orderId: String(row.order_id ?? ''),
        orderFolio: orderFolios.get(String(row.order_id ?? '')) ?? (row.order_number_snapshot ?? row.order_number ?? 'Pedido no disponible'),
        status: String(row.status ?? ''),
        reason: String(row.reason ?? ''),
        createdAt: row.requested_at ?? row.created_at ?? row.updated_at ?? new Date().toISOString(),
      })),
      returnRequestsUnavailable
    };
  }

  private async getTechnicianNames(technicianIds: string[]): Promise<Map<string, string>> {
    if (!technicianIds.length) {
      return new Map();
    }

    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('id, full_name, email')
      .in('id', technicianIds);

    if (error) {
      return new Map();
    }

    return new Map((data ?? []).map((profile: any) => [
      String(profile.id),
      String(profile.full_name ?? profile.email ?? '').trim(),
    ]));
  }

  private async fetchRawClientById(id: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw this.toAppError(error?.message ?? '', 'No fue posible recuperar el cliente guardado.');
    }

    return data;
  }

  private resolveUseBillingForShipping(clientData: Partial<Client>, billingDetails: ClientAddressDetails): boolean {
    if (typeof clientData.useBillingAddressForShipping === 'boolean') {
      return clientData.useBillingAddressForShipping;
    }

    const explicitShipping = String(clientData.shippingAddress ?? '').trim();
    if (!explicitShipping) {
      return true;
    }

    const shippingDetails = this.parseStructuredAddress(
      explicitShipping,
      clientData.city,
      clientData.state,
      undefined,
      clientData.country,
    );

    return this.serializeAddressFingerprint(shippingDetails) === this.serializeAddressFingerprint(billingDetails);
  }

  private resolveBillingAddressDetails(clientData: Partial<Client>): ClientAddressDetails {
    return this.normalizeAddressDetails(
      clientData.billingAddressDetails
        ?? this.parseStructuredAddress(
          clientData.formattedBillingAddress ?? clientData.address,
          clientData.city,
          clientData.state,
          undefined,
          clientData.country,
        )
    );
  }

  private resolveShippingAddressDetails(clientData: Partial<Client>, fallback: ClientAddressDetails): ClientAddressDetails {
    if (clientData.shippingAddressDetails) {
      return this.normalizeAddressDetails(clientData.shippingAddressDetails);
    }

    const parsed = this.parseStructuredAddress(
      clientData.formattedShippingAddress ?? clientData.shippingAddress,
      clientData.city,
      clientData.state,
      undefined,
      clientData.country,
    );

    if (!this.serializeAddressFingerprint(parsed)) {
      return fallback;
    }

    return parsed;
  }

  private parseStructuredAddress(
    addressText?: string,
    city?: string,
    state?: string,
    postalCode?: string,
    country?: string,
  ): ClientAddressDetails {
    const raw = String(addressText ?? '').trim();
    const normalizedCity = String(city ?? '').trim();
    const normalizedState = String(state ?? '').trim();
    const normalizedCountry = String(country ?? '').trim() || 'México';
    const extractedPostalCode = String(postalCode ?? '').trim() || this.extractPostalCode(raw);

    const segments = raw
      .split(',')
      .map(segment => segment.trim())
      .filter(Boolean);

    const primarySegment = segments[0] ?? '';
    const neighborhoodSegment = segments.find(segment => /^col\.?\s+/i.test(segment)) ?? '';
    const numberMatch = primarySegment.match(/^(?<street>.+?)\s+#(?<exterior>[^,]+?)(?:\s+Int\.?\s+(?<interior>.+))?$/i);

    return this.normalizeAddressDetails({
      street: numberMatch?.groups?.['street'] ?? primarySegment,
      exteriorNumber: numberMatch?.groups?.['exterior'] ?? '',
      interiorNumber: numberMatch?.groups?.['interior'] ?? '',
      neighborhood: neighborhoodSegment.replace(/^col\.?\s+/i, '').trim(),
      postalCode: extractedPostalCode,
      city: normalizedCity,
      state: normalizedState,
      country: normalizedCountry,
    });
  }

  private normalizeAddressDetails(details?: Partial<ClientAddressDetails>): ClientAddressDetails {
    return {
      street: String(details?.street ?? '').trim(),
      exteriorNumber: String(details?.exteriorNumber ?? '').trim(),
      interiorNumber: String(details?.interiorNumber ?? '').trim(),
      neighborhood: String(details?.neighborhood ?? '').trim(),
      postalCode: String(details?.postalCode ?? '').trim(),
      city: String(details?.city ?? '').trim(),
      state: String(details?.state ?? '').trim(),
      country: String(details?.country ?? '').trim() || 'México',
    };
  }

  private formatAddressLine(details: ClientAddressDetails): string {
    const primarySegment = [
      details.street,
      details.exteriorNumber ? `#${details.exteriorNumber}` : '',
      details.interiorNumber ? `Int. ${details.interiorNumber}` : '',
    ].filter(Boolean).join(' ').trim();

    return [
      primarySegment,
      details.neighborhood ? `Col. ${details.neighborhood}` : '',
      details.postalCode ? `C.P. ${details.postalCode}` : '',
    ].filter(Boolean).join(', ');
  }

  private formatFullAddress(details: ClientAddressDetails): string {
    return [
      this.formatAddressLine(details),
      details.city,
      details.state,
      details.country,
    ].filter(Boolean).join(', ');
  }

  private serializeAddressFingerprint(details: ClientAddressDetails): string {
    return [
      details.street,
      details.exteriorNumber,
      details.interiorNumber,
      details.neighborhood,
      details.postalCode,
      details.city,
      details.state,
      details.country,
    ]
      .map(value => String(value ?? '').trim().toLowerCase())
      .filter(Boolean)
      .join('|');
  }

  private extractPostalCode(raw: string): string {
    const match = String(raw ?? '').match(/c\.?p\.?\s*([0-9A-Za-z-]+)/i);
    return match?.[1]?.trim() ?? '';
  }

  private getShortId(value: unknown): string {
    return String(value ?? '').replace(/-/g, '').slice(0, 8).toUpperCase() || '0000';
  }

  private mapToSupabasePayload(clientData: Partial<Client>): Record<string, any> {
    const billingDetails = this.resolveBillingAddressDetails(clientData);
    const useBillingForShipping = this.resolveUseBillingForShipping(clientData, billingDetails);
    const shippingDetails = useBillingForShipping
      ? billingDetails
      : this.resolveShippingAddressDetails(clientData, billingDetails);

    let mappedClientType = clientData.clientType ?? clientData.client_type ?? ClientType.Otro;
    if (mappedClientType === ClientType.Hospital) {
      mappedClientType = ClientType.Clinica;
    } else if (mappedClientType === ClientType.Empresa) {
      mappedClientType = ClientType.Otro;
    }

    const payload: Record<string, any> = {
      client_type: mappedClientType,
      status: clientData.status ?? ClientStatus.Active,
      business_name: this.toNullable(clientData.businessName ?? clientData.business_name),
      trade_name: this.toNullable(clientData.tradeName ?? clientData.trade_name),
      rfc: this.toNullable(clientData.rfc),
      contact_name: this.toNullable(clientData.contactName ?? clientData.contact_name),
      contact_position: this.toNullable(clientData.contactPosition ?? clientData.contact_position),
      email: this.toNullable(clientData.email),
      billing_email: this.toNullable(clientData.billingEmail ?? clientData.billing_email),
      phone: this.toNullable(clientData.phone),
      notes: this.toNullable(clientData.notes),
      billing_address: this.toNullable(this.formatFullAddress(billingDetails)),
      shipping_address: this.toNullable(useBillingForShipping ? this.formatFullAddress(billingDetails) : this.formatFullAddress(shippingDetails)),
      city: this.toNullable(billingDetails.city),
      state: this.toNullable(billingDetails.state),
      country: this.toNullable(billingDetails.country),
      is_active: (clientData.status ?? ClientStatus.Active) === ClientStatus.Active,
    };

    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  }

  private async executeClientMutation(
    mode: 'insert' | 'update',
    payload: Record<string, any>,
    id?: string,
  ): Promise<any> {
    const query = mode === 'insert'
      ? this.supabase.client.from(this.tableName).insert(payload).select().single()
      : this.supabase.client.from(this.tableName).update(payload).eq('id', id).select().single();

    const { data, error } = await query;
    
    if (error) {
      console.error('[Clients] Error executing client mutation', {
        operation: mode,
        payload,
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      
      throw this.toAppError(
        error.message,
        mode === 'insert' ? 'No fue posible registrar el cliente.' : 'No fue posible actualizar el cliente.'
      );
    }

    return data;
  }


  private isCommercialClientRecord(item: any): boolean {
    if (!item) {
      return false;
    }

    const clientType = String(item.client_type ?? '').trim().toLowerCase();
    if (clientType && !this.allowedClientTypes.has(clientType)) {
      return false;
    }

    const status = String(item.status ?? '').trim().toLowerCase();
    if (status && !this.allowedStatuses.has(status)) {
      return false;
    }

    const classifier = [
      item.source,
      item.origin,
      item.client_origin,
      item.record_type,
      item.entity_type,
      item.kind,
      item.role,
      item.user_role,
      item.profile_role,
    ]
      .map(value => String(value ?? '').trim().toLowerCase())
      .filter(Boolean)
      .join(' ');

    const internalMarkers = ['admin', 'staff', 'technician', 'tech', 'manager', 'employee', 'empleado', 'internal', 'interno', 'system', 'perfil', 'profile', 'user', 'usuario'];
    if (internalMarkers.some(marker => classifier.includes(marker))) {
      return false;
    }

    const businessName = String(item.business_name ?? '').trim();
    const tradeName = String(item.trade_name ?? '').trim();
    const contactName = String(item.contact_name ?? '').trim();
    const rfc = String(item.rfc ?? '').trim();
    const email = String(item.email ?? '').trim().toLowerCase();

    const identityText = [businessName, tradeName, contactName, email].join(' ').toLowerCase();
    if (internalMarkers.some(marker => identityText.includes(marker)) && !rfc) {
      return false;
    }

    return !!(businessName || tradeName || contactName || rfc || email);
  }

  private mapToLegacyClient(item: any): Client {
    const fallbackBillingAddressText = String(item.billing_address ?? item.address ?? '').trim();
    const fallbackShippingAddressText = String(item.shipping_address ?? '').trim() || fallbackBillingAddressText;
    const fallbackCity = String(item.city ?? '').trim();
    const fallbackState = String(item.state ?? '').trim();
    const fallbackCountry = String(item.country ?? '').trim() || 'México';

    const billingDetails = this.normalizeAddressDetails({
      ...this.parseStructuredAddress(fallbackBillingAddressText, fallbackCity, fallbackState, undefined, fallbackCountry),
      postalCode: this.extractPostalCode(fallbackBillingAddressText),
    });

    const shippingDetails = this.normalizeAddressDetails({
      ...this.parseStructuredAddress(fallbackShippingAddressText, fallbackCity, fallbackState, undefined, fallbackCountry),
      postalCode: this.extractPostalCode(fallbackShippingAddressText),
    });

    const sameShippingAddress = !String(item.shipping_address ?? '').trim()
      || this.serializeAddressFingerprint(shippingDetails) === this.serializeAddressFingerprint(billingDetails);

    const displayAddressLine = this.formatAddressLine(billingDetails) || fallbackBillingAddressText;
    const displayShippingAddressLine = sameShippingAddress
      ? displayAddressLine
      : this.formatAddressLine(shippingDetails) || fallbackShippingAddressText;
    const displayBillingFullAddress = this.formatFullAddress(billingDetails) || fallbackBillingAddressText;
    const displayShippingFullAddress = sameShippingAddress
      ? displayBillingFullAddress
      : this.formatFullAddress(shippingDetails) || fallbackShippingAddressText;

    return {
      ...item,
      addresses: [],
      phone: item.phone ?? item.mobile_phone ?? item.whatsapp_phone ?? item.whatsapp ?? '',
      clientType: (item.client_type ?? ClientType.Otro) as ClientType,
      businessName: item.business_name ?? '',
      tradeName: item.trade_name ?? undefined,
      contactName: item.contact_name ?? '',
      contactPosition: item.contact_position ?? undefined,
      billingEmail: item.billing_email ?? undefined,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      address: displayAddressLine,
      city: billingDetails.city || fallbackCity,
      state: billingDetails.state || fallbackState,
      country: billingDetails.country || fallbackCountry,
      shippingAddress: displayShippingAddressLine,
      formattedBillingAddress: displayBillingFullAddress,
      formattedShippingAddress: displayShippingFullAddress,
      billingAddressDetails: billingDetails,
      shippingAddressDetails: sameShippingAddress ? billingDetails : shippingDetails,
      useBillingAddressForShipping: sameShippingAddress,
      status: (item.status ?? ClientStatus.Active) as ClientStatus,
      client_type: (item.client_type ?? ClientType.Otro) as ClientType,
      business_name: item.business_name ?? '',
      contact_name: item.contact_name ?? '',
      created_at: item.created_at,
      updated_at: item.updated_at,
    } as Client;
  }

  private buildFallbackClient(savedClient: any, clientData: Partial<Client>, clientId: string): Client {
    const billingDetails = this.resolveBillingAddressDetails(clientData);
    const useBillingForShipping = this.resolveUseBillingForShipping(clientData, billingDetails);
    const shippingDetails = useBillingForShipping
      ? billingDetails
      : this.resolveShippingAddressDetails(clientData, billingDetails);

    const syntheticRecord = {
      id: clientId,
      client_type: savedClient?.client_type ?? clientData.clientType ?? clientData.client_type ?? ClientType.Otro,
      status: savedClient?.status ?? clientData.status ?? ClientStatus.Active,
      business_name: savedClient?.business_name ?? clientData.businessName ?? clientData.business_name ?? '',
      trade_name: savedClient?.trade_name ?? clientData.tradeName ?? clientData.trade_name ?? null,
      rfc: savedClient?.rfc ?? clientData.rfc ?? '',
      contact_name: savedClient?.contact_name ?? clientData.contactName ?? clientData.contact_name ?? '',
      contact_position: savedClient?.contact_position ?? clientData.contactPosition ?? clientData.contact_position ?? null,
      email: savedClient?.email ?? clientData.email ?? '',
      billing_email: savedClient?.billing_email ?? clientData.billingEmail ?? clientData.billing_email ?? null,
      phone: savedClient?.phone ?? clientData.phone ?? '',
      notes: savedClient?.notes ?? clientData.notes ?? null,
      billing_address: savedClient?.billing_address ?? this.formatFullAddress(billingDetails),
      shipping_address: savedClient?.shipping_address ?? (useBillingForShipping ? this.formatFullAddress(billingDetails) : this.formatFullAddress(shippingDetails)),
      city: savedClient?.city ?? billingDetails.city,
      state: savedClient?.state ?? billingDetails.state,
      country: savedClient?.country ?? billingDetails.country,
      created_at: savedClient?.created_at ?? new Date().toISOString(),
      updated_at: savedClient?.updated_at ?? savedClient?.created_at ?? new Date().toISOString(),
    };

    return this.mapToLegacyClient(syntheticRecord);
  }

  private toNullable(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : null;
  }

  private toAppError(message: string, fallback: string): Error {
    const lowered = String(message ?? '').toLowerCase();

    if (lowered.includes('permission') || lowered.includes('rls') || lowered.includes('policy')) {
      return new Error('No tienes permisos para consultar o modificar clientes.');
    }


    if (lowered.includes('invalid input syntax') || lowered.includes('input syntax')) {
      return new Error('No fue posible guardar el cliente. Revisa el formato de los datos capturados.');
    }

    return new Error(fallback);
  }
}


