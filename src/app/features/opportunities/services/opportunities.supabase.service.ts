import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
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
  constructor(
    private readonly supabase: SupabaseService,
    private readonly authService: AuthService
  ) {}

  async getOpportunities(filters?: OpportunityFilters): Promise<Opportunity[]> {
    const table = 'carts';

    const response = await this.supabase.client
      .from(table)
      .select(`
        *,
        client:clients!carts_client_id_fkey (
          id,
          business_name,
          trade_name,
          rfc,
          contact_name,
          email,
          phone,
          client_type,
          created_at,
          profiles (
            id,
            full_name,
            email,
            phone,
            role
          )
        ),
        assigned_user:profiles!carts_assigned_to_fkey (
          id,
          full_name
        ),
        cart_followups (
          id,
          contact_channel,
          status,
          comment,
          created_at,
          created_by,
          profiles (
            full_name
          )
        ),
        cart_items (
          id,
          quantity,
          unit_price,
          total_line_price,
          sku_snapshot,
          product_name_snapshot,
          product_category_snapshot,
          product:products (
            id,
            name,
            sku,
            category,
            is_active,
            media:product_media (
              file_path,
              is_primary
            )
          )
        )
      `)
      .eq('source', 'mobile_app')
      .order('last_activity_at', { ascending: false });

    if (response.error) {
      throw this.toAppError(response.error.message, 'No fue posible cargar las oportunidades comerciales.');
    }

    let rows = response.data ?? [];

    // Apply strict filters in memory
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    rows = rows.filter(row => {
      // 1. Must have a client associated
      if (!row.client) {
        return false;
      }

      // 2. Client must not be an internal user (admin, staff, technician)
      const profiles = row.client.profiles || [];
      const hasInternalRole = profiles.some((p: any) => ['admin', 'staff', 'technician'].includes(p.role));
      if (hasInternalRole) {
        return false;
      }

      // 3. Must have at least 1 item
      const items = row.cart_items || [];
      if (items.length === 0) {
        return false;
      }

      // 4. Must not be converted or closed
      if (row.converted_order_id || row.converted_quote_id) {
        return false;
      }
      const cartStatus = String(row.status ?? '').toLowerCase();
      if (['converted_to_order', 'converted_to_quote', 'closed', 'converted'].includes(cartStatus)) {
        return false;
      }

      // 5. Inactivity of at least 5 minutes
      const lastActivity = new Date(row.last_activity_at || row.updated_at || row.created_at);
      if (lastActivity > fiveMinutesAgo) {
        return false;
      }

      return true;
    });

    let opportunities = rows.map(row => this.mapOpportunityFromJoin(row));

    // Client-side search and filters
    if (filters?.search?.trim()) {
      const query = filters.search.trim().toLowerCase();
      opportunities = opportunities.filter(opportunity =>
        opportunity.folio.toLowerCase().includes(query) ||
        opportunity.contact.displayName.toLowerCase().includes(query) ||
        opportunity.contact.companyName.toLowerCase().includes(query) ||
        opportunity.contact.email.toLowerCase().includes(query) ||
        opportunity.contact.phone.toLowerCase().includes(query) ||
        opportunity.items.some(item => 
          item.productName.toLowerCase().includes(query) || 
          item.sku.toLowerCase().includes(query)
        )
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

    return opportunities;
  }

  async getOpportunityById(id: string): Promise<Opportunity | undefined> {
    const table = 'carts';

    const response = await this.supabase.client
      .from(table)
      .select(`
        *,
        client:clients!carts_client_id_fkey (
          id,
          business_name,
          trade_name,
          rfc,
          contact_name,
          email,
          phone,
          client_type,
          created_at,
          profiles (
            id,
            full_name,
            email,
            phone,
            role
          )
        ),
        assigned_user:profiles!carts_assigned_to_fkey (
          id,
          full_name
        ),
        cart_followups (
          id,
          contact_channel,
          status,
          comment,
          created_at,
          created_by,
          profiles (
            full_name
          )
        ),
        cart_items (
          id,
          quantity,
          unit_price,
          total_line_price,
          sku_snapshot,
          product_name_snapshot,
          product_category_snapshot,
          product:products (
            id,
            name,
            sku,
            category,
            is_active,
            media:product_media (
              file_path,
              is_primary
            )
          )
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (response.error) {
      throw this.toAppError(response.error.message, 'No fue posible cargar la oportunidad solicitada.');
    }

    if (!response.data) {
      return undefined;
    }

    return this.mapOpportunityFromJoin(response.data);
  }

  async markAsContacted(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunityState(id, OpportunityStatus.Contacted, OpportunityCartStatus.Abandoned, 'other', 'Cliente contactado comercialmente');
  }

  async markAsInterested(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunityState(id, OpportunityStatus.Interested, OpportunityCartStatus.Abandoned, 'other', 'Cliente interesado en los productos');
  }

  async markAsNoResponse(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunityState(id, OpportunityStatus.NoResponse, OpportunityCartStatus.Abandoned, 'other', 'Cliente contactado pero sin respuesta');
  }

  async convertToOrder(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunityState(id, OpportunityStatus.ConvertedToOrder, OpportunityCartStatus.Converted, 'other', 'Carrito convertido a pedido');
  }

  async convertToQuote(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunityState(id, OpportunityStatus.ConvertedToQuote, OpportunityCartStatus.Converted, 'other', 'Carrito convertido a cotización');
  }

  async closeOpportunity(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunityState(id, OpportunityStatus.Closed, OpportunityCartStatus.Closed, 'other', 'Oportunidad comercial cerrada');
  }

  async addCustomFollowUp(
    id: string,
    opportunityStatus: OpportunityStatus,
    contactChannel: 'whatsapp' | 'phone' | 'email' | 'in_person' | 'other',
    comment: string
  ): Promise<Opportunity | undefined> {
    let cartStatus = OpportunityCartStatus.Abandoned;
    if (opportunityStatus === OpportunityStatus.ConvertedToOrder || opportunityStatus === OpportunityStatus.ConvertedToQuote) {
      cartStatus = OpportunityCartStatus.Converted;
    } else if (opportunityStatus === OpportunityStatus.Closed) {
      cartStatus = OpportunityCartStatus.Closed;
    }
    
    return this.updateOpportunityState(id, opportunityStatus, cartStatus, contactChannel, comment);
  }

  private async updateOpportunityState(
    id: string,
    opportunityStatus: OpportunityStatus,
    cartStatus: OpportunityCartStatus,
    contactChannel: 'whatsapp' | 'phone' | 'email' | 'in_person' | 'other',
    comment: string
  ): Promise<Opportunity | undefined> {
    const currentUserId = this.authService.currentUserId();
    const now = new Date().toISOString();

    // Map Angular OpportunityStatus to DB opportunity_status enum
    let dbOpportunityStatus = opportunityStatus as string;
    if (opportunityStatus === OpportunityStatus.ConvertedToOrder || opportunityStatus === OpportunityStatus.ConvertedToQuote) {
      dbOpportunityStatus = 'converted';
    }

    // Map Angular OpportunityCartStatus / Status to DB cart_status enum
    let dbCartStatus = cartStatus as string;
    if (opportunityStatus === OpportunityStatus.ConvertedToOrder) {
      dbCartStatus = 'converted_to_order';
    } else if (opportunityStatus === OpportunityStatus.ConvertedToQuote) {
      dbCartStatus = 'converted_to_quote';
    }

    // 1. Update carts table
    const cartUpdate: any = {
      opportunity_status: dbOpportunityStatus,
      status: dbCartStatus,
      last_activity_at: now,
      updated_at: now
    };

    const cartResponse = await this.supabase.client
      .from('carts')
      .update(cartUpdate)
      .eq('id', id);

    if (cartResponse.error) {
      throw this.toAppError(cartResponse.error.message, 'No fue posible actualizar el estado de la oportunidad.');
    }

    // 2. Insert into cart_followups table
    const followUpInsert = {
      cart_id: id,
      contact_channel: contactChannel,
      status: dbOpportunityStatus,
      comment: comment,
      created_by: currentUserId || null
    };

    const followUpResponse = await this.supabase.client
      .from('cart_followups')
      .insert(followUpInsert);

    if (followUpResponse.error) {
      throw this.toAppError(followUpResponse.error.message, 'No fue posible registrar la nota de seguimiento.');
    }

    // 3. Return the fully refreshed opportunity
    return this.getOpportunityById(id);
  }

  private mapOpportunityFromJoin(row: any): Opportunity {
    const items: OpportunityItem[] = (row.cart_items || []).map((item: any) => {
      const quantity = Number(item.quantity ?? 0);
      const unitPrice = Number(item.unit_price ?? 0);
      const productMedia = item.product?.media || [];
      const primaryMedia = productMedia.find((m: any) => m.is_primary) || productMedia[0];
      const imageUrl = primaryMedia ? primaryMedia.file_path : undefined;

      return {
        productId: String(item.product_id ?? ''),
        sku: item.sku_snapshot || item.product?.sku || 'Sin SKU',
        productName: item.product_name_snapshot || item.product?.name || 'Producto no disponible',
        productCategory: (item.product_category_snapshot || item.product?.category || ProductCategory.Consumible) as ProductCategory,
        quantity,
        unitPrice,
        estimatedLineTotal: Number(item.total_line_price ?? (quantity * unitPrice)),
        imageUrl
      };
    });

    const estimatedSubtotal = Number(row.subtotal ?? items.reduce((sum: number, item: OpportunityItem) => sum + item.estimatedLineTotal, 0));
    const estimatedTotal = Number(row.total ?? estimatedSubtotal);
    const lastActivityAt = row.last_activity_at || row.updated_at || row.created_at || new Date().toISOString();
    const abandonedAt = row.last_activity_at || lastActivityAt;
    const cartStatus = this.resolveCartStatus(row, 'carts');
    const opportunityStatus = this.resolveOpportunityStatus(row, cartStatus);

    const client = row.client || {};
    const profiles = client.profiles || [];
    const clientProfile = profiles.find((p: any) => p.role === 'client') || profiles[0] || {};

    const displayName = row.lead_name || client.contact_name || clientProfile.full_name || client.business_name || 'Contacto no disponible';
    const companyName = client.trade_name || client.business_name || 'Sin nombre comercial';
    const email = row.lead_email || client.email || clientProfile.email || '';
    const phone = row.lead_phone || client.phone || clientProfile.phone || '';

    const contact: OpportunityContact = {
      clientId: client.id || undefined,
      isProspect: false,
      displayName,
      companyName,
      email,
      phone,
      city: client.city || undefined,
      state: client.state || undefined
    };

    const followUps = (row.cart_followups || [])
      .map((fu: any) => {
        const creatorName = fu.profiles?.full_name || 'Sistema';
        
        let actionType = OpportunityActionType.Note;
        const dbStatus = String(fu.status ?? '').toLowerCase();
        if (dbStatus === 'contacted') actionType = OpportunityActionType.Contacted;
        else if (dbStatus === 'interested') actionType = OpportunityActionType.Interested;
        else if (dbStatus === 'no_response') actionType = OpportunityActionType.NoResponse;
        else if (dbStatus === 'converted') actionType = OpportunityActionType.ConvertedToOrder;
        else if (dbStatus === 'closed') actionType = OpportunityActionType.Closed;

        const channelLabelMap: Record<string, string> = {
          whatsapp: 'WhatsApp',
          phone: 'Teléfono',
          email: 'Correo',
          in_person: 'En persona',
          other: 'Otro'
        };
        const channelLabel = channelLabelMap[fu.contact_channel] || 'Contacto';
        const title = `Seguimiento por ${channelLabel}`;

        return {
          id: String(fu.id),
          actionType,
          title,
          note: fu.comment || 'Actualización registrada.',
          createdAt: fu.created_at,
          createdBy: creatorName,
          contactChannel: fu.contact_channel
        };
      })
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      id: String(row.id),
      folio: `OP-${this.getShortId(row.id)}`,
      cartStatus,
      opportunityStatus,
      contact,
      items,
      estimatedSubtotal,
      estimatedTotal,
      lastActivityAt,
      abandonedAt,
      assignedTo: row.assigned_user?.full_name || 'Sin responsable',
      commercialNotes: row.notes || '',
      followUps,
      createdAt: row.created_at || lastActivityAt,
      updatedAt: row.updated_at || lastActivityAt
    };
  }

  private resolveCartStatus(row: any, table: string): OpportunityCartStatus {
    const status = String(row.status ?? '').toLowerCase();
    
    if (status === 'converted_to_order' || status === 'converted_to_quote' || status === 'converted') {
      return OpportunityCartStatus.Converted;
    }
    if (status === 'closed') {
      return OpportunityCartStatus.Closed;
    }
    if (status === 'abandoned') {
      return OpportunityCartStatus.Abandoned;
    }
    return OpportunityCartStatus.Active;
  }

  private resolveOpportunityStatus(row: any, cartStatus: OpportunityCartStatus): OpportunityStatus {
    const status = String(row.opportunity_status ?? '').toLowerCase();
    
    if (status === 'converted') {
      const dbStatus = String(row.status ?? '').toLowerCase();
      if (dbStatus === 'converted_to_quote') {
        return OpportunityStatus.ConvertedToQuote;
      }
      return OpportunityStatus.ConvertedToOrder;
    }
    
    if (status === 'contacted') return OpportunityStatus.Contacted;
    if (status === 'interested') return OpportunityStatus.Interested;
    if (status === 'no_response') return OpportunityStatus.NoResponse;
    if (status === 'closed') return OpportunityStatus.Closed;

    return OpportunityStatus.New;
  }

  private getShortId(value: unknown): string {
    return String(value ?? '').replace(/-/g, '').slice(0, 8).toUpperCase() || '0000';
  }

  private toAppError(message: string, fallback: string): Error {
    const lowered = String(message ?? '').toLowerCase();
    if (lowered.includes('permission') || lowered.includes('rls') || lowered.includes('policy')) {
      return new Error('No tienes permisos para consultar oportunidades comerciales.');
    }

    return new Error(fallback);
  }
}
