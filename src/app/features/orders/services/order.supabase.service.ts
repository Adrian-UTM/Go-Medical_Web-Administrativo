import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ClientSupabaseService } from '../../clients/services/client.supabase.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Client, ClientStatus } from '../../../core/models/client.model';
import {
  DEFAULT_ORDER_TAX_PCT,
  Order,
  OrderFilters,
  OrderItem,
  OrderItemDraft,
  OrderStatus,
  OrderTotals,
  OrderUpsertPayload,
} from '../../../models/order.model';
import { Product, ProductCategory } from '../../../models/product.model';
import { ProductSupabaseService } from '../../products/services/product.supabase.service';

@Injectable({
  providedIn: 'root'
})
export class OrderSupabaseService {
  private readonly orderTable = 'orders';
  private readonly orderItemsTable = 'order_items';

  constructor(
    private readonly supabase: SupabaseService,
    private readonly clientsService: ClientSupabaseService,
    private readonly productsService: ProductSupabaseService,
  ) {}

  async getOrders(filters?: OrderFilters): Promise<Order[]> {
    const [orderResponse, itemsResponse] = await Promise.all([
      this.supabase.client
        .from(this.orderTable)
        .select('*')
        .order('created_at', { ascending: false }),
      this.supabase.client
        .from(this.orderItemsTable)
        .select('*')
        .order('created_at', { ascending: true }),
    ]);

    if (orderResponse.error) {
      throw this.toAppError(orderResponse.error.message, 'No fue posible cargar los pedidos.');
    }

    if (itemsResponse.error) {
      throw this.toAppError(itemsResponse.error.message, 'No fue posible cargar las partidas de los pedidos.');
    }

    const itemsByOrderId = this.groupItemsByParent(itemsResponse.data ?? [], 'order_id');
    const orders = (orderResponse.data ?? []).map(row => this.mapOrder(row, itemsByOrderId.get(row.id) ?? []));
    return this.applyFilters(orders, filters);
  }

  async getOrderById(id: string): Promise<Order | undefined> {
    const [orderResponse, itemsResponse] = await Promise.all([
      this.supabase.client
        .from(this.orderTable)
        .select('*')
        .eq('id', id)
        .single(),
      this.supabase.client
        .from(this.orderItemsTable)
        .select('*')
        .eq('order_id', id)
        .order('created_at', { ascending: true }),
    ]);

    if (orderResponse.error) {
      if (orderResponse.error.code === 'PGRST116') {
        return undefined;
      }

      throw this.toAppError(orderResponse.error.message, 'No fue posible cargar el pedido solicitado.');
    }

    if (itemsResponse.error) {
      throw this.toAppError(itemsResponse.error.message, 'No fue posible cargar las partidas del pedido.');
    }

    return this.mapOrder(orderResponse.data, itemsResponse.data ?? []);
  }

  async getActiveClients(): Promise<Client[]> {
    const clients = await firstValueFrom(this.clientsService.getClients());
    return clients.filter(client => client.status === ClientStatus.Active);
  }

  async getAvailableProducts(): Promise<Product[]> {
    const products = await firstValueFrom(this.productsService.getProducts());
    return products.filter(product => product.is_active !== false);
  }

  async createOrder(payload: OrderUpsertPayload): Promise<Order | undefined> {
    const products = await this.getAvailableProducts();
    const normalizedItems = this.normalizeDraftItems(payload.items, products);
    const totals = this.calculateTotals(normalizedItems, payload.taxPct ?? DEFAULT_ORDER_TAX_PCT, !!payload.taxExempt);
    const client = await this.getClientById(payload.clientId);

    const insertPayload = {
      order_number: await this.generateNextOrderNumber(),
      client_id: payload.clientId,
      client_name_snapshot: payload.clientNameSnapshot ?? client?.businessName ?? '',
      status: payload.status ?? OrderStatus.Draft,
      subtotal: totals.subtotal,
      tax_pct: payload.taxPct ?? DEFAULT_ORDER_TAX_PCT,
      tax_exempt: !!payload.taxExempt,
      tax: totals.tax,
      total: totals.total,
      notes: payload.notes ?? '',
    };

    const { data, error } = await this.supabase.client
      .from(this.orderTable)
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      throw this.toAppError(error.message, 'No fue posible crear el pedido.');
    }

    const itemInsertResponse = await this.supabase.client
      .from(this.orderItemsTable)
      .insert(normalizedItems.map(item => this.mapOrderItemInsertPayload(data.id, item)));

    if (itemInsertResponse.error) {
      throw this.toAppError(itemInsertResponse.error.message, 'No fue posible guardar los conceptos del pedido.');
    }

    return this.getOrderById(data.id);
  }

  async updateOrder(id: string, payload: OrderUpsertPayload): Promise<Order | undefined> {
    const existing = await this.getOrderById(id);
    if (!existing) {
      return undefined;
    }

    const products = await this.getAvailableProducts();
    const normalizedItems = this.normalizeDraftItems(payload.items, products);
    const totals = this.calculateTotals(normalizedItems, payload.taxPct ?? existing.taxPct, !!payload.taxExempt);

    const updatePayload = {
      client_id: payload.clientId,
      client_name_snapshot: payload.clientNameSnapshot ?? existing.clientNameSnapshot,
      status: payload.status ?? existing.status,
      subtotal: totals.subtotal,
      tax_pct: payload.taxPct ?? existing.taxPct,
      tax_exempt: !!payload.taxExempt,
      tax: totals.tax,
      total: totals.total,
      notes: payload.notes ?? '',
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.supabase.client
      .from(this.orderTable)
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      throw this.toAppError(error.message, 'No fue posible actualizar el pedido.');
    }

    const deleteResponse = await this.supabase.client
      .from(this.orderItemsTable)
      .delete()
      .eq('order_id', id);

    if (deleteResponse.error) {
      throw this.toAppError(deleteResponse.error.message, 'No fue posible reemplazar las partidas del pedido.');
    }

    if (normalizedItems.length > 0) {
      const itemInsertResponse = await this.supabase.client
        .from(this.orderItemsTable)
        .insert(normalizedItems.map(item => this.mapOrderItemInsertPayload(id, item)));

      if (itemInsertResponse.error) {
        throw this.toAppError(itemInsertResponse.error.message, 'No fue posible guardar las partidas actualizadas del pedido.');
      }
    }

    return this.getOrderById(id);
  }

  async deleteOrder(id: string): Promise<boolean> {
    const { error } = await this.supabase.client
      .from(this.orderTable)
      .delete()
      .eq('id', id);

    if (error) {
      throw this.toAppError(error.message, 'No fue posible eliminar el pedido.');
    }

    return true;
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order | undefined> {
    const { error } = await this.supabase.client
      .from(this.orderTable)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      throw this.toAppError(error.message, 'No fue posible actualizar el estado del pedido.');
    }

    return this.getOrderById(id);
  }

  calculateTotals(items: OrderItemDraft[], taxPct = DEFAULT_ORDER_TAX_PCT, taxExempt = false): OrderTotals {
    const subtotal = this.roundCurrency(items.reduce((sum, item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const unitPrice = Number(item.unitPrice) || 0;
      return sum + quantity * unitPrice;
    }, 0));

    const tax = taxExempt ? 0 : this.roundCurrency(subtotal * taxPct);
    return {
      subtotal,
      tax,
      total: this.roundCurrency(subtotal + tax),
    };
  }

  async getClientById(id: string): Promise<Client | undefined> {
    try {
      return await firstValueFrom(this.clientsService.getClientById(id));
    } catch {
      return undefined;
    }
  }

  private mapOrder(row: any, itemRows: any[]): Order {
    return {
      id: String(row.id),
      folio: row.order_number ?? row.folio ?? `PED-${this.getShortId(row.id)}`,
      clientId: String(row.client_id ?? ''),
      clientNameSnapshot: row.client_name_snapshot ?? 'Cliente no disponible',
      status: (row.status ?? OrderStatus.Draft) as OrderStatus,
      items: itemRows.map(item => this.mapOrderItem(item)),
      subtotal: Number(row.subtotal ?? 0),
      taxPct: Number(row.tax_pct ?? DEFAULT_ORDER_TAX_PCT),
      taxExempt: !!row.tax_exempt,
      tax: Number(row.tax ?? 0),
      total: Number(row.total ?? 0),
      notes: row.notes ?? '',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    };
  }

  private mapOrderItem(row: any): OrderItem {
    return {
      productId: String(row.product_id ?? ''),
      sku: row.sku ?? '',
      productName: row.product_name ?? '',
      productCategory: (row.product_category ?? '') as ProductCategory,
      quantity: Number(row.quantity ?? 0),
      unitPrice: Number(row.unit_price ?? 0),
      totalLinePrice: Number(row.total_line_price ?? 0),
    };
  }

  private normalizeDraftItems(items: OrderItemDraft[], products: Product[]): OrderItemDraft[] {
    return items
      .filter(item => item.productId)
      .map(item => {
        const product = products.find(candidate => candidate.id === item.productId);
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const unitPrice = Number(item.unitPrice ?? product?.price_mxn ?? product?.unit_price_mxn ?? 0);

        return {
          productId: item.productId,
          sku: item.sku ?? product?.sku ?? '',
          productName: item.productName ?? product?.name ?? '',
          productCategory: (item.productCategory ?? product?.category ?? '') as ProductCategory,
          quantity,
          unitPrice,
        };
      });
  }

  private mapOrderItemInsertPayload(orderId: string, item: OrderItemDraft): Record<string, unknown> {
    return {
      order_id: orderId,
      product_id: item.productId,
      sku: item.sku ?? '',
      product_name: item.productName ?? '',
      product_category: item.productCategory ?? null,
      quantity: item.quantity,
      unit_price: item.unitPrice ?? 0,
      total_line_price: this.roundCurrency((item.quantity || 0) * (item.unitPrice || 0)),
    };
  }

  private groupItemsByParent(rows: any[], foreignKey: string): Map<string, any[]> {
    const map = new Map<string, any[]>();

    rows.forEach(row => {
      const parentId = String(row[foreignKey] ?? '');
      const current = map.get(parentId) ?? [];
      current.push(row);
      map.set(parentId, current);
    });

    return map;
  }

  private applyFilters(orders: Order[], filters?: OrderFilters): Order[] {
    if (!filters) {
      return orders;
    }

    const query = filters.search?.trim().toLowerCase();
    return orders.filter(order => {
      const matchesQuery = !query || [
        order.folio,
        order.clientNameSnapshot,
        ...order.items.map(item => item.productName),
      ].some(value => value.toLowerCase().includes(query));
      const matchesStatus = !filters.status || order.status === filters.status;
      return matchesQuery && matchesStatus;
    });
  }

  private async generateNextOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const { data, error } = await this.supabase.client
      .from(this.orderTable)
      .select('order_number')
      .like('order_number', `BCO-${year}-%`);

    if (error) {
      return `BCO-${year}-0001`;
    }

    const sequence = (data ?? [])
      .map((row: any) => Number(String(row.order_number ?? '').split('-').at(-1)))
      .filter((value: number) => Number.isFinite(value))
      .reduce((max: number, value: number) => Math.max(max, value), 0);

    return `BCO-${year}-${String(sequence + 1).padStart(4, '0')}`;
  }

  private getShortId(value: unknown): string {
    return String(value ?? '').replace(/-/g, '').slice(0, 8).toUpperCase() || '0000';
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private toAppError(message: string, fallback: string): Error {
    const lowered = String(message ?? '').toLowerCase();
    if (lowered.includes('permission') || lowered.includes('rls') || lowered.includes('policy')) {
      return new Error('No tienes permisos para consultar o modificar pedidos.');
    }

    return new Error(fallback);
  }
}
