import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Product, CreateProductDto, UpdateProductDto, ProductFilters } from '../../../models/product.model';

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
    return from(
      this.supabase.client
        .from(this.tableName)
        .insert(dto)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as Product;
      })
    );
  }

  updateProduct(id: string, dto: UpdateProductDto): Observable<Product> {
    return from(
      this.supabase.client
        .from(this.tableName)
        .update(dto)
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as Product;
      })
    );
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
}
