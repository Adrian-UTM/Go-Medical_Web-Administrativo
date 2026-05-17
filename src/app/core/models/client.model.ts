export enum ClientType {
  Clinica = 'clinica',
  Medico = 'medico',
  Veterinario = 'veterinario',
  Institucion = 'institucion',
  Otro = 'otro'
}

export enum ClientStatus {
  Active = 'active',
  Inactive = 'inactive'
}

export interface Client {
  id: string; 
  client_type: ClientType;
  status: ClientStatus;
  
  // Datos fiscales / comerciales
  business_name: string; 
  trade_name?: string; 
  rfc: string;
  
  // Contacto Principal
  contact_name: string;
  contact_position?: string; 
  email: string;
  billing_email?: string; 
  phone: string;
  
  // Metadatos
  notes?: string;
  created_at?: string; 
  updated_at?: string; 

  // Direcciones (Asociadas desde client_addresses)
  addresses?: ClientAddress[];

  // Campos Legacy para mocks (eliminar al final)
  clientType: ClientType;
  businessName: string;
  tradeName?: string;
  contactName: string;
  contactPosition?: string;
  billingEmail?: string;
  address: string;
  shippingAddress?: string;
  city: string;
  state: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientAddress {
  id: string;
  client_id: string;
  label?: string;
  address: string;
  city?: string;
  state?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  is_default?: boolean;
  created_at?: string;
}

export interface ClientFilters {
  search?: string;
  clientType?: ClientType;
  status?: ClientStatus;
}
