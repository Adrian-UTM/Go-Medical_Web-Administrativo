import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Client } from '../../../core/models/client.model';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  CreateReturnRequestPayload,
  ReturnItemCondition,
  ReturnItemResolution,
  ReturnReasonType,
  ReturnRequest,
  ReturnRequestFilters,
  ReturnRequestItem,
  ReturnRequestStatus,
  UpdateReturnRequestItemPayload,
} from '../../../models/return-request.model';
import { Order } from '../../../models/order.model';
import { ClientSupabaseService } from '../../clients/services/client.supabase.service';
import { OrderSupabaseService } from './order.supabase.service';

@Injectable({ providedIn: 'root' })
export class ReturnRequestsSupabaseService {
  private readonly tableName = 'return_requests';
  private readonly itemsTableName = 'return_request_items';
  private readonly openStatuses = [
    ReturnRequestStatus.PendingReview,
    ReturnRequestStatus.Approved,
    ReturnRequestStatus.ProductReceived,
    ReturnRequestStatus.RefundProcessed,
    ReturnRequestStatus.ReplacementSent,
  ];

  constructor(
    private readonly supabase: SupabaseService,
    private readonly authService: AuthService,
    private readonly orderService: OrderSupabaseService,
    private readonly clientsService: ClientSupabaseService,
  ) {}

  async getReturnRequests(filters?: ReturnRequestFilters): Promise<ReturnRequest[]> {
    const [requestResponse, itemResponse] = await Promise.all([
      this.supabase.client
        .from(this.tableName)
        .select('*')
        .order('requested_at', { ascending: false }),
      this.supabase.client
        .from(this.itemsTableName)
        .select('*')
        .order('created_at', { ascending: true }),
    ]);

    if (requestResponse.error) {
      console.error('[Returns] Error loading return requests', {
        error: requestResponse.error,
        message: requestResponse.error?.message,
        details: requestResponse.error?.details,
        hint: requestResponse.error?.hint,
        code: requestResponse.error?.code,
      });
      throw this.toAppError(requestResponse.error.message, 'No fue posible cargar las devoluciones.');
    }

    if (itemResponse.error) {
      console.error('[Returns] Error loading return request items', {
        error: itemResponse.error,
        message: itemResponse.error?.message,
        details: itemResponse.error?.details,
        hint: itemResponse.error?.hint,
        code: itemResponse.error?.code,
      });
      throw this.toAppError(itemResponse.error.message, 'No fue posible cargar las devoluciones.');
    }

    const requestRows = requestResponse.data ?? [];
    const itemRows = itemResponse.data ?? [];
    const orderMap = await this.getOrdersMap(requestRows.map(row => String(row.order_id ?? '')).filter(Boolean));
    const clientMap = await this.getClientsMap(requestRows.map(row => String(row.client_id ?? '')).filter(Boolean));
    const itemsByRequestId = this.groupItemsByRequestId(itemRows);
    const returns = requestRows.map(row => this.mapReturnRequest(row, itemsByRequestId.get(String(row.id)) ?? [], orderMap, clientMap));
    return this.applyFilters(returns, filters);
  }

  async getReturnRequestById(id: string): Promise<ReturnRequest | undefined> {
    const [requestResponse, itemResponse] = await Promise.all([
      this.supabase.client
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single(),
      this.supabase.client
        .from(this.itemsTableName)
        .select('*')
        .eq('return_request_id', id)
        .order('created_at', { ascending: true }),
    ]);

    if (requestResponse.error) {
      if (requestResponse.error.code === 'PGRST116') {
        return undefined;
      }

      console.error('[Returns] Error loading return request', {
        error: requestResponse.error,
        message: requestResponse.error?.message,
        details: requestResponse.error?.details,
        hint: requestResponse.error?.hint,
        code: requestResponse.error?.code,
      });
      throw this.toAppError(requestResponse.error.message, 'No fue posible cargar la devolucion.');
    }

    if (itemResponse.error) {
      throw this.toAppError(itemResponse.error.message, 'No fue posible cargar los productos de la devolucion.');
    }

    const orderMap = await this.getOrdersMap([String(requestResponse.data.order_id ?? '')].filter(Boolean));
    const clientMap = await this.getClientsMap([String(requestResponse.data.client_id ?? '')].filter(Boolean));
    return this.mapReturnRequest(requestResponse.data, itemResponse.data ?? [], orderMap, clientMap);
  }

  async getOpenReturnRequestForOrder(orderId: string): Promise<ReturnRequest | undefined> {
    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .select('*')
      .eq('order_id', orderId)
      .in('status', this.openStatuses)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw this.toAppError(error.message, 'No fue posible validar devoluciones abiertas del pedido.');
    }

    if (!data) {
      return undefined;
    }

    const items = await this.getReturnRequestItems(String(data.id));
    const orderMap = await this.getOrdersMap([String(data.order_id ?? '')].filter(Boolean));
    const clientMap = await this.getClientsMap([String(data.client_id ?? '')].filter(Boolean));
    return this.mapReturnRequest(data, items, orderMap, clientMap);
  }

  async createReturnRequest(payload: CreateReturnRequestPayload): Promise<ReturnRequest | undefined> {
    const normalizedItems = payload.items
      .filter(item => item.orderItemId && item.productId && item.quantity > 0)
      .map(item => ({
        ...item,
        quantity: Math.max(1, Number(item.quantity) || 1),
        unitPriceMxn: Number(item.unitPriceMxn) || 0,
      }));

    const insertPayload = {
      return_number: await this.generateNextReturnNumber(),
      order_id: payload.orderId,
      client_id: payload.clientId,
      status: ReturnRequestStatus.PendingReview,
      reason: payload.reason,
      customer_comments: payload.customerComments?.trim() || null,
      admin_notes: payload.adminNotes?.trim() || null,
      resolution_notes: null,
      requested_by: this.normalizeUuid(this.authService.currentUserId()),
      requested_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      console.error('[Returns] Error creating return request', {
        payload: insertPayload,
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });
      throw this.toAppError(error.message, 'No fue posible registrar la devolucion.');
    }

    const itemPayloads = normalizedItems.map(item => ({
      return_request_id: data.id,
      order_item_id: item.orderItemId,
      product_id: item.productId,
      product_name_snapshot: item.productNameSnapshot,
      sku_snapshot: item.skuSnapshot,
      quantity: item.quantity,
      received_quantity: 0,
      unit_price_mxn: item.unitPriceMxn,
      subtotal_mxn: this.roundCurrency(item.quantity * item.unitPriceMxn),
      condition_received: ReturnItemCondition.NotReceived,
      resolution: ReturnItemResolution.Pending,
      notes: null,
    }));

    const itemResponse = await this.supabase.client
      .from(this.itemsTableName)
      .insert(itemPayloads);

    if (itemResponse.error) {
      console.error('[Returns] Error creating return request', {
        payload: { request: insertPayload, items: itemPayloads },
        error: itemResponse.error,
        message: itemResponse.error?.message,
        details: itemResponse.error?.details,
        hint: itemResponse.error?.hint,
        code: itemResponse.error?.code,
      });
      throw this.toAppError(itemResponse.error.message, 'No fue posible registrar la devolucion.');
    }

    return this.getReturnRequestById(data.id);
  }

  async updateReturnRequestStatus(id: string, status: ReturnRequestStatus): Promise<ReturnRequest | undefined> {
    const now = new Date().toISOString();
    const userId = this.normalizeUuid(this.authService.currentUserId());
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: now,
    };

    if ([ReturnRequestStatus.Approved, ReturnRequestStatus.Rejected].includes(status)) {
      updatePayload['reviewed_at'] = now;
      updatePayload['reviewed_by'] = userId;
    }

    if (status === ReturnRequestStatus.Closed) {
      updatePayload['closed_at'] = now;
      updatePayload['closed_by'] = userId;
    }

    const { error } = await this.supabase.client
      .from(this.tableName)
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      throw this.toAppError(error.message, 'No fue posible actualizar el estado de la devolucion.');
    }

    return this.getReturnRequestById(id);
  }

  async updateReturnRequestNotes(id: string, notes: { adminNotes?: string; resolutionNotes?: string }): Promise<ReturnRequest | undefined> {
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (notes.adminNotes !== undefined) {
      updatePayload['admin_notes'] = notes.adminNotes.trim() || null;
    }

    if (notes.resolutionNotes !== undefined) {
      updatePayload['resolution_notes'] = notes.resolutionNotes.trim() || null;
    }

    const { error } = await this.supabase.client
      .from(this.tableName)
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      throw this.toAppError(error.message, 'No fue posible actualizar las notas de la devolucion.');
    }

    return this.getReturnRequestById(id);
  }

  async updateReturnRequestItems(id: string, items: UpdateReturnRequestItemPayload[]): Promise<ReturnRequest | undefined> {
    const updates = items.map(item => this.supabase.client
      .from(this.itemsTableName)
      .update({
        received_quantity: Math.max(0, Number(item.receivedQuantity) || 0),
        condition_received: item.conditionReceived,
        resolution: item.resolution,
        notes: item.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
    );

    const responses = await Promise.all(updates);
    const failed = responses.find(response => response.error);
    if (failed?.error) {
      throw this.toAppError(failed.error.message, 'No fue posible actualizar los productos de la devolucion.');
    }

    return this.getReturnRequestById(id);
  }

  async getReturnRequestItems(returnRequestId: string): Promise<any[]> {
    const { data, error } = await this.supabase.client
      .from(this.itemsTableName)
      .select('*')
      .eq('return_request_id', returnRequestId)
      .order('created_at', { ascending: true });

    if (error) {
      throw this.toAppError(error.message, 'No fue posible cargar los productos de la devolucion.');
    }

    return data ?? [];
  }

  async getOriginalOrder(orderId: string): Promise<Order | undefined> {
    return this.orderService.getOrderById(orderId);
  }

  async getClient(clientId: string): Promise<Client | undefined> {
    try {
      return await firstValueFrom(this.clientsService.getClientById(clientId));
    } catch {
      return undefined;
    }
  }

  private async getOrdersMap(orderIds: string[]): Promise<Map<string, Order>> {
    const uniqueIds = [...new Set(orderIds.filter(Boolean))];
    const entries = await Promise.all(uniqueIds.map(async id => {
      const order = await this.getOriginalOrder(id);
      return order ? [id, order] as const : null;
    }));

    return new Map(entries.filter((entry): entry is readonly [string, Order] => !!entry));
  }

  private async getClientsMap(clientIds: string[]): Promise<Map<string, Client>> {
    const uniqueIds = [...new Set(clientIds.filter(Boolean))];
    const entries = await Promise.all(uniqueIds.map(async id => {
      const client = await this.getClient(id);
      return client ? [id, client] as const : null;
    }));

    return new Map(entries.filter((entry): entry is readonly [string, Client] => !!entry));
  }

  private mapReturnRequest(row: any, itemRows: any[], orderMap = new Map<string, Order>(), clientMap = new Map<string, Client>()): ReturnRequest {
    const orderId = String(row.order_id ?? '');
    const clientId = String(row.client_id ?? '');

    return {
      id: String(row.id),
      returnNumber: row.return_number ?? `DEV-${this.getShortId(row.id)}`,
      orderId,
      clientId,
      status: this.normalizeStatus(row.status),
      reason: this.normalizeReason(row.reason),
      customerComments: row.customer_comments ?? '',
      adminNotes: row.admin_notes ?? '',
      resolutionNotes: row.resolution_notes ?? '',
      requestedBy: row.requested_by ?? undefined,
      reviewedBy: row.reviewed_by ?? undefined,
      closedBy: row.closed_by ?? undefined,
      requestedAt: row.requested_at ?? row.created_at ?? new Date().toISOString(),
      reviewedAt: row.reviewed_at ?? undefined,
      closedAt: row.closed_at ?? undefined,
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
      items: itemRows.map(item => this.mapReturnRequestItem(item)),
      order: orderMap.get(orderId),
      client: clientMap.get(clientId),
    };
  }

  private mapReturnRequestItem(row: any): ReturnRequestItem {
    return {
      id: String(row.id),
      returnRequestId: String(row.return_request_id ?? ''),
      orderItemId: String(row.order_item_id ?? ''),
      productId: String(row.product_id ?? ''),
      productNameSnapshot: row.product_name_snapshot ?? 'Producto no disponible',
      skuSnapshot: row.sku_snapshot ?? '',
      quantity: Number(row.quantity ?? 0),
      receivedQuantity: Number(row.received_quantity ?? 0),
      unitPriceMxn: Number(row.unit_price_mxn ?? 0),
      subtotalMxn: Number(row.subtotal_mxn ?? 0),
      conditionReceived: this.normalizeCondition(row.condition_received),
      resolution: this.normalizeResolution(row.resolution),
      notes: row.notes ?? '',
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    };
  }

  private groupItemsByRequestId(rows: any[]): Map<string, any[]> {
    const map = new Map<string, any[]>();
    rows.forEach(row => {
      const requestId = String(row.return_request_id ?? '');
      const current = map.get(requestId) ?? [];
      current.push(row);
      map.set(requestId, current);
    });
    return map;
  }

  private applyFilters(requests: ReturnRequest[], filters?: ReturnRequestFilters): ReturnRequest[] {
    if (!filters) {
      return requests;
    }

    const query = filters.search?.trim().toLowerCase();
    return requests.filter(request => {
      const orderFolio = request.order?.folio ?? '';
      const clientName = request.client?.businessName ?? request.order?.clientNameSnapshot ?? '';
      const matchesQuery = !query || [
        request.returnNumber,
        orderFolio,
        clientName,
      ].some(value => String(value ?? '').toLowerCase().includes(query));
      const matchesStatus = !filters.status || request.status === filters.status;
      const matchesReason = !filters.reason || request.reason === filters.reason;
      return matchesQuery && matchesStatus && matchesReason;
    });
  }

  private async generateNextReturnNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .select('return_number')
      .like('return_number', `DEV-${year}-%`);

    if (error) {
      return `DEV-${year}-0001`;
    }

    const sequence = (data ?? [])
      .map((row: any) => Number(String(row.return_number ?? '').split('-').at(-1)))
      .filter((value: number) => Number.isFinite(value))
      .reduce((max: number, value: number) => Math.max(max, value), 0);

    return `DEV-${year}-${String(sequence + 1).padStart(4, '0')}`;
  }

  private normalizeStatus(value: unknown): ReturnRequestStatus {
    const status = String(value ?? '').trim().toLowerCase();
    return Object.values(ReturnRequestStatus).includes(status as ReturnRequestStatus)
      ? status as ReturnRequestStatus
      : ReturnRequestStatus.PendingReview;
  }

  private normalizeReason(value: unknown): ReturnReasonType {
    const reason = String(value ?? '').trim().toLowerCase();
    return Object.values(ReturnReasonType).includes(reason as ReturnReasonType)
      ? reason as ReturnReasonType
      : ReturnReasonType.Other;
  }

  private normalizeCondition(value: unknown): ReturnItemCondition {
    const condition = String(value ?? '').trim().toLowerCase();
    return Object.values(ReturnItemCondition).includes(condition as ReturnItemCondition)
      ? condition as ReturnItemCondition
      : ReturnItemCondition.NotReceived;
  }

  private normalizeResolution(value: unknown): ReturnItemResolution {
    const resolution = String(value ?? '').trim().toLowerCase();
    return Object.values(ReturnItemResolution).includes(resolution as ReturnItemResolution)
      ? resolution as ReturnItemResolution
      : ReturnItemResolution.Pending;
  }

  private normalizeUuid(value?: string | null): string | null {
    const normalized = String(value ?? '').trim();
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidPattern.test(normalized) ? normalized : null;
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
      return new Error('No tienes permisos para consultar o modificar devoluciones.');
    }

    return new Error(fallback);
  }
}
