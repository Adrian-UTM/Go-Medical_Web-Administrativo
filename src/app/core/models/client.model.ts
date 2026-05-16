export enum ClientType {
  Clinica = 'clínica',
  Medico = 'médico',
  Veterinario = 'veterinario',
  Institucion = 'institución'
}

export enum ClientStatus {
  Active = 'active',
  Inactive = 'inactive'
}

export interface Client {
  id: string; // UUID mock
  clientType: ClientType;
  status: ClientStatus;
  
  // Datos fiscales / comerciales
  businessName: string; // razón social
  tradeName?: string; // nombre comercial (opcional)
  rfc: string;
  
  // Contacto Principal
  contactName: string;
  contactPosition?: string; // opcional
  email: string;
  billingEmail?: string; // opcional
  phone: string;
  
  // Ubicación
  address: string;
  shippingAddress?: string; // opcional
  city: string;
  state: string;
  
  // Metadatos
  notes?: string;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}
