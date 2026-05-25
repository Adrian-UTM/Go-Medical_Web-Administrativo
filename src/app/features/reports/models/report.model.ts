export interface ReportKpis {
  totalRevenue: number;
  estimatedProfit: number;
  totalOrders: number;
  avgTicket: number;
  pendingOpportunities: number;
  pendingOpportunitiesValue: number;
  activeClients: number;
  openTickets: number;
  lowStockProducts: number;
}

export interface ProductSalesRow {
  productId: string;
  sku: string;
  productName: string;
  category: string;
  unitsSold: number;
  totalRevenue: number;
  estimatedProfit: number;
  marginPct: number;
}

export interface ProductLowSalesRow {
  productId: string;
  sku: string;
  productName: string;
  category: string;
  unitsSold: number;
  currentStock: number;
  lastSaleDate: string | null;
}

export interface CustomerSalesRow {
  clientId: string;
  clientName: string;
  totalPurchased: number;
  totalOrders: number;
  lastPurchaseDate: string;
}

export interface TicketStatusRow {
  status: string;
  label: string;
  count: number;
}

export interface ReportDistributionRow {
  key: string;
  label: string;
  value: number;
}

export type ReportPeriodMode = 'day' | 'week' | 'month';

export interface ReportFilters {
  periodMode?: ReportPeriodMode;
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  orderStatus?: string;
}

export interface ReportsSnapshot {
  kpis: ReportKpis;
  topProducts: ProductSalesRow[];
  lowProducts: ProductLowSalesRow[];
  topCustomers: CustomerSalesRow[];
  orderAnalyticsOrders: import('../../../models/order.model').Order[];
  ticketStatusRows: TicketStatusRow[];
  revenueByCategoryRows: ReportDistributionRow[];
  catalogDistributionRows: ReportDistributionRow[];
}

export const ESTIMATED_COST_RATIO = 0.60;
