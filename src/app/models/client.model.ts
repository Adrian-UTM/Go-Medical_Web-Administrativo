// models/client.model.ts
// Modelos de clientes (personas físicas y morales)

import { AuditFields } from './common.model';

export enum ClientType {
  Individual = 'individual',   // Persona física
  Business   = 'business',     // Persona moral
}

export enum ClientStatus {
  Active   = 'active',
  Inactive = 'inactive',
  Prospect = 'prospect',
}

export interface Client extends AuditFields {
  id: string;                   // uuid
  client_type: ClientType;
  business_name?: string;       // Razón social (persona moral)
  full_name: string;            // Nombre del contacto principal
  rfc?: string;
  email: string;
  phone: string;
  mobile?: string;
  status: ClientStatus;
  address?: ClientAddress;
  notes?: string;
}

export interface ClientAddress {
  street: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;              // Default: 'México'
}

export interface ClientContact {
  id: string;
  client_id: string;            // FK → clients.id
  full_name: string;
  role?: string;                // Ej: "Director técnico", "Compras"
  email?: string;
  phone?: string;
  is_primary: boolean;
}

/** DTO para creación — sin campos de auditoría */
export interface CreateClientDto {
  client_type: ClientType;
  business_name?: string;
  full_name: string;
  rfc?: string;
  email: string;
  phone: string;
  mobile?: string;
  status: ClientStatus;
  address?: ClientAddress;
  notes?: string;
}

export type UpdateClientDto = Partial<CreateClientDto>;

/** Filtros para listado */
export interface ClientFilters {
  search?: string;
  client_type?: ClientType;
  status?: ClientStatus;
}
