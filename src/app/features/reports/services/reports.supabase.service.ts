import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OrderSupabaseService } from '../../orders/services/order.supabase.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ProductSupabaseService } from '../../products/services/product.supabase.service';
import { Product, ProductCategory } from '../../../models/product.model';
import { Order, OrderStatus } from '../../../models/order.model';
import {
  CustomerSalesRow,
  ESTIMATED_COST_RATIO,
  ProductLowSalesRow,
  ProductSalesRow,
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
    const [orders, products, ticketResponse, stockResponse] = await Promise.all([
      this.orderService.getOrders(),
      firstValueFrom(this.productService.getProducts()),
      this.supabase.client.from('service_tickets').select('status'),
      this.supabase.client.from('inventory_stock').select('*'),
    ]);

    if (ticketResponse.error) {
      throw this.toAppError(ticketResponse.error.message, 'No se pudo cargar la información del reporte.');
    }

    if (stockResponse.error) {
      throw this.toAppError(stockResponse.error.message, 'No se pudo cargar la información del reporte.');
    }

    const filteredOrders = this.filterOrdersByDate(orders, filters);
    const completedOrders = filteredOrders.filter(order => this.isCompletedOrder(order.status));
    const stockByProductId = this.buildStockMap(stockResponse.data ?? []);

    return {
      kpis: this.buildKpis(completedOrders),
      topProducts: this.buildTopProducts(completedOrders, products),
      lowProducts: this.buildLowProducts(completedOrders, products, stockByProductId),
      topCustomers: this.buildTopCustomers(completedOrders),
      orderAnalyticsOrders: filteredOrders,
      ticketStatusRows: this.buildTicketStatusRows(ticketResponse.data ?? []),
    };
  }

  private buildKpis(orders: Order[]): ReportKpis {
    const totalRevenue = this.roundCurrency(orders.reduce((sum, order) => sum + order.total, 0));
    const totalOrders = orders.length;

    return {
      totalRevenue,
      estimatedProfit: this.roundCurrency(totalRevenue * (1 - ESTIMATED_COST_RATIO)),
      totalOrders,
      avgTicket: totalOrders ? this.roundCurrency(totalRevenue / totalOrders) : 0,
      pendingOpportunities: 0,
      pendingOpportunitiesValue: 0,
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
      { status: 'canceled', label: 'Cancelados' },
    ];

    return sequence.map(item => ({
      status: item.status,
      label: item.label,
      count: rows.filter(row => String(row.status ?? '') === item.status).length,
    }));
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

  private filterOrdersByDate(orders: Order[], filters: ReportFilters): Order[] {
    const from = filters.dateFrom ? this.parseDate(filters.dateFrom, false) : null;
    const to = filters.dateTo ? this.parseDate(filters.dateTo, true) : null;

    return orders.filter(order => {
      const createdAt = new Date(order.createdAt).getTime();
      const matchesFrom = !from || createdAt >= from.getTime();
      const matchesTo = !to || createdAt <= to.getTime();
      return matchesFrom && matchesTo;
    });
  }

  private isCompletedOrder(status: OrderStatus): boolean {
    return [OrderStatus.Paid, OrderStatus.Shipped, OrderStatus.Delivered].includes(status);
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
