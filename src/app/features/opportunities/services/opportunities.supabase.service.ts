import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ProductCategory } from '../../../models/product.model';
import {
  Opportunity,
  OpportunityActionType,
  OpportunityCartStatus,
  OpportunityContact,
  OpportunityFilters,
  OpportunityFollowUp,
  OpportunityItem,
  OpportunityStatus,
} from '../models/opportunity.model';

@Injectable({ providedIn: 'root' })
export class OpportunitiesSupabaseService {
  private readonly candidateTables = ['abandoned_cart_opportunities', 'opportunities', 'carts'];
  private readonly itemsTable = 'cart_items';
  private resolvedTable: string | null | undefined;

  constructor(private readonly supabase: SupabaseService) {}

  async getOpportunities(filters?: OpportunityFilters): Promise<Opportunity[]> {
    const table = await this.resolveSourceTable();
    if (!table) {
      return [];
    }

    const rows = await this.fetchRows(table);
    const itemsByParent = await this.loadItemsMap(table, rows.map(row => String(row.id)));
    let opportunities = rows.map(row => this.mapOpportunity(row, table, itemsByParent.get(String(row.id)) ?? []));

    if (filters?.search?.trim()) {
      const query = filters.search.trim().toLowerCase();
      opportunities = opportunities.filter(opportunity =>
        opportunity.folio.toLowerCase().includes(query) ||
        opportunity.contact.displayName.toLowerCase().includes(query) ||
        opportunity.contact.companyName.toLowerCase().includes(query) ||
        opportunity.items.some(item => item.productName.toLowerCase().includes(query) || item.sku.toLowerCase().includes(query))
      );
    }

    if (filters?.cartStatus) {
      opportunities = opportunities.filter(opportunity => opportunity.cartStatus === filters.cartStatus);
    }

    if (filters?.opportunityStatus) {
      opportunities = opportunities.filter(opportunity => opportunity.opportunityStatus === filters.opportunityStatus);
    }

    if (filters?.assignedTo?.trim()) {
      const assignedTo = filters.assignedTo.trim().toLowerCase();
      opportunities = opportunities.filter(opportunity => opportunity.assignedTo.toLowerCase().includes(assignedTo));
    }

    return opportunities.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
  }

  async getOpportunityById(id: string): Promise<Opportunity | undefined> {
    const table = await this.resolveSourceTable();
    if (!table) {
      return undefined;
    }

    const response = await this.supabase.client
      .from(table)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (response.error) {
      if (this.isMissingTableError(response.error)) {
        return undefined;
      }

      throw this.toAppError(response.error.message, 'No fue posible cargar la oportunidad solicitada.');
    }

    if (!response.data) {
      return undefined;
    }

    const itemsByParent = await this.loadItemsMap(table, [String(response.data.id)]);
    return this.mapOpportunity(response.data, table, itemsByParent.get(String(response.data.id)) ?? []);
  }

  async markAsContacted(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunity(id, OpportunityStatus.Contacted, OpportunityCartStatus.Recovered, OpportunityActionType.Contacted, 'Cliente contactado');
  }

  async markAsInterested(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunity(id, OpportunityStatus.Interested, OpportunityCartStatus.Recovered, OpportunityActionType.Interested, 'Cliente interesado');
  }

  async markAsNoResponse(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunity(id, OpportunityStatus.NoResponse, OpportunityCartStatus.Abandoned, OpportunityActionType.NoResponse, 'Sin respuesta');
  }

  async convertToOrder(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunity(id, OpportunityStatus.ConvertedToOrder, OpportunityCartStatus.Converted, OpportunityActionType.ConvertedToOrder, 'Convertida a pedido');
  }

  async convertToQuote(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunity(id, OpportunityStatus.ConvertedToQuote, OpportunityCartStatus.Converted, OpportunityActionType.ConvertedToQuote, 'Convertida a cotización');
  }

  async closeOpportunity(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunity(id, OpportunityStatus.Closed, OpportunityCartStatus.Closed, OpportunityActionType.Closed, 'Oportunidad cerrada');
  }

  private async resolveSourceTable(): Promise<string | null> {
    if (this.resolvedTable !== undefined) {
      return this.resolvedTable;
    }

    for (const table of this.candidateTables) {
      const response = await this.supabase.client.from(table).select('*').limit(1);
      if (!response.error) {
        this.resolvedTable = table;
        return table;
      }

      if (!this.isMissingTableError(response.error)) {
        throw this.toAppError(response.error.message, 'No fue posible cargar las oportunidades comerciales.');
      }
    }

    this.resolvedTable = null;
    return null;
  }

  private async fetchRows(table: string): Promise<any[]> {
    const response = await this.supabase.client
      .from(table)
      .select('*')
      .order('updated_at', { ascending: false });

    if (response.error) {
      if (this.isMissingTableError(response.error)) {
        return [];
      }

      throw this.toAppError(response.error.message, 'No fue posible cargar las oportunidades comerciales.');
    }

    return response.data ?? [];
  }

  private async loadItemsMap(table: string, parentIds: string[]): Promise<Map<string, OpportunityItem[]>> {
    const map = new Map<string, OpportunityItem[]>();
    if (!parentIds.length) {
      return map;
    }

    if (table !== 'carts') {
      return map;
    }

    const response = await this.supabase.client
      .from(this.itemsTable)
      .select('*')
      .in('cart_id', parentIds);

    if (response.error) {
      if (this.isMissingTableError(response.error) || this.isMissingColumnError(response.error)) {
        return map;
      }

      throw this.toAppError(response.error.message, 'No fue posible cargar los productos de las oportunidades.');
    }

    for (const row of response.data ?? []) {
      const parentId = String(row.cart_id ?? row.opportunity_id ?? '');
      if (!parentId) {
        continue;
      }

      const current = map.get(parentId) ?? [];
      current.push(this.mapItem(row));
      map.set(parentId, current);
    }

    return map;
  }

  private mapOpportunity(row: any, table: string, tableItems: OpportunityItem[]): Opportunity {
    const inlineItems = this.extractInlineItems(row);
    const items = inlineItems.length > 0 ? inlineItems : tableItems;
    const estimatedSubtotal = this.resolveNumber(row.estimated_subtotal, row.subtotal, items.reduce((sum, item) => sum + item.estimatedLineTotal, 0));
    const estimatedTotal = this.resolveNumber(row.estimated_total, row.total, estimatedSubtotal);
    const lastActivityAt = this.firstNonEmpty(row.last_activity_at, row.updated_at, row.abandoned_at, row.created_at, new Date().toISOString());
    const abandonedAt = this.firstNonEmpty(row.abandoned_at, lastActivityAt);
    const cartStatus = this.resolveCartStatus(row, table);
    const opportunityStatus = this.resolveOpportunityStatus(row, cartStatus);

    return {
      id: String(row.id),
      folio: this.firstNonEmpty(row.folio, row.opportunity_number, row.cart_number, row.reference, `OP-${this.getShortId(row.id)}`),
      cartStatus,
      opportunityStatus,
      contact: this.mapContact(row),
      items,
      estimatedSubtotal,
      estimatedTotal,
      lastActivityAt,
      abandonedAt,
      assignedTo: this.firstNonEmpty(row.assigned_to_name, row.assigned_to, row.owner_name, row.responsible_name, 'Sin responsable'),
      commercialNotes: this.firstNonEmpty(row.commercial_notes, row.notes, row.description, ''),
      followUps: this.mapFollowUps(row.follow_ups ?? row.history),
      createdAt: this.firstNonEmpty(row.created_at, lastActivityAt),
      updatedAt: this.firstNonEmpty(row.updated_at, lastActivityAt),
    };
  }

  private mapContact(row: any): OpportunityContact {
    return {
      clientId: row.client_id ?? row.contact_id ?? undefined,
      isProspect: !!(row.is_prospect ?? row.prospect ?? false),
      displayName: this.firstNonEmpty(row.contact_name, row.display_name, row.client_name, row.customer_name, row.client_name_snapshot, 'Contacto no disponible'),
      companyName: this.firstNonEmpty(row.company_name, row.business_name, row.client_name_snapshot, row.client_name, row.customer_name, 'Sin nombre comercial'),
      email: this.firstNonEmpty(row.contact_email, row.email, row.customer_email, ''),
      phone: this.firstNonEmpty(row.contact_phone, row.phone, row.customer_phone, ''),
      city: this.firstNonEmpty(row.city, row.contact_city, undefined),
      state: this.firstNonEmpty(row.state, row.contact_state, undefined),
    };
  }

  private extractInlineItems(row: any): OpportunityItem[] {
    const candidates = [row.items, row.cart_items, row.products, row.product_items];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.map(item => this.mapItem(item));
      }
    }

    return [];
  }

  private mapItem(row: any): OpportunityItem {
    const quantity = Number(row.quantity ?? row.qty ?? 0);
    const unitPrice = this.resolveNumber(row.unit_price, row.unitPrice, row.price, 0);
    return {
      productId: String(row.product_id ?? row.productId ?? row.id ?? ''),
      sku: this.firstNonEmpty(row.sku, row.product_sku, 'Sin SKU'),
      productName: this.firstNonEmpty(row.product_name, row.productName, row.name, 'Producto no disponible'),
      productCategory: (this.firstNonEmpty(row.product_category, row.category, ProductCategory.Consumible) as ProductCategory),
      quantity,
      unitPrice,
      estimatedLineTotal: this.resolveNumber(row.estimated_line_total, row.total_line_price, row.line_total, quantity * unitPrice),
    };
  }

  private mapFollowUps(source: any): OpportunityFollowUp[] {
    if (!Array.isArray(source)) {
      return [];
    }

    return source.map((item: any, index: number) => ({
      id: String(item?.id ?? `follow-up-${index}`),
      actionType: this.resolveActionType(item?.action_type ?? item?.status),
      title: this.firstNonEmpty(item?.title, item?.label, 'Seguimiento registrado'),
      note: this.firstNonEmpty(item?.note, item?.comment, item?.message, 'Actualización registrada.'),
      createdAt: this.firstNonEmpty(item?.created_at, item?.date, new Date().toISOString()),
      createdBy: this.firstNonEmpty(item?.created_by, item?.author_name, item?.authorName, 'Sistema'),
    }));
  }

  private resolveCartStatus(row: any, table: string): OpportunityCartStatus {
    const value = String(row.cart_status ?? '').toLowerCase();
    if (Object.values(OpportunityCartStatus).includes(value as OpportunityCartStatus)) {
      return value as OpportunityCartStatus;
    }

    const status = String(row.status ?? '').toLowerCase();
    if (Object.values(OpportunityCartStatus).includes(status as OpportunityCartStatus)) {
      return status as OpportunityCartStatus;
    }

    if (status === 'converted_to_order' || status === 'converted_to_quote' || row.converted_at) {
      return OpportunityCartStatus.Converted;
    }

    if (row.closed_at || status === 'closed') {
      return OpportunityCartStatus.Closed;
    }

    if (table === 'carts' && (status === 'abandoned' || row.abandoned_at)) {
      return OpportunityCartStatus.Abandoned;
    }

    if (row.abandoned_at) {
      return OpportunityCartStatus.Abandoned;
    }

    return OpportunityCartStatus.Active;
  }

  private resolveOpportunityStatus(row: any, cartStatus: OpportunityCartStatus): OpportunityStatus {
    const value = String(row.opportunity_status ?? '').toLowerCase();
    if (Object.values(OpportunityStatus).includes(value as OpportunityStatus)) {
      return value as OpportunityStatus;
    }

    const status = String(row.status ?? '').toLowerCase();
    if (Object.values(OpportunityStatus).includes(status as OpportunityStatus)) {
      return status as OpportunityStatus;
    }

    if (cartStatus === OpportunityCartStatus.Converted) {
      return OpportunityStatus.ConvertedToOrder;
    }

    if (cartStatus === OpportunityCartStatus.Closed) {
      return OpportunityStatus.Closed;
    }

    return OpportunityStatus.New;
  }

  private resolveActionType(value: unknown): OpportunityActionType {
    const normalized = String(value ?? '').toLowerCase();
    if (Object.values(OpportunityActionType).includes(normalized as OpportunityActionType)) {
      return normalized as OpportunityActionType;
    }

    return OpportunityActionType.Note;
  }

  private async updateOpportunity(
    id: string,
    opportunityStatus: OpportunityStatus,
    cartStatus: OpportunityCartStatus,
    actionType: OpportunityActionType,
    title: string,
  ): Promise<Opportunity | undefined> {
    const table = await this.resolveSourceTable();
    if (!table) {
      return undefined;
    }

    const currentResponse = await this.supabase.client
      .from(table)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (currentResponse.error) {
      throw this.toAppError(currentResponse.error.message, 'No fue posible actualizar la oportunidad.');
    }

    if (!currentResponse.data) {
      return undefined;
    }

    const payload = this.buildUpdatePayload(currentResponse.data, table, opportunityStatus, cartStatus, actionType, title);
    if (Object.keys(payload).length === 0) {
      return undefined;
    }

    const response = await this.supabase.client
      .from(table)
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (response.error) {
      throw this.toAppError(response.error.message, 'No fue posible actualizar la oportunidad.');
    }

    const itemsByParent = await this.loadItemsMap(table, [String(response.data.id)]);
    return this.mapOpportunity(response.data, table, itemsByParent.get(String(response.data.id)) ?? []);
  }

  private buildUpdatePayload(
    current: any,
    table: string,
    opportunityStatus: OpportunityStatus,
    cartStatus: OpportunityCartStatus,
    actionType: OpportunityActionType,
    title: string,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    const now = new Date().toISOString();

    if (Object.prototype.hasOwnProperty.call(current, 'opportunity_status')) {
      payload['opportunity_status'] = opportunityStatus;
    }

    if (Object.prototype.hasOwnProperty.call(current, 'cart_status')) {
      payload['cart_status'] = cartStatus;
    } else if (Object.prototype.hasOwnProperty.call(current, 'status')) {
      const currentStatus = String(current.status ?? '').toLowerCase();
      const shouldUseCartStatus = table === 'carts' || Object.values(OpportunityCartStatus).includes(currentStatus as OpportunityCartStatus);
      payload['status'] = shouldUseCartStatus ? cartStatus : opportunityStatus;
    }

    if (Object.prototype.hasOwnProperty.call(current, 'updated_at')) {
      payload['updated_at'] = now;
    }

    if (Object.prototype.hasOwnProperty.call(current, 'last_activity_at')) {
      payload['last_activity_at'] = now;
    }

    if (Object.prototype.hasOwnProperty.call(current, 'follow_ups')) {
      const currentFollowUps = Array.isArray(current.follow_ups) ? [...current.follow_ups] : [];
      currentFollowUps.unshift({
        id: `follow-up-${Date.now()}`,
        action_type: actionType,
        title,
        note: `${title}.`,
        created_at: now,
        created_by: 'Equipo comercial',
      });
      payload['follow_ups'] = currentFollowUps;
    } else if (Object.prototype.hasOwnProperty.call(current, 'history')) {
      const currentHistory = Array.isArray(current.history) ? [...current.history] : [];
      currentHistory.unshift({
        id: `history-${Date.now()}`,
        status: opportunityStatus,
        title,
        comment: `${title}.`,
        created_at: now,
        created_by: 'Equipo comercial',
      });
      payload['history'] = currentHistory;
    }

    return payload;
  }

  private resolveNumber(...values: unknown[]): number {
    for (const value of values) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return Math.round((numeric + Number.EPSILON) * 100) / 100;
      }
    }

    return 0;
  }

  private firstNonEmpty<T>(...values: Array<T | undefined | null | ''>): T {
    for (const value of values) {
      if (value !== undefined && value !== null && value !== '') {
        return value as T;
      }
    }

    return '' as T;
  }

  private getShortId(value: unknown): string {
    return String(value ?? '').replace(/-/g, '').slice(0, 8).toUpperCase() || '0000';
  }

  private isMissingTableError(error: { message?: string | null; code?: string | null }): boolean {
    const code = String(error.code ?? '');
    const message = String(error.message ?? '').toLowerCase();
    return code === '42P01' || code === 'PGRST205' || message.includes('does not exist') || message.includes('could not find the table');
  }

  private isMissingColumnError(error: { message?: string | null; code?: string | null }): boolean {
    const code = String(error.code ?? '');
    const message = String(error.message ?? '').toLowerCase();
    return code === '42703' || message.includes('column') && message.includes('does not exist');
  }

  private toAppError(message: string, fallback: string): Error {
    const lowered = String(message ?? '').toLowerCase();
    if (lowered.includes('permission') || lowered.includes('rls') || lowered.includes('policy')) {
      return new Error('No tienes permisos para consultar oportunidades comerciales.');
    }

    return new Error(fallback);
  }
}

