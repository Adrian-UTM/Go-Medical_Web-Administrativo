import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';

export type PromotionDiscountType = 'percentage' | 'fixed_amount' | 'promotional_price';
export type PromotionKind = 'normal' | 'special_campaign';
export type PromotionComputedStatus = 'scheduled' | 'active' | 'inactive' | 'expired' | 'cancelled' | string;

export interface ProductPromotionPayload {
  name: string;
  description?: string | null;
  discount_type: PromotionDiscountType;
  discount_value: number;
  currency?: string;
  starts_at: string;
  ends_at: string;
  status?: string;
  internal_notes?: string | null;
  promotion_kind?: PromotionKind;
  campaign_name?: string | null;
  auto_activate?: boolean;
  is_special_campaign?: boolean;
  is_enabled?: boolean;
}

export interface ProductPromotion extends ProductPromotionPayload {
  id: string;
  product_id: string;
  computed_status?: PromotionComputedStatus;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ProductPromotionsSupabaseService {
  private readonly tableName = 'product_promotions';
  private readonly statusViewName = 'product_promotions_with_status';
  private readonly activeViewName = 'active_product_promotions';

  private readonly baseTableColumns = new Set([
    'id',
    'product_id',
    'name',
    'description',
    'discount_type',
    'discount_value',
    'currency',
    'starts_at',
    'ends_at',
    'status',
    'internal_notes',
    'cancelled_at',
    'cancelled_by',
    'cancel_reason',
    'created_by',
    'updated_by',
    'created_at',
    'updated_at',
  ]);
  private readonly optionalTableColumns = [
    'promotion_kind',
    'campaign_name',
    'auto_activate',
    'is_special_campaign',
    'is_enabled',
  ];
  private availableColumnsPromise: Promise<Set<string>> | null = null;

  constructor(private readonly supabase: SupabaseService) {}

  async getPromotions(): Promise<ProductPromotion[]> {
    return this.getPromotionsFromTable();
  }

  async getPromotionByProductId(productId: string): Promise<ProductPromotion | null> {
    const response = await this.supabase.client
      .from(this.tableName)
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (response.error) {
      throw this.toPromotionError(response.error, 'No fue posible consultar la promoción del producto.');
    }

    const row = response.data?.[0];
    return row ? this.mapPromotion(row) : null;
  }

  async getActivePromotionByProductId(productId: string): Promise<ProductPromotion | null> {
    const response = await this.supabase.client
      .from(this.activeViewName)
      .select('*')
      .eq('product_id', productId)
      .limit(1);

    if (!response.error) {
      const row = response.data?.[0];
      return row ? this.mapPromotion(row) : null;
    }

    if (!this.isMissingRelationError(response.error)) {
      throw this.toPromotionError(response.error, 'No fue posible consultar la promoción activa.');
    }

    const promotions = await this.getPromotionsByProductId(productId);
    return promotions.find(promotion => this.getComputedStatus(promotion) === 'active') ?? null;
  }

  async getActivePromotionsByProductIds(productIds: string[]): Promise<ProductPromotion[]> {
    const ids = [...new Set(productIds.filter(Boolean))];
    if (!ids.length) {
      return [];
    }

    const response = await this.supabase.client
      .from(this.activeViewName)
      .select('*')
      .in('product_id', ids);

    if (!response.error) {
      return (response.data ?? []).map(row => this.mapPromotion(row));
    }

    if (!this.isMissingRelationError(response.error)) {
      throw this.toPromotionError(response.error, 'No fue posible cargar las promociones activas.');
    }

    const promotions = await this.getPromotionsByProductIds(ids);
    return promotions.filter(promotion => this.getComputedStatus(promotion) === 'active');
  }

  async getPromotionsByProductId(productId: string): Promise<ProductPromotion[]> {
    return this.getPromotionsByProductIds([productId]);
  }

  async getPromotionsByProductIds(productIds: string[]): Promise<ProductPromotion[]> {
    const ids = [...new Set(productIds.filter(Boolean))];
    if (!ids.length) {
      return [];
    }

    const response = await this.supabase.client
      .from(this.tableName)
      .select('*')
      .in('product_id', ids)
      .order('created_at', { ascending: false });

    if (response.error) {
      throw this.toPromotionError(response.error, 'No fue posible cargar las promociones.');
    }

    return (response.data ?? []).map(row => this.mapPromotion(row));
  }

  async createPromotion(productId: string, payload: ProductPromotionPayload): Promise<ProductPromotion> {
    const insertPayload = await this.filterPayload({
      product_id: productId,
      ...payload,
      currency: payload.currency || 'MXN',
      status: payload.status || (payload.is_enabled === false ? 'disabled' : 'enabled'),
    });

    const response = await this.supabase.client
      .from(this.tableName)
      .insert(insertPayload)
      .select()
      .single();

    if (response.error) {
      throw this.toPromotionError(response.error, 'No fue posible guardar la promoción.');
    }

    return this.mapPromotion(response.data);
  }

  async updatePromotion(promotionId: string, payload: ProductPromotionPayload): Promise<ProductPromotion> {
    const updatePayload = await this.filterPayload({ ...payload });

    const response = await this.supabase.client
      .from(this.tableName)
      .update(updatePayload)
      .eq('id', promotionId)
      .select()
      .single();

    if (response.error) {
      throw this.toPromotionError(response.error, 'No fue posible actualizar la promoción.');
    }

    return this.mapPromotion(response.data);
  }

  async cancelPromotion(promotionId: string, reason?: string): Promise<ProductPromotion | null> {
    const rpcResponse = await this.supabase.client.rpc('cancel_product_promotion', {
      promotion_id: promotionId,
      reason: reason || null,
    });

    if (!rpcResponse.error) {
      return this.getPromotionById(promotionId);
    }

    const fallbackPayload = await this.filterPayload({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason || null,
      is_enabled: false,
    });

    const response = await this.supabase.client
      .from(this.tableName)
      .update(fallbackPayload)
      .eq('id', promotionId)
      .select()
      .single();

    if (response.error) {
      throw this.toPromotionError(response.error, 'No fue posible cancelar la promoción.');
    }

    return this.mapPromotion(response.data);
  }

  async setPromotionEnabled(promotionId: string, enabled: boolean): Promise<ProductPromotion> {
    const payload = await this.filterPayload({
      status: enabled ? 'enabled' : 'disabled',
      is_enabled: enabled,
    });

    const response = await this.supabase.client
      .from(this.tableName)
      .update(payload)
      .eq('id', promotionId)
      .select()
      .single();

    if (response.error) {
      throw this.toPromotionError(response.error, enabled ? 'No fue posible activar la promoción.' : 'No fue posible desactivar la promoción.');
    }

    return this.mapPromotion(response.data);
  }

  calculatePromotionalPrice(originalPrice: number, discountType: PromotionDiscountType, discountValue: number): number {
    const price = Number(originalPrice) || 0;
    const value = Number(discountValue) || 0;

    if (discountType === 'percentage') {
      return Math.max(0, price - price * (value / 100));
    }

    if (discountType === 'fixed_amount') {
      return Math.max(0, price - value);
    }

    return Math.max(0, value);
  }

  getComputedStatus(promotion: ProductPromotion): PromotionComputedStatus {
    if (promotion.computed_status) {
      return promotion.computed_status;
    }

    if (promotion.status === 'cancelled') {
      return 'cancelled';
    }

    if (promotion.is_enabled === false || promotion.status === 'disabled' || promotion.status === 'inactive') {
      return 'inactive';
    }

    const now = Date.now();
    const startsAt = new Date(promotion.starts_at).getTime();
    const endsAt = new Date(promotion.ends_at).getTime();

    if (Number.isFinite(startsAt) && now < startsAt) {
      return 'scheduled';
    }

    if (Number.isFinite(endsAt) && now > endsAt) {
      return 'expired';
    }

    return 'active';
  }

  private async getPromotionById(promotionId: string): Promise<ProductPromotion | null> {
    const response = await this.supabase.client
      .from(this.tableName)
      .select('*')
      .eq('id', promotionId)
      .single();

    if (response.error) {
      return null;
    }

    return this.mapPromotion(response.data);
  }

  private async getPromotionsFromTable(): Promise<ProductPromotion[]> {
    const response = await this.supabase.client
      .from(this.tableName)
      .select('*')
      .order('created_at', { ascending: false });

    if (response.error) {
      throw this.toPromotionError(response.error, 'No fue posible cargar las promociones.');
    }

    return (response.data ?? []).map(row => this.mapPromotion(row));
  }

  private async filterPayload(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const tableColumns = await this.getAvailableColumns();
    return Object.fromEntries(
      Object.entries(payload).filter(([key, value]) => tableColumns.has(key) && value !== undefined)
    );
  }

  private mapPromotion(row: any): ProductPromotion {
    return {
      id: row.id,
      product_id: row.product_id,
      name: row.name ?? 'Promoción',
      description: row.description ?? null,
      discount_type: row.discount_type,
      discount_value: Number(row.discount_value ?? 0),
      currency: row.currency ?? 'MXN',
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      status: row.status ?? 'enabled',
      internal_notes: row.internal_notes ?? null,
      promotion_kind: row.promotion_kind ?? (row.is_special_campaign ? 'special_campaign' : 'normal'),
      campaign_name: row.campaign_name ?? null,
      auto_activate: row.auto_activate ?? true,
      is_special_campaign: row.is_special_campaign ?? false,
      is_enabled: row.is_enabled ?? (row.status !== 'disabled' && row.status !== 'inactive' && row.status !== 'cancelled'),
      computed_status: row.computed_status,
      cancelled_at: row.cancelled_at ?? null,
      cancelled_by: row.cancelled_by ?? null,
      cancel_reason: row.cancel_reason ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private isMissingRelationError(error: any): boolean {
    const message = String(error?.message ?? '').toLowerCase();
    const code = String(error?.code ?? '');
    return code === '42P01' || code === 'PGRST205' || message.includes('could not find') || message.includes('does not exist');
  }

  private async getAvailableColumns(): Promise<Set<string>> {
    if (!this.availableColumnsPromise) {
      this.availableColumnsPromise = this.resolveAvailableColumns();
    }

    return this.availableColumnsPromise;
  }

  private async resolveAvailableColumns(): Promise<Set<string>> {
    const columns = new Set(this.baseTableColumns);

    await Promise.all(this.optionalTableColumns.map(async column => {
      const response = await this.supabase.client
        .from(this.tableName)
        .select(column)
        .limit(1);

      if (!response.error) {
        columns.add(column);
      }
    }));

    return columns;
  }

  private toPromotionError(error: any, fallback: string): Error {
    console.error('[Products Promotions] Supabase error', {
      error,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      code: error?.code,
    });

    const message = String(error?.message ?? '').toLowerCase();
    const details = String(error?.details ?? '').toLowerCase();
    const code = String(error?.code ?? '');
    const combined = `${message} ${details}`;

    if (this.isMissingRelationError(error)) {
      return new Error('La tabla de promociones no está disponible. Falta ejecutar el script SQL de promociones.');
    }

    if (code === '42703' || combined.includes('column')) {
      return new Error('El esquema de promociones no coincide con la aplicación. Revisa las columnas configuradas.');
    }

    if (combined.includes('permission') || combined.includes('policy') || combined.includes('rls')) {
      return new Error('No tienes permisos para administrar promociones.');
    }

    if (combined.includes('overlap') || combined.includes('traslap')) {
      return new Error('Ya existe una promoción traslapada para este producto.');
    }

    if (combined.includes('date') || combined.includes('timestamp')) {
      return new Error('Las fechas de la promoción no son válidas.');
    }

    return new Error(fallback);
  }
}
