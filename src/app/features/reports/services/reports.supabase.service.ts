import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OrderSupabaseService } from '../../orders/services/order.supabase.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ProductSupabaseService } from '../../products/services/product.supabase.service';
import { Product, ProductCategory, ProductCondition, ProductItemType } from '../../../models/product.model';
import { Order, OrderStatus } from '../../../models/order.model';
import {
  CustomerSalesRow,
  ESTIMATED_COST_RATIO,
  ProductLowSalesRow,
  ProductSalesRow,
  ReportDistributionRow,
  ReportFilters,
  ReportKpis,
  ReportsSnapshot,
  TicketStatusRow,
} from '../models/report.model';

@Injectable({
  providedIn: 'root'
})
export class ReportsSupabaseService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly orderService: OrderSupabaseService,
    private readonly productService: ProductSupabaseService,
  ) {}

  async getSnapshot(filters: ReportFilters = {}): Promise<ReportsSnapshot> {
    const [orders, products, ticketResponse, stockResponse, clientsResponse] = await Promise.all([
      this.orderService.getOrders().catch(err => {
        console.error('[Reports] Error loading report data (orders)', err);
        throw err;
      }),
      firstValueFrom(this.productService.getProducts()).catch(err => {
        console.error('[Reports] Error loading report data (products)', err);
        throw err;
      }),
      this.supabase.client.from('service_tickets').select('status, created_at, updated_at'),
      this.supabase.client.from('inventory_stock').select('*'),
      this.supabase.client.from('clients').select('*'),
    ]);

    if (ticketResponse.error) {
      console.error('[Reports] Error loading report data', {
        query: 'service_tickets',
        error: ticketResponse.error,
        message: ticketResponse.error.message,
        details: ticketResponse.error.details,
        hint: ticketResponse.error.hint,
        code: ticketResponse.error.code
      });
      throw this.toAppError(ticketResponse.error.message, 'No se pudo cargar la información del reporte.');
    }

    if (stockResponse.error) {
      console.error('[Reports] Error loading report data', {
        query: 'inventory_stock',
        error: stockResponse.error,
        message: stockResponse.error.message,
        details: stockResponse.error.details,
        hint: stockResponse.error.hint,
        code: stockResponse.error.code
      });
      throw this.toAppError(stockResponse.error.message, 'No se pudo cargar la información del reporte.');
    }

    if (clientsResponse.error) {
      console.error('[Reports] Error loading report data', {
        query: 'clients',
        error: clientsResponse.error,
        message: clientsResponse.error.message,
        details: clientsResponse.error.details,
        hint: clientsResponse.error.hint,
        code: clientsResponse.error.code
      });
      throw this.toAppError(clientsResponse.error.message, 'No se pudo cargar la información del reporte.');
    }

    const range = this.resolveDateRange(filters);
    const filteredOrders = this.filterOrdersByDate(orders, range);
    const completedOrders = filteredOrders.filter(order => this.isRevenueOrder(order.status));
    const stockRows = stockResponse.data ?? [];
    const ticketRows = this.filterRowsByDate(ticketResponse.data ?? [], range, ['created_at', 'updated_at']);
    const clientRows = this.filterRowsByDate(clientsResponse.data ?? [], range, ['created_at', 'updated_at']);
    const stockByProductId = this.buildStockMap(stockRows);

    return {
      kpis: this.buildKpis(filteredOrders, completedOrders, clientRows, ticketRows, products, stockRows),
      topProducts: this.buildTopProducts(completedOrders, products),
      lowProducts: this.buildLowProducts(completedOrders, products, stockByProductId),
      topCustomers: this.buildTopCustomers(completedOrders),
      orderAnalyticsOrders: filteredOrders,
      ticketStatusRows: this.buildTicketStatusRows(ticketRows),
      revenueByCategoryRows: this.buildRevenueByCategory(completedOrders, products),
      catalogDistributionRows: this.buildCatalogDistribution(products),
    };
  }

  private buildKpis(periodOrders: Order[], revenueOrders: Order[], clients: any[], tickets: any[], products: Product[], stockRows: any[]): ReportKpis {
    const totalRevenue = this.roundCurrency(revenueOrders.reduce((sum, order) => sum + order.total, 0));
    const totalOrders = periodOrders.length;
    const revenueOrderCount = revenueOrders.length;

    return {
      totalRevenue,
      estimatedProfit: this.roundCurrency(totalRevenue * (1 - ESTIMATED_COST_RATIO)),
      totalOrders,
      avgTicket: revenueOrderCount ? this.roundCurrency(totalRevenue / revenueOrderCount) : 0,
      pendingOpportunities: 0,
      pendingOpportunitiesValue: 0,
      activeClients: this.countActiveClients(clients),
      openTickets: tickets.filter(row => ['open', 'assigned', 'in_progress', 'waiting_parts'].includes(String(row.status ?? ''))).length,
      lowStockProducts: this.countLowStockProducts(products, stockRows),
    };
  }

  private buildTopProducts(orders: Order[], products: Product[]): ProductSalesRow[] {
    const productMeta = new Map(products.map(product => [product.id, product]));
    const registry = new Map<string, ProductSalesRow>();

    orders.forEach(order => {
      order.items.forEach(item => {
        const current = registry.get(item.productId);
        const meta = productMeta.get(item.productId);
        const category = this.getCategoryLabel(item.productCategory || meta?.category);
        const estimatedProfit = this.roundCurrency(item.totalLinePrice * (1 - ESTIMATED_COST_RATIO));

        if (current) {
          current.unitsSold += item.quantity;
          current.totalRevenue = this.roundCurrency(current.totalRevenue + item.totalLinePrice);
          current.estimatedProfit = this.roundCurrency(current.estimatedProfit + estimatedProfit);
          return;
        }

        registry.set(item.productId, {
          productId: item.productId,
          sku: item.sku || meta?.sku || 'Sin SKU',
          productName: item.productName || meta?.name || 'Producto sin nombre',
          category,
          unitsSold: item.quantity,
          totalRevenue: this.roundCurrency(item.totalLinePrice),
          estimatedProfit,
          marginPct: 1 - ESTIMATED_COST_RATIO,
        });
      });
    });

    return Array.from(registry.values())
      .sort((a, b) => {
        if (b.unitsSold !== a.unitsSold) {
          return b.unitsSold - a.unitsSold;
        }
        return b.totalRevenue - a.totalRevenue;
      })
      .slice(0, 10);
  }

  private buildLowProducts(orders: Order[], products: Product[], stockByProductId: Map<string, number>): ProductLowSalesRow[] {
    const salesRegistry = new Map<string, { unitsSold: number; lastSaleDate: string | null }>();

    orders.forEach(order => {
      order.items.forEach(item => {
        const current = salesRegistry.get(item.productId) ?? { unitsSold: 0, lastSaleDate: null };
        current.unitsSold += item.quantity;
        current.lastSaleDate = !current.lastSaleDate || new Date(order.createdAt) > new Date(current.lastSaleDate)
          ? order.createdAt
          : current.lastSaleDate;
        salesRegistry.set(item.productId, current);
      });
    });

    return products
      .filter(product => (product.item_type ?? ProductItemType.Product) !== ProductItemType.Service)
      .map(product => {
        const sales = salesRegistry.get(product.id) ?? { unitsSold: 0, lastSaleDate: null };
        return {
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          category: this.getCategoryLabel(product.category),
          unitsSold: sales.unitsSold,
          currentStock: stockByProductId.get(product.id) ?? 0,
          lastSaleDate: sales.lastSaleDate,
        };
      })
      .sort((a, b) => {
        if (a.unitsSold !== b.unitsSold) {
          return a.unitsSold - b.unitsSold;
        }
        return b.currentStock - a.currentStock;
      })
      .slice(0, 10);
  }

  private buildTopCustomers(orders: Order[]): CustomerSalesRow[] {
    const registry = new Map<string, CustomerSalesRow>();

    orders.forEach(order => {
      const current = registry.get(order.clientId);
      if (current) {
        current.totalPurchased = this.roundCurrency(current.totalPurchased + order.total);
        current.totalOrders += 1;
        current.lastPurchaseDate = new Date(order.createdAt) > new Date(current.lastPurchaseDate)
          ? order.createdAt
          : current.lastPurchaseDate;
        return;
      }

      registry.set(order.clientId, {
        clientId: order.clientId,
        clientName: order.clientNameSnapshot,
        totalPurchased: this.roundCurrency(order.total),
        totalOrders: 1,
        lastPurchaseDate: order.createdAt,
      });
    });

    return Array.from(registry.values())
      .sort((a, b) => {
        if (b.totalPurchased !== a.totalPurchased) {
          return b.totalPurchased - a.totalPurchased;
        }
        return b.totalOrders - a.totalOrders;
      })
      .slice(0, 10);
  }

  private buildTicketStatusRows(rows: any[]): TicketStatusRow[] {
    const sequence = [
      { status: 'open', label: 'Abiertos' },
      { status: 'assigned', label: 'Asignados' },
      { status: 'in_progress', label: 'En proceso' },
      { status: 'waiting_parts', label: 'Esperando partes' },
      { status: 'resolved', label: 'Resueltos' },
      { status: 'closed', label: 'Cerrados' },
      { status: 'cancelled', label: 'Cancelados' },
      { status: 'canceled', label: 'Cancelados' },
    ];

    const registry = new Map<string, TicketStatusRow>();
    sequence.forEach(item => {
      const key = item.status === 'canceled' ? 'cancelled' : item.status;
      const current = registry.get(key) ?? { status: key, label: item.label, count: 0 };
      current.count += rows.filter(row => String(row.status ?? '') === item.status).length;
      registry.set(key, current);
    });

    return Array.from(registry.values());
  }

  private buildRevenueByCategory(orders: Order[], products: Product[]): ReportDistributionRow[] {
    const productMeta = new Map(products.map(product => [product.id, product]));
    const registry = new Map<string, ReportDistributionRow>();

    orders.forEach(order => {
      order.items.forEach(item => {
        const meta = productMeta.get(item.productId);
        const category = this.getCommercialCategory(meta, item.productCategory);
        const current = registry.get(category.key) ?? { ...category, value: 0 };
        current.value = this.roundCurrency(current.value + item.totalLinePrice);
        registry.set(category.key, current);
      });
    });

    return Array.from(registry.values())
      .filter(row => row.value > 0)
      .sort((a, b) => b.value - a.value);
  }

  private buildCatalogDistribution(products: Product[]): ReportDistributionRow[] {
    const rows: ReportDistributionRow[] = [
      {
        key: 'new-products',
        label: 'Productos nuevos',
        value: products.filter(product =>
          (product.item_type ?? ProductItemType.Product) === ProductItemType.Product &&
          (product.product_condition ?? ProductCondition.New) === ProductCondition.New
        ).length,
      },
      {
        key: 'preowned-products',
        label: 'Productos seminuevos',
        value: products.filter(product =>
          (product.item_type ?? ProductItemType.Product) === ProductItemType.Product &&
          product.product_condition === ProductCondition.Preowned
        ).length,
      },
      {
        key: 'services',
        label: 'Servicios',
        value: products.filter(product => product.item_type === ProductItemType.Service).length,
      },
    ];

    return rows.filter(row => row.value > 0);
  }

  private getCommercialCategory(product?: Product, fallbackCategory?: ProductCategory | string): { key: string; label: string } {
    if (product?.item_type === ProductItemType.Service || fallbackCategory === ProductCategory.Servicio || fallbackCategory === ProductCategory.Services) {
      return { key: 'services', label: 'Servicios' };
    }

    if (product?.product_condition === ProductCondition.Preowned) {
      return { key: 'preowned', label: 'Seminuevos' };
    }

    const category = String(product?.category ?? fallbackCategory ?? '');
    if ([ProductCategory.Consumible, ProductCategory.Consumables, ProductCategory.Refaccion, ProductCategory.SpareParts, ProductCategory.Accesorio].includes(category as ProductCategory)) {
      return { key: 'consumables', label: 'Consumibles y refacciones' };
    }

    return { key: 'equipment', label: 'Equipos médicos' };
  }

  private countActiveClients(clients: any[]): number {
    return clients.filter(client => {
      const status = String(client.status ?? '').toLowerCase();
      return client.is_active !== false && status !== 'inactive' && status !== 'archived';
    }).length;
  }

  private countLowStockProducts(products: Product[], stockRows: any[]): number {
    const physicalProductIds = new Set(
      products
        .filter(product => (product.item_type ?? ProductItemType.Product) !== ProductItemType.Service)
        .map(product => product.id)
    );

    return stockRows.filter(row => {
      const productId = String(row.product_id ?? '');
      if (!physicalProductIds.has(productId)) {
        return false;
      }

      const quantity = Number(row.quantity ?? row.current_stock ?? row.stock ?? 0);
      const minStock = Number(row.min_stock ?? row.minimum_stock ?? 0);
      return quantity <= minStock;
    }).length;
  }

  private buildStockMap(rows: any[]): Map<string, number> {
    const map = new Map<string, number>();

    rows.forEach(row => {
      const productId = String(row.product_id ?? '');
      if (!productId) {
        return;
      }

      const current = map.get(productId) ?? 0;
      const quantity = Number(row.quantity ?? row.current_stock ?? row.stock ?? 0);
      map.set(productId, this.roundCurrency(current + quantity));
    });

    return map;
  }

  private filterOrdersByDate(orders: Order[], range: { from: Date; to: Date }): Order[] {
    return orders.filter(order => this.isDateInRange(order.createdAt, range));
  }

  private filterRowsByDate(rows: any[], range: { from: Date; to: Date }, fields: string[]): any[] {
    return rows.filter(row => {
      const value = fields.map(field => row?.[field]).find(Boolean);
      return this.isDateInRange(value, range);
    });
  }

  private isRevenueOrder(status: OrderStatus): boolean {
    return [OrderStatus.Paid, OrderStatus.Shipped, OrderStatus.Delivered].includes(status);
  }

  private resolveDateRange(filters: ReportFilters): { from: Date; to: Date } {
    if (filters.dateFrom && filters.dateTo) {
      return {
        from: this.parseDate(filters.dateFrom, false),
        to: this.parseDate(filters.dateTo, true),
      };
    }

    const today = new Date();
    const mode = filters.periodMode ?? 'day';

    if (mode === 'week') {
      const day = today.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset, 0, 0, 0, 0);
      const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6, 23, 59, 59, 999);
      return { from, to };
    }

    if (mode === 'month') {
      return {
        from: new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0),
        to: new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999),
      };
    }

    return {
      from: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0),
      to: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999),
    };
  }

  private isDateInRange(value: unknown, range: { from: Date; to: Date }): boolean {
    if (!value) {
      return false;
    }

    const time = new Date(String(value)).getTime();
    return Number.isFinite(time) && time >= range.from.getTime() && time <= range.to.getTime();
  }
  private parseDate(value: string, endOfDay: boolean): Date {
    const [year, month, day] = value.split('-').map(Number);
    if (endOfDay) {
      return new Date(year, (month || 1) - 1, day || 1, 23, 59, 59, 999);
    }

    return new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);
  }

  private getCategoryLabel(category?: ProductCategory | string | null): string {
    const labels: Record<string, string> = {
      [ProductCategory.EquipoMedico]: 'Equipo médico',
      [ProductCategory.UltrasonidoHumano]: 'Ultrasonido humano',
      [ProductCategory.UltrasonidoVeterinario]: 'Ultrasonido veterinario',
      [ProductCategory.Consumible]: 'Consumibles',
      [ProductCategory.Refaccion]: 'Refacciones',
      [ProductCategory.Accesorio]: 'Accesorios',
      [ProductCategory.Servicio]: 'Servicios',
      [ProductCategory.UltrasoundHuman]: 'Ultrasonido humano',
      [ProductCategory.UltrasoundVet]: 'Ultrasonido veterinario',
      [ProductCategory.Consumables]: 'Consumibles',
      [ProductCategory.SpareParts]: 'Refacciones',
      [ProductCategory.Services]: 'Servicios',
    };

    return labels[String(category ?? '')] ?? 'Sin categoría';
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private toAppError(message: string, fallback: string): Error {
    const lowered = String(message ?? '').toLowerCase();
    if (lowered.includes('permission') || lowered.includes('rls') || lowered.includes('policy')) {
      return new Error('No tienes permisos para consultar los reportes comerciales.');
    }

    return new Error(fallback);
  }
}
