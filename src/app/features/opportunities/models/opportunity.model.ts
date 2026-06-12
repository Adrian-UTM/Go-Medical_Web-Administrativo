import { ProductCategory } from '../../../models/product.model';

export enum OpportunityCartStatus {
  Active = 'active',
  Abandoned = 'abandoned',
  Recovered = 'recovered',
  Converted = 'converted',
  Closed = 'closed',
}

export enum OpportunityStatus {
  New = 'new',
  Contacted = 'contacted',
  Interested = 'interested',
  NoResponse = 'no_response',
  ConvertedToOrder = 'converted_to_order',
  ConvertedToQuote = 'converted_to_quote',
  Closed = 'closed',
}

export enum OpportunityActionType {
  Note = 'note',
  Contacted = 'contacted',
  Interested = 'interested',
  NoResponse = 'no_response',
  ConvertedToOrder = 'converted_to_order',
  ConvertedToQuote = 'converted_to_quote',
  Closed = 'closed',
}

export interface OpportunityItem {
  productId: string;
  sku: string;
  productName: string;
  productCategory: ProductCategory;
  quantity: number;
  unitPrice: number;
  estimatedLineTotal: number;
  imageUrl?: string;
}

export interface OpportunityFollowUp {
  id: string;
  actionType: OpportunityActionType;
  title: string;
  note: string;
  createdAt: string;
  createdBy: string;
  contactChannel?: string;
}

export interface OpportunityContact {
  clientId?: string;
  isProspect: boolean;
  displayName: string;
  companyName: string;
  email: string;
  phone: string;
  city?: string;
  state?: string;
}

export interface Opportunity {
  id: string;
  folio: string;
  cartStatus: OpportunityCartStatus;
  opportunityStatus: OpportunityStatus;
  contact: OpportunityContact;
  items: OpportunityItem[];
  estimatedSubtotal: number;
  estimatedTotal: number;
  lastActivityAt: string;
  abandonedAt: string;
  assignedTo: string;
  commercialNotes: string;
  followUps: OpportunityFollowUp[];
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityFilters {
  search?: string;
  cartStatus?: OpportunityCartStatus | '';
  opportunityStatus?: OpportunityStatus | '';
  assignedTo?: string;
}
