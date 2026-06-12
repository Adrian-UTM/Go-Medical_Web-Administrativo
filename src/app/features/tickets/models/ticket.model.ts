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
  clientAddress?: string;
  clientCity?: string;
  clientState?: string;
  clientCountry?: string;
  serviceAddress?: string;
  serviceCity?: string;
  serviceState?: string;
  serviceRegion?: string;
  requestedServiceDate?: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  isLocalService?: boolean;
  routeRequired?: boolean;
  routeAuthorized?: boolean;
  routeNotes?: string;
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
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  requestedServiceDate?: string;
  serviceAddress?: string;
  serviceCity?: string;
  serviceState?: string;
  serviceRegion?: string;
  routeAuthorized?: boolean;
  routeNotes?: string;
  notes?: string;
  attachments?: string[];
}

export interface TechnicalRouteCandidate {
  serviceCity: string;
  serviceState: string;
  serviceRegion?: string;
  count: number;
  servicesCount: number;
}

export interface ServiceTicketMessage {
  id: string;
  ticketId: string;
  senderType: 'admin' | 'client' | 'system' | string;
  senderProfileId: string;
  message: string;
  attachmentUrl?: string;
  isInternal: boolean;
  createdAt: string;
  readAt?: string;
  senderName?: string;
  senderRole?: string;
}

export interface ParsedTicketDescription {
  rawDescription: string;
  equipment: string;
  responsible: string;
  phone: string;
  area: string;
  dateStr: string;
  issueDescription: string;
}
