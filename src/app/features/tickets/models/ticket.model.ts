export enum TicketStatus {
  Open = 'open',
  Assigned = 'assigned',
  InProgress = 'in_progress',
  WaitingParts = 'waiting_parts',
  Resolved = 'resolved',
  Closed = 'closed',
  Canceled = 'canceled',
}

export enum TicketPriority {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Urgent = 'urgent',
}

export enum TicketType {
  Preventive = 'preventive',
  Corrective = 'corrective',
  Warranty = 'warranty',
  Installation = 'installation',
  Review = 'review',
  Other = 'other',
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
  assignedTechnicianName?: string;
  requestedAt: string;
  scheduledAt?: string;
  updatedAt: string;
  notes: string;
  attachments?: string[];
  history: TicketHistoryItem[];
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
  assignedTechnicianName?: string;
  scheduledAt?: string;
  notes?: string;
  attachments?: string[];
}
