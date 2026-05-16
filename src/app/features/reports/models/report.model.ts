// features/reports/models/report.model.ts
// Modelos para el módulo de Reportes Comerciales / Analítica

export interface ReportKpis {
  totalRevenue: number;
  estimatedProfit: number;
  totalOrders: number;
  avgTicket: number;
  pendingOpportunities: number;
  pendingOpportunitiesValue: number;
}

export interface ProductSalesRow {
  productId: string;
  sku: string;
  productName: string;
  category: string;
  unitsSold: number;
  totalRevenue: number;
  estimatedProfit: number;
  /** Margen estimado 0–1 */
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

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  orderStatus?: string;
}

// Porcentaje de costo estimado sobre precio de venta (mock — sin costo real en este stage)
// Documentado aquí para fácil reemplazo cuando exista costPrice en el modelo de producto.
// Equivale a margen bruto ~40% sobre precio de venta.
export const MOCK_COST_RATIO = 0.60;
