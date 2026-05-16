// features/products/services/products.mock.service.ts
// Servicio mock temporal — datos realistas controlados
// Al integrar Supabase: crear ProductsService que extienda la misma interfaz base

import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import {
  Product, ProductCategory, ProductStatus,
  ProductSpec, ProductDocument, ProductDocumentType,
  CreateProductDto, UpdateProductDto, ProductFilters
} from '../../../models/product.model';
import { PaginatedResponse } from '../../../models/common.model';

// ------------------------------------------------------------------
// DATOS MOCK — realistas para empresa biomédica
// ------------------------------------------------------------------
const MOCK_SPECS_ALPHAVET: ProductSpec[] = [
  { id: 'sp-001', product_id: 'prod-001', spec_group: 'Imagen', spec_name: 'Tipo de imagen', spec_value: 'B, B+B, 4B, M, B+M', sort_order: 1 },
  { id: 'sp-002', product_id: 'prod-001', spec_group: 'Imagen', spec_name: 'Profundidad de exploración', spec_value: '40–300 mm', sort_order: 2 },
  { id: 'sp-003', product_id: 'prod-001', spec_group: 'Transductor', spec_name: 'Frecuencias', spec_value: '2.5 / 3.5 / 5.0 / 7.5 MHz', sort_order: 3 },
  { id: 'sp-004', product_id: 'prod-001', spec_group: 'Pantalla', spec_name: 'Monitor', spec_value: '10" LCD, 800×600 px', sort_order: 4 },
  { id: 'sp-005', product_id: 'prod-001', spec_group: 'Conectividad', spec_name: 'Salidas', spec_value: 'USB 2.0, HDMI, VGA', sort_order: 5 },
  { id: 'sp-006', product_id: 'prod-001', spec_group: 'Dimensiones', spec_name: 'Peso', spec_value: '4.2 kg', sort_order: 6 },
];

const MOCK_DOCS_ALPHAVET: ProductDocument[] = [
  {
    id: 'doc-001', product_id: 'prod-001',
    document_type: ProductDocumentType.TechSpec,
    title: 'Ficha técnica AlphaVet 300',
    file_url: '#', file_name: 'alphavet300_spec_es.pdf',
    file_size_bytes: 2_450_000, language: 'es', version: '1.2',
    uploaded_at: '2025-10-01T00:00:00Z',
  },
  {
    id: 'doc-002', product_id: 'prod-001',
    document_type: ProductDocumentType.UserManual,
    title: 'Manual de usuario AlphaVet 300',
    file_url: '#', file_name: 'alphavet300_manual_es.pdf',
    file_size_bytes: 8_100_000, language: 'es', version: '1.0',
    uploaded_at: '2025-10-01T00:00:00Z',
  },
];

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'prod-001',
    sku: 'UVT-300-VT',
    name: 'AlphaVet 300',
    description: 'Equipo de ultrasonido veterinario portátil de alta resolución, ideal para clínicas de pequeñas y grandes especies.',
    category: ProductCategory.UltrasoundVet,
    status: ProductStatus.Active,
    price_mxn: 89_500,
    price_usd: 4_700,
    brand: 'AlphaSound',
    model: 'AV-300',
    specs: MOCK_SPECS_ALPHAVET,
    documents: MOCK_DOCS_ALPHAVET,
    tags: ['veterinario', 'portátil', 'b-mode'],
    created_at: '2025-09-15T00:00:00Z',
    updated_at: '2025-11-20T00:00:00Z',
  },
  {
    id: 'prod-002',
    sku: 'UHU-500-HM',
    name: 'MedScan Pro 500',
    description: 'Sistema de ultrasonido de diagnóstico humano con Doppler color y modo 3D básico para hospitales y clínicas.',
    category: ProductCategory.UltrasoundHuman,
    status: ProductStatus.Active,
    price_mxn: 245_000,
    price_usd: 12_800,
    brand: 'MedScan',
    model: 'MP-500',
    specs: [
      { id: 'sp-010', product_id: 'prod-002', spec_group: 'Imagen', spec_name: 'Modos de imagen', spec_value: 'B, M, Color Doppler, PW, CW', sort_order: 1 },
      { id: 'sp-011', product_id: 'prod-002', spec_group: 'Transductor', spec_name: 'Frecuencias', spec_value: '1–15 MHz (multifrecuencial)', sort_order: 2 },
      { id: 'sp-012', product_id: 'prod-002', spec_group: 'Pantalla', spec_name: 'Monitor', spec_value: '15" LCD HD', sort_order: 3 },
    ],
    documents: [],
    tags: ['humano', 'doppler', 'hospitalario'],
    created_at: '2025-08-01T00:00:00Z',
    updated_at: '2025-12-01T00:00:00Z',
  },
  {
    id: 'prod-003',
    sku: 'CON-GEL-500ML',
    name: 'Gel conductor ultrasónico 500 ml',
    description: 'Gel de transmisión ultrasónica, formula no alergénica, compatible con todos los equipos de ultrasonido.',
    category: ProductCategory.Consumables,
    status: ProductStatus.Active,
    price_mxn: 145,
    price_usd: undefined,
    brand: 'BioGel',
    model: 'BG-500',
    specs: [],
    documents: [],
    tags: ['consumible', 'gel', 'conductor'],
    created_at: '2025-01-10T00:00:00Z',
    updated_at: '2025-10-05T00:00:00Z',
  },
  {
    id: 'prod-004',
    sku: 'SRV-MNT-PREV',
    name: 'Mantenimiento preventivo anual',
    description: 'Servicio de mantenimiento preventivo anual para equipos de ultrasonido. Incluye limpieza, calibración y reporte técnico.',
    category: ProductCategory.Services,
    status: ProductStatus.Active,
    price_mxn: 3_800,
    price_usd: undefined,
    brand: undefined,
    model: undefined,
    specs: [],
    documents: [],
    tags: ['servicio', 'mantenimiento', 'preventivo'],
    created_at: '2024-06-01T00:00:00Z',
    updated_at: '2025-09-01T00:00:00Z',
  },
  {
    id: 'prod-005',
    sku: 'REF-SOND-L38',
    name: 'Transductor lineal 3-8 MHz (refacción)',
    description: 'Transductor de repuesto lineal de banda ancha 3-8 MHz. Compatible con serie AlphaVet 200/300.',
    category: ProductCategory.SpareParts,
    status: ProductStatus.Active,
    price_mxn: 12_200,
    price_usd: 640,
    brand: 'AlphaSound',
    model: 'SOND-L38-AV',
    specs: [
      { id: 'sp-020', product_id: 'prod-005', spec_group: 'Especificaciones', spec_name: 'Rango de frecuencia', spec_value: '3–8 MHz', sort_order: 1 },
      { id: 'sp-021', product_id: 'prod-005', spec_group: 'Especificaciones', spec_name: 'Compatibilidad', spec_value: 'AlphaVet 200 / 300', sort_order: 2 },
    ],
    documents: [],
    tags: ['refacción', 'transductor', 'lineal'],
    created_at: '2025-03-20T00:00:00Z',
    updated_at: '2025-03-20T00:00:00Z',
  },
  {
    id: 'prod-006',
    sku: 'UVT-100-VT',
    name: 'VetEcho 100 (descontinuado)',
    description: 'Equipo de ultrasonido veterinario básico. Modelo descontinuado, sin stock.',
    category: ProductCategory.UltrasoundVet,
    status: ProductStatus.Discontinued,
    price_mxn: 45_000,
    brand: 'AlphaSound',
    model: 'VE-100',
    specs: [],
    documents: [],
    created_at: '2022-01-01T00:00:00Z',
    updated_at: '2024-05-01T00:00:00Z',
  },
];

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
