import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Client, ClientFilters, ClientAddress, ClientStatus, ClientType } from '../../../core/models/client.model';

@Injectable({
  providedIn: 'root'
})
export class ClientSupabaseService {
  private readonly tableName = 'clients';
  private readonly addressTableName = 'client_addresses';
  private readonly allowedClientTypes = new Set<string>(Object.values(ClientType));
  private readonly allowedStatuses = new Set<string>(Object.values(ClientStatus));

  constructor(private supabase: SupabaseService) {}

  getClients(filters?: ClientFilters): Observable<Client[]> {
    let query = this.supabase.client
      .from(this.tableName)
      .select('*, addresses:client_addresses(*)')
      .order('created_at', { ascending: false });

    if (filters?.search) {
      query = query.or(`business_name.ilike.%${filters.search}%,trade_name.ilike.%${filters.search}%,rfc.ilike.%${filters.search}%`);
    }
    if (filters?.clientType) {
      query = query.eq('client_type', filters.clientType);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          throw new Error(this.toAppError(error.message, 'No fue posible cargar los clientes.').message);
        }

        const records = (data ?? []).filter(item => this.isCommercialClientRecord(item));
        return records.map((item: any) => this.mapToLegacyClient(item));
      })
    );
  }

  getClientById(id: string): Observable<Client> {
    return from(
      this.supabase.client
        .from(this.tableName)
        .select('*, addresses:client_addresses(*)')
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          throw new Error(this.toAppError(error.message, 'No fue posible cargar el cliente solicitado.').message);
        }

        if (!this.isCommercialClientRecord(data)) {
          throw new Error('El cliente solicitado no está disponible.');
        }

        return this.mapToLegacyClient(data);
      })
    );
  }

  createClient(clientData: Partial<Client>): Observable<Client> {
    const dbPayload = this.mapToSupabasePayload(clientData);

    return from(
      this.supabase.client
        .from(this.tableName)
        .insert(dbPayload)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          throw new Error(this.toAppError(error.message, 'No fue posible registrar el cliente.').message);
        }
        return this.mapToLegacyClient(data);
      })
    );
  }

  updateClient(id: string, clientData: Partial<Client>): Observable<Client> {
    const dbPayload = this.mapToSupabasePayload(clientData);

    return from(
      this.supabase.client
        .from(this.tableName)
        .update(dbPayload)
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          throw new Error(this.toAppError(error.message, 'No fue posible actualizar el cliente.').message);
        }
        return this.mapToLegacyClient(data);
      })
    );
  }

  deleteClient(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from(this.tableName)
        .delete()
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) {
          throw new Error(this.toAppError(error.message, 'No fue posible eliminar el cliente.').message);
        }
      })
    );
  }

  createAddress(addressData: Partial<ClientAddress>): Observable<ClientAddress> {
    return from(
      this.supabase.client
        .from(this.addressTableName)
        .insert(addressData)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          throw new Error(this.toAppError(error.message, 'No fue posible registrar la dirección.').message);
        }
        return data as ClientAddress;
      })
    );
  }

  updateAddress(id: string, addressData: Partial<ClientAddress>): Observable<ClientAddress> {
    return from(
      this.supabase.client
        .from(this.addressTableName)
        .update(addressData)
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          throw new Error(this.toAppError(error.message, 'No fue posible actualizar la dirección.').message);
        }
        return data as ClientAddress;
      })
    );
  }

  deleteAddress(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from(this.addressTableName)
        .delete()
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) {
          throw new Error(this.toAppError(error.message, 'No fue posible eliminar la dirección.').message);
        }
      })
    );
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
    const defaultAddress = item.addresses?.find((a: any) => a.is_default) || item.addresses?.[0];

    return {
      ...item,
      clientType: (item.client_type ?? ClientType.Otro) as ClientType,
      businessName: item.business_name ?? '',
      tradeName: item.trade_name ?? undefined,
      contactName: item.contact_name ?? '',
      contactPosition: item.contact_position ?? undefined,
      billingEmail: item.billing_email ?? undefined,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      address: defaultAddress?.address || '',
      city: defaultAddress?.city || '',
      state: defaultAddress?.state || '',
      shippingAddress: defaultAddress?.address || '',
      status: (item.status ?? ClientStatus.Active) as ClientStatus,
      client_type: (item.client_type ?? ClientType.Otro) as ClientType,
      business_name: item.business_name ?? '',
      contact_name: item.contact_name ?? '',
      created_at: item.created_at,
      updated_at: item.updated_at,
    } as Client;
  }

  private mapToSupabasePayload(clientData: Partial<Client>): any {
    const payload: any = { ...clientData };

    if (clientData.clientType) payload.client_type = clientData.clientType;
    if (clientData.businessName) payload.business_name = clientData.businessName;
    if (clientData.tradeName) payload.trade_name = clientData.tradeName;
    if (clientData.contactName) payload.contact_name = clientData.contactName;
    if (clientData.contactPosition) payload.contact_position = clientData.contactPosition;
    if (clientData.billingEmail) payload.billing_email = clientData.billingEmail;

    delete payload.clientType;
    delete payload.businessName;
    delete payload.tradeName;
    delete payload.contactName;
    delete payload.contactPosition;
    delete payload.billingEmail;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.address;
    delete payload.city;
    delete payload.state;
    delete payload.shippingAddress;
    delete payload.addresses;

    return payload;
  }

  private toAppError(message: string, fallback: string): Error {
    const lowered = String(message ?? '').toLowerCase();
    if (lowered.includes('permission') || lowered.includes('rls') || lowered.includes('policy')) {
      return new Error('No tienes permisos para consultar o modificar clientes.');
    }

    return new Error(fallback);
  }
}
