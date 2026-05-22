import { Injectable } from '@angular/core';
import { from, Observable, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Product, CreateProductDto, UpdateProductDto, ProductFilters, ProductItemType, ProductCondition, ProductApplication, ProductCategory, StockUnit } from '../../../models/product.model';

@Injectable({
  providedIn: 'root'
})
export class ProductSupabaseService {
  private readonly tableName = 'products';

  constructor(private supabase: SupabaseService) {}

  getProducts(filters?: ProductFilters): Observable<Product[]> {
    let query = this.supabase.client
      .from(this.tableName)
      .select(`
        *,
        media:product_media(file_path, is_primary)
      `)
      .order('created_at', { ascending: false });

    if (filters?.search) {
      query = query.or(`name.ilike.%${filters.search}%,sku.ilike.%${filters.search}%`);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.item_type === ProductItemType.Product) {
      query = query.or('item_type.eq.product,item_type.is.null');
    } else if (filters?.item_type === ProductItemType.Service) {
      query = query.eq('item_type', ProductItemType.Service);
    }
    if (filters?.product_condition === ProductCondition.New) {
      query = query.or('product_condition.eq.new,product_condition.is.null');
    } else if (filters?.product_condition === ProductCondition.Preowned) {
      query = query.eq('product_condition', ProductCondition.Preowned);
    }
    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        // Map the media object to a simple image_url property for the UI if needed
        return data.map((item: any) => {
          const primaryMedia = item.media?.find((m: any) => m.is_primary) || item.media?.[0];
          return {
            ...item,
            image_url: primaryMedia ? primaryMedia.file_path : undefined
          };
        }) as Product[];
      })
    );
  }

  getProductById(id: string): Observable<Product> {
    return from(
      this.supabase.client
        .from(this.tableName)
        .select(`
          *,
          specs:product_specs(*),
          documents:product_documents(*),
          media:product_media(*)
        `)
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as Product;
      })
    );
  }

  createProduct(dto: CreateProductDto): Observable<Product> {
    const payload = this.buildProductPayload(dto);

    return from(this.assertSkuAvailable(String(payload['sku'] ?? ''))).pipe(
      switchMap(() => from(
        this.supabase.client
          .from(this.tableName)
          .insert(payload)
          .select()
          .single()
      )),
      map(({ data, error }) => {
        if (error) {
          console.error('[Products] Error creating product', {
            operation: 'insert',
            payload,
            error,
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code
          });
          throw this.toProductError(error, 'No fue posible guardar el producto.');
        }
        return data as Product;
      })
    );
  }

  updateProduct(id: string, dto: UpdateProductDto): Observable<Product> {
    const payload = this.buildProductPayload(dto, true);
    payload['updated_at'] = new Date().toISOString();

    return from(this.assertSkuAvailable(String(payload['sku'] ?? ''), id)).pipe(
      switchMap(() => from(
        this.supabase.client
          .from(this.tableName)
          .update(payload)
          .eq('id', id)
          .select()
          .single()
      )),
      map(({ data, error }) => {
        if (error) {
          console.error('[Products] Error updating product', {
            operation: 'update',
            id,
            payload,
            error,
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code
          });
          throw this.toProductError(error, 'No fue posible actualizar el producto.');
        }
        return data as Product;
      })
    );
  }

  private buildProductPayload(dto: CreateProductDto | UpdateProductDto, partial = false): Record<string, any> {
    const source = dto as Record<string, any>;
    const itemType = this.cleanText(source['item_type']) === ProductItemType.Service
      ? ProductItemType.Service
      : ProductItemType.Product;
    const productCondition = itemType === ProductItemType.Product
      ? (this.cleanText(source['product_condition']) === ProductCondition.Preowned ? ProductCondition.Preowned : ProductCondition.New)
      : null;

    const payload: Record<string, any> = {
      sku: this.cleanText(source['sku'])?.toUpperCase(),
      name: this.cleanText(source['name']),
      description: this.cleanText(source['description']),
      category: itemType === ProductItemType.Service ? ProductCategory.Servicio : this.cleanText(source['category']),
      application: itemType === ProductItemType.Service ? ProductApplication.General : this.cleanText(source['application']),
      brand: itemType === ProductItemType.Service ? null : this.cleanText(source['brand']),
      model: itemType === ProductItemType.Service ? null : this.cleanText(source['model']),
      unit_price_mxn: this.toNumber(source['unit_price_mxn']),
      cost_price_mxn: itemType === ProductItemType.Service ? 0 : this.toNumber(source['cost_price_mxn']),
      reference_price_usd: itemType === ProductItemType.Service ? null : this.toNumber(source['reference_price_usd'], true),
      currency: this.cleanText(source['currency']) || 'MXN',
      unit: itemType === ProductItemType.Service ? StockUnit.Servicio : this.cleanText(source['unit']),
      is_active: typeof source['is_active'] === 'boolean' ? source['is_active'] : true,
      requires_serial: itemType === ProductItemType.Service ? false : this.toOptionalBoolean(source['requires_serial']),
      track_inventory: itemType === ProductItemType.Service ? false : this.toOptionalBoolean(source['track_inventory']),
      lead_time_days: this.toNumber(source['lead_time_days'], true),
      old_price: this.toNumber(source['old_price'], true),
      warranty_text: this.cleanText(source['warranty_text']),
      shipping_info: this.cleanText(source['shipping_info']),
      availability_status: this.cleanText(source['availability_status']),
      subcategory: this.cleanText(source['subcategory']),
      commercial_brand: itemType === ProductItemType.Service ? null : this.cleanText(source['commercial_brand']),
      item_type: itemType,
      product_condition: productCondition,
      service_duration_minutes: itemType === ProductItemType.Service ? this.toNumber(source['service_duration_minutes'], true) : null,
      service_requires_visit: itemType === ProductItemType.Service ? !!source['service_requires_visit'] : false,
      service_includes: itemType === ProductItemType.Service ? this.cleanText(source['service_includes']) : null,
      service_notes: itemType === ProductItemType.Service ? this.cleanText(source['service_notes']) : null,
      physical_condition: productCondition === ProductCondition.Preowned ? this.cleanText(source['physical_condition']) : null,
      functional_condition: productCondition === ProductCondition.Preowned ? this.cleanText(source['functional_condition']) : null,
      inspection_date: productCondition === ProductCondition.Preowned ? this.cleanText(source['inspection_date']) : null,
      warranty_days: productCondition === ProductCondition.Preowned ? this.toNumber(source['warranty_days'], true) : null,
      condition_notes: productCondition === ProductCondition.Preowned ? this.cleanText(source['condition_notes']) : null,
      serial_number: productCondition === ProductCondition.Preowned ? this.cleanText(source['serial_number']) : null,
      included_accessories: productCondition === ProductCondition.Preowned ? this.cleanText(source['included_accessories']) : null,
    };

    delete payload['id'];
    delete payload['created_at'];
    delete payload['updated_at'];
    delete payload['image_url'];
    delete payload['media'];
    delete payload['documents'];
    delete payload['specs'];

    if (partial) {
      for (const key of Object.keys(payload)) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) {
          delete payload[key];
        }
      }
    }

    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => {
        if (value === undefined) {
          return false;
        }

        if (partial && value === null) {
          return true;
        }

        return !(typeof value === 'number' && Number.isNaN(value));
      })
    );
  }

  private async assertSkuAvailable(sku: string, excludeId?: string): Promise<void> {
    const normalizedSku = sku.trim();
    if (!normalizedSku) {
      return;
    }

    let query = this.supabase.client
      .from(this.tableName)
      .select('id, sku')
      .eq('sku', normalizedSku)
      .limit(1);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[Products] No fue posible validar SKU antes de guardar', {
        sku: normalizedSku,
        excludeId,
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });
      return;
    }

    if ((data ?? []).length > 0) {
      throw new Error('Ya existe un producto con ese SKU.');
    }
  }

  private cleanText(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : null;
  }

  private toNumber(value: unknown, nullable = false): number | null {
    if (value === null || value === undefined || value === '') {
      return nullable ? null : 0;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (nullable ? null : 0);
  }

  private toOptionalBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private toProductError(error: any, fallback: string): Error {
    const message = String(error?.message ?? '').toLowerCase();
    const details = String(error?.details ?? '').toLowerCase();
    const hint = String(error?.hint ?? '').toLowerCase();
    const combined = `${message} ${details} ${hint}`;

    if (String(error?.code ?? '') === '23505' || combined.includes('duplicate key') || combined.includes('unique')) {
      if (combined.includes('sku')) {
        return new Error('Ya existe un producto con ese SKU.');
      }

      if (combined.includes('name') || combined.includes('nombre')) {
        return new Error('Ya existe un producto con ese nombre.');
      }

      if (combined.includes('slug')) {
        return new Error('Ya existe un producto con ese identificador.');
      }

      return new Error('Ya existe un producto con los mismos datos únicos. Revisa SKU, nombre o código.');
    }

    if (combined.includes('permission') || combined.includes('rls') || combined.includes('policy')) {
      return new Error('No tienes permisos para guardar productos.');
    }

    return new Error(fallback);
  }
  toggleActive(id: string, currentStatus: boolean): Observable<Product> {
    return this.updateProduct(id, { is_active: !currentStatus });
  }

  deleteProduct(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from(this.tableName)
        .delete()
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      })
    );
  }

  uploadProductImage(productId: string, file: File): Observable<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${productId}/${Date.now()}.${fileExt}`;
    
    return from(
      this.supabase.client.storage
        .from('product-media')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        
        const { data: { publicUrl } } = this.supabase.client.storage
          .from('product-media')
          .getPublicUrl(fileName);
          
        return publicUrl;
      })
    );
  }

  saveProductMedia(productId: string, imageUrl: string): Observable<any> {
    return from(
      this.supabase.client
        .from('product_media')
        .delete()
        .eq('product_id', productId)
    ).pipe(
      switchMap(({ error }) => {
        if (error) throw new Error(error.message);
        
        return from(
          this.supabase.client
            .from('product_media')
            .insert({
              product_id: productId,
              file_path: imageUrl,
              document_type: 'imagen',
              is_primary: true,
              sort_order: 0
            })
            .select()
        );
      }),
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data;
      })
    );
  }

  deleteProductMedia(productId: string): Observable<any> {
    return from(
      this.supabase.client
        .from('product_media')
        .delete()
        .eq('product_id', productId)
    ).pipe(
      map(({ error }) => {
        if (error) throw new Error(error.message);
      })
    );
  }
}
