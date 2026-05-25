export enum TicketStatus {
  Open = 'open',
  Assigned = 'assigned',
  InProgress = 'in_progress',
  WaitingParts = 'waiting_parts',
  Resolved = 'resolved',
  Closed = 'closed',
  Canceled = 'cancelled',
}

export enum TicketPriority {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Urgent = 'urgent',
}

export enum TicketType {
  Preventive = 'preventivo',
  Corrective = 'correctivo',
  Warranty = 'garantia',
  Installation = 'instalacion',
  Review = 'revision',
  Other = 'otro',
}

export interface TicketHistoryItem {
  id: string;
  date: string;
  status: TicketStatus;
  comment: string;
  authorName: string;
}

export interface ServiceTicket {
  id: string;
  ticketNumber: string;
  clientId: string;
  clientNameSnapshot: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  type: TicketType;
  productId?: string;
  productNameSnapshot?: string;
  equipmentSerialNumber?: string;
  assignedTechnicianId?: string;
  assignedTechnicianCustomName?: string;
  assignedTechnicianName?: string;
  requestedAt: string;
  scheduledAt?: string;
  updatedAt: string;
  notes: string;
  attachments?: string[];
  history: TicketHistoryItem[];
}

export interface TicketTechnician {
  id: string;
  fullName: string;
  role?: string;
}

export interface TicketFilters {
  search?: string;
  status?: TicketStatus | '';
  priority?: TicketPriority | '';
  type?: TicketType | '';
}

export interface TicketUpsertPayload {
  clientId: string;
  clientNameSnapshot?: string;
  title: string;
  description: string;
  priority: TicketPriority;
  type: TicketType;
  status?: TicketStatus;
  productId?: string;
  productNameSnapshot?: string;
  equipmentSerialNumber?: string;
  assignedTechnicianId?: string | null;
  assignedTechnicianCustomName?: string | null;
  assignedTechnicianName?: string;
  equipmentUnitId?: string | null;
  scheduledAt?: string;
  notes?: string;
  attachments?: string[];
}


