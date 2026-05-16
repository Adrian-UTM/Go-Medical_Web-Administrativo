// models/ticket.model.ts
// Modelos de tickets de servicio técnico

import { AuditFields } from './common.model';

export enum TicketStatus {
  Open       = 'open',
  Assigned   = 'assigned',
  InProgress = 'in_progress',
  Paused     = 'paused',
  Resolved   = 'resolved',
  Closed     = 'closed',
  Cancelled  = 'cancelled',
}

export enum TicketPriority {
  Low      = 'low',
  Medium   = 'medium',
  High     = 'high',
  Critical = 'critical',
}

export enum TicketType {
  Preventive   = 'preventive',   // Mantenimiento preventivo
  Corrective   = 'corrective',   // Mantenimiento correctivo
  Installation = 'installation', // Instalación de equipo
  Training     = 'training',     // Capacitación
  Warranty     = 'warranty',     // Garantía
}

export interface ServiceTicket extends AuditFields {
  id: string;                      // uuid
  ticket_number: string;           // Folio: BCT-2025-0001
  client_id: string;               // FK → clients.id
  client_name?: string;            // Desnormalizado
  product_id?: string;             // FK → products.id (equipo afectado)
  product_name?: string;
  serial_number?: string;          // Número de serie del equipo
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  subject: string;
  description: string;
  resolution_notes?: string;
  assigned_to?: string;            // FK → users.id (técnico asignado)
  assigned_name?: string;          // Desnormalizado
  scheduled_date?: string;         // Fecha programada de visita
  resolved_at?: string;
  closed_at?: string;
}

export interface TicketFilters {
  search?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  type?: TicketType;
  assigned_to?: string;
  client_id?: string;
}
