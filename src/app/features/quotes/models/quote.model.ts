export const DEFAULT_QUOTE_TAX_PCT = 0.16;

export enum QuoteStatus {
  Draft = 'draft',
  Sent = 'sent',
  Approved = 'approved',
  Rejected = 'rejected',
  Expired = 'expired',
  Converted = 'converted',
}

export interface QuoteItem {
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalLinePrice: number;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  clientId: string;
  clientNameSnapshot: string;
  clientRfcSnapshot: string;
  clientAddressSnapshot: string;
  status: QuoteStatus;
  items: QuoteItem[];
  subtotal: number;
  tax_pct: number;
  tax: number;
  total: number;
  validUntil: string;
  notes: string;
  conditions: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteItemDraft {
  productId: string;
  sku?: string;
  productName?: string;
  quantity: number;
  unitPrice?: number;
  discount?: number;
}

export interface QuoteUpsertPayload {
  clientId: string;
  clientNameSnapshot?: string;
  clientRfcSnapshot?: string;
  clientAddressSnapshot?: string;
  status?: QuoteStatus;
  items: QuoteItemDraft[];
  tax_pct?: number;
  validUntil: string;
  notes?: string;
  conditions?: string;
}

export interface QuoteFilters {
  search?: string;
  status?: QuoteStatus | '';
}

export interface QuoteTotals {
  subtotal: number;
  tax: number;
  total: number;
}


