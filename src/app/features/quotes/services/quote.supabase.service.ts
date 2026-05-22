import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ClientSupabaseService } from '../../clients/services/client.supabase.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Client, ClientStatus } from '../../../core/models/client.model';
import { Product } from '../../../models/product.model';
import { ProductSupabaseService } from '../../products/services/product.supabase.service';
import {
  DEFAULT_QUOTE_TAX_PCT,
  Quote,
  QuoteFilters,
  QuoteItem,
  QuoteItemDraft,
  QuoteStatus,
  QuoteTotals,
  QuoteUpsertPayload,
} from '../models/quote.model';

@Injectable({
  providedIn: 'root'
})
export class QuoteSupabaseService {
  private readonly quoteTable = 'quotes';
  private readonly quoteItemsTable = 'quote_items';

  constructor(
    private readonly supabase: SupabaseService,
    private readonly clientsService: ClientSupabaseService,
    private readonly productsService: ProductSupabaseService,
  ) {}

  async getQuotes(filters?: QuoteFilters): Promise<Quote[]> {
    const [quoteResponse, itemsResponse] = await Promise.all([
      this.supabase.client
        .from(this.quoteTable)
        .select('*')
        .order('created_at', { ascending: false }),
      this.supabase.client
        .from(this.quoteItemsTable)
        .select('*')
        .order('created_at', { ascending: true }),
    ]);

    if (quoteResponse.error) {
      throw this.toAppError(quoteResponse.error.message, 'No fue posible cargar las cotizaciones reales.');
    }

    if (itemsResponse.error) {
      throw this.toAppError(itemsResponse.error.message, 'No fue posible cargar los conceptos de cotización.');
    }

    const itemsByQuoteId = this.groupItemsByParent(itemsResponse.data ?? [], 'quote_id');
    const clientMap = await this.getClientMap((quoteResponse.data ?? []).map((row: any) => row.client_id).filter(Boolean));
    const quotes = (quoteResponse.data ?? []).map(row => this.mapQuote(row, itemsByQuoteId.get(row.id) ?? [], clientMap.get(String(row.client_id ?? ''))));
    return this.applyFilters(quotes, filters);
  }

  async getQuoteById(id: string): Promise<Quote | undefined> {
    const [quoteResponse, itemsResponse] = await Promise.all([
      this.supabase.client
        .from(this.quoteTable)
        .select('*')
        .eq('id', id)
        .single(),
      this.supabase.client
        .from(this.quoteItemsTable)
        .select('*')
        .eq('quote_id', id)
        .order('created_at', { ascending: true }),
    ]);

    if (quoteResponse.error) {
      if (quoteResponse.error.code === 'PGRST116') {
        return undefined;
      }

      throw this.toAppError(quoteResponse.error.message, 'No fue posible cargar la cotización solicitada.');
    }

    if (itemsResponse.error) {
      throw this.toAppError(itemsResponse.error.message, 'No fue posible cargar los conceptos de la cotización.');
    }

    const client = quoteResponse.data?.client_id ? await this.getClientById(String(quoteResponse.data.client_id)) : undefined;
    return this.mapQuote(quoteResponse.data, itemsResponse.data ?? [], client);
  }

  async getActiveClients(): Promise<Client[]> {
    const clients = await firstValueFrom(this.clientsService.getClients());
    return clients.filter(client => client.status === ClientStatus.Active);
  }

  async getAvailableProducts(): Promise<Product[]> {
    const products = await firstValueFrom(this.productsService.getProducts());
    return products.filter(product => product.is_active !== false);
  }

  async createQuote(payload: QuoteUpsertPayload): Promise<Quote | undefined> {
    const products = await this.getAvailableProducts();
    const normalizedItems = this.normalizeDraftItems(payload.items, products);
    const totals = this.calculateTotals(normalizedItems, payload.tax_pct ?? DEFAULT_QUOTE_TAX_PCT);
    const client = await this.getClientById(payload.clientId);

    const insertPayload = {
      quote_number: await this.generateNextQuoteNumber(),
      client_id: payload.clientId,
      client_name_snapshot: payload.clientNameSnapshot ?? client?.businessName ?? '',
      status: payload.status ?? QuoteStatus.Draft,
      subtotal: totals.subtotal,
      tax_pct: payload.tax_pct ?? DEFAULT_QUOTE_TAX_PCT,
      tax: totals.tax,
      total: totals.total,
      valid_until: payload.validUntil,
      notes: payload.notes ?? '',
    };

    const { data, error } = await this.supabase.client
      .from(this.quoteTable)
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      console.error('[Quotes] Error creating quote', { payload: insertPayload, error });
      throw this.toAppError(error.message, 'No fue posible crear la cotización.');
    }

    const itemPayloads = normalizedItems.map(item => this.mapQuoteItemInsertPayload(data.id, item));
    const itemsInsertResponse = await this.supabase.client
      .from(this.quoteItemsTable)
      .insert(itemPayloads);

    if (itemsInsertResponse.error) {
      console.error('[Quotes] Error creating quote items', { payload: itemPayloads, error: itemsInsertResponse.error });
      throw this.toAppError(itemsInsertResponse.error.message, 'No fue posible guardar los conceptos de la cotización.');
    }

    return this.getQuoteById(data.id);
  }

  async updateQuote(id: string, payload: QuoteUpsertPayload): Promise<Quote | undefined> {
    const existing = await this.getQuoteById(id);
    if (!existing) {
      return undefined;
    }

    const products = await this.getAvailableProducts();
    const normalizedItems = this.normalizeDraftItems(payload.items, products);
    const totals = this.calculateTotals(normalizedItems, payload.tax_pct ?? existing.tax_pct);

    const updatePayload = {
      client_id: payload.clientId,
      client_name_snapshot: payload.clientNameSnapshot ?? existing.clientNameSnapshot,
      status: payload.status ?? existing.status,
      subtotal: totals.subtotal,
      tax_pct: payload.tax_pct ?? existing.tax_pct,
      tax: totals.tax,
      total: totals.total,
      valid_until: payload.validUntil,
      notes: payload.notes ?? '',
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.supabase.client
      .from(this.quoteTable)
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      console.error('[Quotes] Error updating quote', { payload: updatePayload, error });
      throw this.toAppError(error.message, 'No fue posible actualizar la cotización.');
    }

    const deleteResponse = await this.supabase.client
      .from(this.quoteItemsTable)
      .delete()
      .eq('quote_id', id);

    if (deleteResponse.error) {
      console.error('[Quotes] Error deleting quote items', { quoteId: id, error: deleteResponse.error });
      throw this.toAppError(deleteResponse.error.message, 'No fue posible reemplazar los conceptos de la cotización.');
    }

    if (normalizedItems.length > 0) {
      const itemPayloads = normalizedItems.map(item => this.mapQuoteItemInsertPayload(id, item));
      const itemsInsertResponse = await this.supabase.client
        .from(this.quoteItemsTable)
        .insert(itemPayloads);

      if (itemsInsertResponse.error) {
        console.error('[Quotes] Error updating quote items', { payload: itemPayloads, error: itemsInsertResponse.error });
        throw this.toAppError(itemsInsertResponse.error.message, 'No fue posible guardar los conceptos actualizados de la cotización.');
      }
    }

    return this.getQuoteById(id);
  }

  async updateQuoteStatus(id: string, status: QuoteStatus): Promise<Quote | undefined> {
    const { error } = await this.supabase.client
      .from(this.quoteTable)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      throw this.toAppError(error.message, 'No fue posible actualizar el estado de la cotización.');
    }

    return this.getQuoteById(id);
  }

  calculateTotals(items: QuoteItemDraft[], taxPct = DEFAULT_QUOTE_TAX_PCT): QuoteTotals {
    const subtotal = this.roundCurrency(items.reduce((sum, item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const unitPrice = Number(item.unitPrice) || 0;
      const gross = quantity * unitPrice;
      const discount = Math.min(Math.max(Number(item.discount) || 0, 0), gross);
      return sum + (gross - discount);
    }, 0));

    const tax = this.roundCurrency(subtotal * taxPct);
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

  private async getClientMap(clientIds: string[]): Promise<Map<string, Client>> {
    const uniqueIds = new Set(clientIds.map(id => String(id)).filter(Boolean));
    if (uniqueIds.size === 0) {
      return new Map();
    }

    const clients = await firstValueFrom(this.clientsService.getClients());
    return new Map(clients.filter(client => uniqueIds.has(client.id)).map(client => [client.id, client]));
  }

  private formatClientAddress(client?: Client): string {
    if (!client) {
      return '';
    }

    const address = client.formattedBillingAddress || client.address || client.shippingAddress || '';
    const location = [client.city, client.state, client.country].filter(Boolean).join(', ');
    return [address, location].filter(Boolean).join(', ');
  }

  private mapQuote(row: any, itemRows: any[], client?: Client): Quote {
    return {
      id: String(row.id),
      quoteNumber: row.quote_number ?? row.quoteNumber ?? 'Sin folio',
      clientId: String(row.client_id ?? ''),
      clientNameSnapshot: row.client_name_snapshot ?? client?.businessName ?? 'Cliente no disponible',
      clientRfcSnapshot: row.client_rfc_snapshot ?? client?.rfc ?? '',
      clientAddressSnapshot: row.client_address_snapshot ?? this.formatClientAddress(client),
      status: (row.status ?? QuoteStatus.Draft) as QuoteStatus,
      items: itemRows.map(item => this.mapQuoteItem(item)),
      subtotal: Number(row.subtotal ?? 0),
      tax_pct: Number(row.tax_pct ?? DEFAULT_QUOTE_TAX_PCT),
      tax: Number(row.tax ?? 0),
      total: Number(row.total ?? 0),
      validUntil: row.valid_until ?? row.validUntil ?? new Date().toISOString(),
      notes: row.notes ?? '',
      conditions: row.conditions ?? '',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    };
  }

  private mapQuoteItem(row: any): QuoteItem {
    return {
      productId: String(row.product_id ?? ''),
      sku: row.sku ?? '',
      productName: row.product_name ?? '',
      quantity: Number(row.quantity ?? 0),
      unitPrice: Number(row.unit_price ?? 0),
      discount: Number(row.discount ?? 0),
      totalLinePrice: Number(row.total_line_price ?? 0),
    };
  }

  private normalizeDraftItems(items: QuoteItemDraft[], products: Product[]): QuoteItemDraft[] {
    return items
      .filter(item => item.productId)
      .map(item => {
        const product = products.find(candidate => candidate.id === item.productId);
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const unitPrice = Number(item.unitPrice ?? product?.price_mxn ?? product?.unit_price_mxn ?? 0);
        const gross = quantity * unitPrice;
        const discount = Math.min(Math.max(Number(item.discount) || 0, 0), gross);

        return {
          productId: item.productId,
          sku: item.sku ?? product?.sku ?? '',
          productName: item.productName ?? product?.name ?? '',
          quantity,
          unitPrice,
          discount: this.roundCurrency(discount),
        };
      });
  }

  private mapQuoteItemInsertPayload(quoteId: string, item: QuoteItemDraft): Record<string, unknown> {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const discount = Number(item.discount) || 0;

    return {
      quote_id: quoteId,
      product_id: item.productId,
      sku_snapshot: item.sku ?? '',
      product_name_snapshot: item.productName ?? '',
      product_category_snapshot: (item as any).productCategory ?? null,
      quantity,
      unit_price: unitPrice,
      discount,
      total_line_price: this.roundCurrency(quantity * unitPrice - discount),
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

  private applyFilters(quotes: Quote[], filters?: QuoteFilters): Quote[] {
    if (!filters) {
      return quotes;
    }

    const query = filters.search?.trim().toLowerCase();
    return quotes.filter(quote => {
      const matchesQuery = !query || [
        quote.quoteNumber,
        quote.clientNameSnapshot,
        ...quote.items.map(item => item.productName),
      ].some(value => value.toLowerCase().includes(query));
      const matchesStatus = !filters.status || quote.status === filters.status;
      return matchesQuery && matchesStatus;
    });
  }

  private async generateNextQuoteNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const { data, error } = await this.supabase.client
      .from(this.quoteTable)
      .select('quote_number')
      .like('quote_number', `BCQ-${year}-%`);

    if (error) {
      return `BCQ-${year}-0001`;
    }

    const sequence = (data ?? [])
      .map((row: any) => Number(String(row.quote_number ?? '').split('-').at(-1)))
      .filter((value: number) => Number.isFinite(value))
      .reduce((max: number, value: number) => Math.max(max, value), 0);

    return `BCQ-${year}-${String(sequence + 1).padStart(4, '0')}`;
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private toAppError(message: string, fallback: string): Error {
    const lowered = message.toLowerCase();
    if (lowered.includes('permission') || lowered.includes('rls') || lowered.includes('policy')) {
      return new Error('No tienes permisos para consultar o modificar cotizaciones.');
    }

    return new Error(fallback);
  }
}




