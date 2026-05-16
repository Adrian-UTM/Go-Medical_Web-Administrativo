// features/reports/services/reports-mock.service.ts
// Servicio mock de analítica comercial.
// Cruza datos de Pedidos, Productos, Inventario y Oportunidades.
// Al integrar Supabase: reemplazar con queries agregadas (GROUP BY, SUM) en RPC o Edge Functions.

import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OrderMockService } from '../../orders/services/order.mock.service';
import { ProductsMockService } from '../../products/services/products.mock.service';
import { InventoryMockService } from '../../inventory/services/inventory.mock.service';
import { OpportunitiesMockService } from '../../opportunities/services/opportunities-mock.service';
import { OrderStatus } from '../../../models/order.model';
import { ProductStatus } from '../../../models/product.model';
import { OpportunityStatus } from '../../opportunities/models/opportunity.model';
import {
  MOCK_COST_RATIO,
  ProductLowSalesRow,
  ProductSalesRow,
  CustomerSalesRow,
  ReportFilters,
  ReportKpis,
} from '../models/report.model';

@Injectable({ providedIn: 'root' })
export class ReportsMockService {
  private readonly orderService = inject(OrderMockService);
  private readonly productsService = inject(ProductsMockService);
  private readonly inventoryService = inject(InventoryMockService);
  private readonly opportunitiesService = inject(OpportunitiesMockService);

  // ---------------------------------------------------------------
  // KPI Cards
  // ---------------------------------------------------------------
  async getKpis(filters?: ReportFilters): Promise<ReportKpis> {
    const [orders, opportunities] = await Promise.all([
      this.orderService.getOrders(),
      this.opportunitiesService.getOpportunities(),
    ]);

    const completedStatuses = new Set([
      OrderStatus.Paid,
      OrderStatus.Delivered,
      OrderStatus.Shipped,
    ]);

    const filtered = this.applyOrderFilters(orders, filters);
    const completed = filtered.filter(o => completedStatuses.has(o.status));

    const totalRevenue = this.roundCurrency(completed.reduce((s, o) => s + o.total, 0));
    const estimatedProfit = this.roundCurrency(totalRevenue * (1 - MOCK_COST_RATIO));
    const totalOrders = completed.length;
    const avgTicket = totalOrders > 0 ? this.roundCurrency(totalRevenue / totalOrders) : 0;

    const pendingOpportunities = opportunities.filter(
      op =>
        op.opportunityStatus === OpportunityStatus.New ||
        op.opportunityStatus === OpportunityStatus.Contacted ||
        op.opportunityStatus === OpportunityStatus.Interested
    );

    const pendingOpportunitiesValue = this.roundCurrency(
      pendingOpportunities.reduce((s, op) => s + op.estimatedTotal, 0)
    );

    return {
      totalRevenue,
      estimatedProfit,
      totalOrders,
      avgTicket,
      pendingOpportunities: pendingOpportunities.length,
      pendingOpportunitiesValue,
    };
  }

  // ---------------------------------------------------------------
  // Top Products (por unidades vendidas)
  // ---------------------------------------------------------------
  async getTopProducts(filters?: ReportFilters, limit = 10): Promise<ProductSalesRow[]> {
    const [orders, productResponse] = await Promise.all([
      this.orderService.getOrders(),
      firstValueFrom(this.productsService.getProducts({ status: ProductStatus.Active })),
    ]);

    const completedStatuses = new Set([OrderStatus.Paid, OrderStatus.Delivered, OrderStatus.Shipped]);
    const filtered = this.applyOrderFilters(orders, filters).filter(o => completedStatuses.has(o.status));

    // Aggregate sales per product
    const salesMap = new Map<string, { unitsSold: number; totalRevenue: number; productName: string; sku: string; category: string }>();

    for (const order of filtered) {
      for (const item of order.items) {
        const existing = salesMap.get(item.productId);
        if (existing) {
          existing.unitsSold += item.quantity;
          existing.totalRevenue += item.totalLinePrice;
        } else {
          salesMap.set(item.productId, {
            productName: item.productName,
            sku: item.sku,
            category: this.categoryLabel(item.productCategory),
            unitsSold: item.quantity,
            totalRevenue: item.totalLinePrice,
          });
        }
      }
    }

    const rows: ProductSalesRow[] = [...salesMap.entries()].map(([productId, data]) => {
      const estimatedProfit = this.roundCurrency(data.totalRevenue * (1 - MOCK_COST_RATIO));
      return {
        productId,
        sku: data.sku,
        productName: data.productName,
        category: data.category,
        unitsSold: data.unitsSold,
        totalRevenue: this.roundCurrency(data.totalRevenue),
        estimatedProfit,
        marginPct: 1 - MOCK_COST_RATIO,
      };
    });

    return rows.sort((a, b) => b.unitsSold - a.unitsSold).slice(0, limit);
  }

  // ---------------------------------------------------------------
  // Low-selling Products (menor movimiento + stock)
  // ---------------------------------------------------------------
  async getLowProducts(filters?: ReportFilters, limit = 10): Promise<ProductLowSalesRow[]> {
    const [orders, productResponse, stocks] = await Promise.all([
      this.orderService.getOrders(),
      firstValueFrom(this.productsService.getProducts({ status: ProductStatus.Active })),
      this.inventoryService.getStocks(),
    ]);

    const completedStatuses = new Set([OrderStatus.Paid, OrderStatus.Delivered, OrderStatus.Shipped, OrderStatus.Processing]);
    const filtered = this.applyOrderFilters(orders, filters).filter(o => completedStatuses.has(o.status));

    // Map product -> units sold + last sale date
    const salesMap = new Map<string, { unitsSold: number; lastSaleDate: string }>();
    for (const order of filtered) {
      for (const item of order.items) {
        const existing = salesMap.get(item.productId);
        if (existing) {
          existing.unitsSold += item.quantity;
          if (order.updatedAt > existing.lastSaleDate) {
            existing.lastSaleDate = order.updatedAt;
          }
        } else {
          salesMap.set(item.productId, { unitsSold: item.quantity, lastSaleDate: order.updatedAt });
        }
      }
    }

    const rows: ProductLowSalesRow[] = productResponse.data.map(product => {
      const sales = salesMap.get(product.id);
      const stock = stocks.find(s => s.productId === product.id);
      return {
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        category: this.categoryLabel(product.category),
        unitsSold: sales?.unitsSold ?? 0,
        currentStock: stock?.currentStock ?? 0,
        lastSaleDate: sales?.lastSaleDate ?? null,
      };
    });

    return rows.sort((a, b) => a.unitsSold - b.unitsSold).slice(0, limit);
  }

  // ---------------------------------------------------------------
  // Top Customers (por total comprado)
  // ---------------------------------------------------------------
  async getTopCustomers(filters?: ReportFilters, limit = 10): Promise<CustomerSalesRow[]> {
    const orders = await this.orderService.getOrders();

    const completedStatuses = new Set([OrderStatus.Paid, OrderStatus.Delivered, OrderStatus.Shipped]);
    const filtered = this.applyOrderFilters(orders, filters).filter(o => completedStatuses.has(o.status));

    const clientMap = new Map<string, { clientName: string; totalPurchased: number; totalOrders: number; lastPurchaseDate: string }>();

    for (const order of filtered) {
      const existing = clientMap.get(order.clientId);
      if (existing) {
        existing.totalPurchased += order.total;
        existing.totalOrders += 1;
        if (order.updatedAt > existing.lastPurchaseDate) {
          existing.lastPurchaseDate = order.updatedAt;
        }
      } else {
        clientMap.set(order.clientId, {
          clientName: order.clientNameSnapshot,
          totalPurchased: order.total,
          totalOrders: 1,
          lastPurchaseDate: order.updatedAt,
        });
      }
    }

    const rows: CustomerSalesRow[] = [...clientMap.entries()].map(([clientId, data]) => ({
      clientId,
      clientName: data.clientName,
      totalPurchased: this.roundCurrency(data.totalPurchased),
      totalOrders: data.totalOrders,
      lastPurchaseDate: data.lastPurchaseDate,
    }));

    return rows.sort((a, b) => b.totalPurchased - a.totalPurchased).slice(0, limit);
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  private applyOrderFilters(orders: any[], filters?: ReportFilters): any[] {
    let result = [...orders];
    if (filters?.dateFrom) {
      result = result.filter(o => o.createdAt >= filters.dateFrom!);
    }
    if (filters?.dateTo) {
      const dateTo = filters.dateTo + 'T23:59:59Z';
      result = result.filter(o => o.createdAt <= dateTo);
    }
    if (filters?.orderStatus) {
      result = result.filter(o => o.status === filters.orderStatus);
    }
    return result;
  }

  private categoryLabel(category: string): string {
    const labels: Record<string, string> = {
      ultrasound_human: 'Ultrasonido Humano',
      ultrasound_vet: 'Ultrasonido Veterinario',
      consumables: 'Consumibles',
      services: 'Servicios',
      spare_parts: 'Refacciones',
    };
    return labels[category] ?? category;
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
