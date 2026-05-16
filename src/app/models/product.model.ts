// models/product.model.ts
// Modelos de productos (equipos, consumibles, servicios)

import { AuditFields } from './common.model';

export enum ProductCategory {
  UltrasoundHuman    = 'ultrasound_human',
  UltrasoundVet      = 'ultrasound_vet',
  Consumables        = 'consumables',
  SpareParts         = 'spare_parts',
  Services           = 'services',
}

export enum ProductStatus {
  Active       = 'active',
  Inactive     = 'inactive',
  Discontinued = 'discontinued',
  Draft        = 'draft',
}

export enum ProductDocumentType {
  UserManual    = 'user_manual',
  TechSpec      = 'tech_spec',
  Brochure      = 'brochure',
  Certificate   = 'certificate',
  Warranty      = 'warranty',
  Other         = 'other',
}

export interface Product extends AuditFields {
  id: string;                       // uuid
  sku: string;                      // Codigo unico interno
  name: string;
  description?: string;
  category: ProductCategory;
  status: ProductStatus;
  price_mxn: number;                // Precio en MXN (precio base)
  price_usd?: number;               // Precio referencial en USD (opcional)
  brand?: string;                   // Marca del fabricante
  model?: string;                   // Modelo del equipo
  image_url?: string;               // URL o data URL mock para vista previa / futura Storage
  specs?: ProductSpec[];
  documents?: ProductDocument[];
  tags?: string[];
}

export interface ProductSpec {
  id: string;
  product_id: string;               // FK → products.id
  spec_group?: string;              // Ej: Imagen, Conectividad, Dimensiones
  spec_name: string;                // Ej: Frecuencia de transductor
  spec_value: string;               // Ej: 2-15 MHz
  sort_order: number;
}

export interface ProductDocument {
  id: string;
  product_id: string;               // FK → products.id
  document_type: ProductDocumentType;
  title: string;
  file_url: string;                 // URL en Supabase Storage
  file_name: string;
  file_size_bytes?: number;
  language?: string;                // es, en
  version?: string;
  uploaded_at: string;
}

export interface CreateProductDto {
  sku: string;
  name: string;
  description?: string;
  category: ProductCategory;
  status: ProductStatus;
  price_mxn: number;
  price_usd?: number;
  brand?: string;
  model?: string;
  image_url?: string;
  tags?: string[];
}

export type UpdateProductDto = Partial<CreateProductDto>;

export interface ProductFilters {
  search?: string;
  category?: ProductCategory;
  status?: ProductStatus;
  min_price?: number;
  max_price?: number;
}
