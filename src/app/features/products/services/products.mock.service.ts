// features/products/services/products.mock.service.ts
// Servicio mock temporal — datos realistas controlados
// Al integrar Supabase: crear ProductsService que extienda la misma interfaz base

import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import {
  Product, ProductCategory, ProductStatus,
  ProductSpec, ProductDocument,
  CreateProductDto, UpdateProductDto, ProductFilters
} from '../../../models/product.model';
import { PaginatedResponse } from '../../../models/common.model';

// ------------------------------------------------------------------
// DATOS MOCK — realistas para empresa biomédica
// ------------------------------------------------------------------
const MOCK_SPECS_ALPHAVET: ProductSpec[] = [];
const MOCK_DOCS_ALPHAVET: ProductDocument[] = [];
export const MOCK_PRODUCTS: Product[] = [];

// ------------------------------------------------------------------
// SERVICIO
// ------------------------------------------------------------------
@Injectable({ providedIn: 'root' })
export class ProductsMockService {
  private products = [...MOCK_PRODUCTS];

  getProducts(filters?: ProductFilters): Observable<PaginatedResponse<Product>> {
    let result = [...this.products];

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.brand?.toLowerCase().includes(q) ?? false)
      );
    }

    if (filters?.category) {
      result = result.filter(p => p.category === filters.category);
    }

    if (filters?.status) {
      result = result.filter(p => p.status === filters.status);
    }

    const response: PaginatedResponse<Product> = {
      data: result,
      count: result.length,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    };

    return of(response).pipe(delay(350));
  }

  getProduct(id: string): Observable<Product | null> {
    const product = this.products.find(p => p.id === id) ?? null;
    return of(product).pipe(delay(250));
  }

  createProduct(dto: CreateProductDto): Observable<Product> {
    const newProduct: Product = {
      ...dto,
      id: `prod-${Date.now()}`,
      specs: [],
      documents: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.products.push(newProduct);
    return of(newProduct).pipe(delay(400));
  }

  updateProduct(id: string, dto: UpdateProductDto): Observable<Product | null> {
    const index = this.products.findIndex(p => p.id === id);
    if (index === -1) return of(null);

    const updated = {
      ...this.products[index],
      ...dto,
      updated_at: new Date().toISOString(),
    };
    this.products[index] = updated;
    return of(updated).pipe(delay(400));
  }

  deleteProduct(id: string): Observable<boolean> {
    const index = this.products.findIndex(p => p.id === id);
    if (index === -1) return of(false);
    this.products.splice(index, 1);
    return of(true).pipe(delay(300));
  }
}
