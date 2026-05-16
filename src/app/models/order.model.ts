// models/order.model.ts
// Modelos del modulo de pedidos

import { ProductCategory } from './product.model';

export const DEFAULT_ORDER_TAX_PCT = 0.16;

export enum OrderStatus {
  Draft = 'draft',
  PendingReview = 'pending_review',
  PendingPayment = 'pending_payment',
  Paid = 'paid',
  Processing = 'processing',
  Shipped = 'shipped',
  Delivered = 'delivered',
  Canceled = 'canceled',
}

export interface OrderItem {
  productId: string;
  sku: string;
  productName: string;
  productCategory: ProductCategory;
  quantity: number;
  unitPrice: number;
  totalLinePrice: number;
}

export interface Order {
  id: string;
  folio: string;
  clientId: string;
  clientNameSnapshot: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  taxPct: number;
  taxExempt: boolean;
  tax: number;
  total: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemDraft {
  productId: string;
  sku?: string;
  productName?: string;
  productCategory?: ProductCategory;
  quantity: number;
  unitPrice?: number;
}

export interface OrderUpsertPayload {
  clientId: string;
  clientNameSnapshot?: string;
  status?: OrderStatus;
  items: OrderItemDraft[];
  taxPct?: number;
  taxExempt?: boolean;
  notes?: string;
}

export interface OrderFilters {
  search?: string;
  status?: OrderStatus | '';
}

export interface OrderTotals {
  subtotal: number;
  tax: number;
  total: number;
}

export type OrderStatsPeriodPreset = 'today' | 'this_week' | 'this_month' | 'last_7_days' | 'last_30_days' | 'custom';
export type OrderStatsGrouping = 'day' | 'week' | 'month';

export interface OrderStatsFilters {
  periodPreset: OrderStatsPeriodPreset;
  grouping: OrderStatsGrouping;
  dateFrom?: string;
  dateTo?: string;
}

export interface OrderStatsKpis {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  pendingOrders: number;
  paidOrders: number;
  deliveredOrders: number;
  canceledOrders: number;
}

export interface OrderStatsPeriodPoint {
  key: string;
  label: string;
  ordersCount: number;
  revenue: number;
}

export interface OrderStatusSummaryRow {
  status: OrderStatus;
  label: string;
  count: number;
  total: number;
}

export interface TopOrderedProductRow {
  productId: string;
  productName: string;
  productCategory: ProductCategory;
  unitsOrdered: number;
  totalAmount: number;
}

export interface OrderStatsSnapshot {
  filters: OrderStatsFilters;
  periodLabel: string;
  generatedAt: string;
  kpis: OrderStatsKpis;
  periodPoints: OrderStatsPeriodPoint[];
  statusSummary: OrderStatusSummaryRow[];
  topOrderedProducts: TopOrderedProductRow[];
}
