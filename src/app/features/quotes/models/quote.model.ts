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
  productCategory?: string;
  quantity: number;
  unitPrice: number;
  grossLinePrice: number;
  discount: number;
  totalLinePrice: number;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  pdfPath?: string;
  clientId: string;
  clientNameSnapshot: string;
  clientRfcSnapshot: string;
  clientAddressSnapshot: string;
  status: QuoteStatus;
  items: QuoteItem[];
  grossSubtotal: number;
  itemsDiscount: number;
  discount: number;
  subtotal: number;
  taxExempt: boolean;
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
  productCategory?: string;
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
  taxExempt?: boolean;
  discount?: number;
  validUntil: string;
  notes?: string;
  conditions?: string;
}

export interface QuoteFilters {
  search?: string;
  status?: QuoteStatus | '';
}

export interface QuoteTotals {
  grossSubtotal: number;
  itemsDiscount: number;
  subtotal: number;
  tax: number;
  total: number;
}

export type ProductDocumentType =
  | 'manual'
  | 'ficha_tecnica'
  | 'certificado'
  | 'cotizacion_pdf'
  | 'reporte_servicio'
  | 'imagen'
  | 'otro';

export interface ProductDocument {
  id: string;
  productId: string;
  productName: string;
  title: string;
  filePath: string;
  documentType: ProductDocumentType;
  fileName?: string;
  fileExtension?: string;
}
