// models/quote.model.ts
// Modelos de cotizaciones

import { AuditFields } from './common.model';

export enum QuoteStatus {
  Draft     = 'draft',
  Sent      = 'sent',
  Reviewed  = 'reviewed',
  Accepted  = 'accepted',
  Rejected  = 'rejected',
  Expired   = 'expired',
}

export interface Quote extends AuditFields {
  id: string;                      // uuid
  quote_number: string;            // Folio: BCQ-2025-0001
  client_id: string;               // FK → clients.id
  client_name?: string;            // Desnormalizado
  status: QuoteStatus;
  items: QuoteItem[];
  subtotal_mxn: number;
  discount_pct?: number;
  discount_amount_mxn?: number;
  tax_pct: number;                 // Default: 16
  tax_amount_mxn: number;
  total_mxn: number;
  valid_until?: string;            // Fecha de vigencia (ISO date)
  notes?: string;
  internal_notes?: string;
  assigned_to?: string;            // FK → users.id
  converted_to_order_id?: string;  // FK → orders.id (si fue convertida)
}

export interface QuoteItem {
  id: string;
  quote_id: string;                // FK → quotes.id
  product_id: string;              // FK → products.id
  product_name: string;            // Desnormalizado
  product_sku: string;
  quantity: number;
  unit_price_mxn: number;
  discount_pct?: number;
  line_total_mxn: number;
  notes?: string;
}

export interface QuoteFilters {
  search?: string;
  status?: QuoteStatus;
  client_id?: string;
  date_from?: string;
  date_to?: string;
}
