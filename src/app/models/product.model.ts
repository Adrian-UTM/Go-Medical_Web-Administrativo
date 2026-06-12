// models/product.model.ts
// Modelos de productos basados en Supabase

import { AuditFields } from './common.model';

export enum ProductCategory {
  EquipoMedico = 'equipo_medico',
  UltrasonidoHumano = 'ultrasonido_humano',
  UltrasonidoVeterinario = 'ultrasonido_veterinario',
  Consumible = 'consumible',
  Refaccion = 'refaccion',
  Accesorio = 'accesorio',
  Servicio = 'servicio',
  // Legacy para compatibilidad con mocks de otros modulos (eliminar al final)
  UltrasoundHuman = 'ultrasound_human',
  UltrasoundVet = 'ultrasound_vet',
  Consumables = 'consumables',
  SpareParts = 'spare_parts',
  Services = 'services',
}

// Legacy para mocks
export enum ProductStatus {
  Active = 'active',
  Inactive = 'inactive',
  Discontinued = 'discontinued',
  Draft = 'draft',
}


export enum ProductItemType {
  Product = 'product',
  Service = 'service',
}

export enum ProductCondition {
  New = 'new',
  Preowned = 'preowned',
  Remanufactured = 'remanufactured',
}

export enum PhysicalCondition {
  Excellent = 'excellent',
  Good = 'good',
  Fair = 'fair',
  Poor = 'poor',
}

export enum FunctionalCondition {
  Operational = 'operational',
  RequiresService = 'requires_service',
  NotOperational = 'not_operational',
}
export enum ProductApplication {
  Humano = 'humano',
  Veterinario = 'veterinario',
  Ambos = 'ambos',
  General = 'general',
}

export enum StockUnit {
  Pieza = 'pieza',
  Caja = 'caja',
  Unidad = 'unidad',
  Litro = 'litro',
  Rollo = 'rollo',
  Paquete = 'paquete',
  Servicio = 'servicio',
}

export enum DocumentType {
  Manual = 'manual',
  FichaTecnica = 'ficha_tecnica',
  Certificado = 'certificado',
  CotizacionPdf = 'cotizacion_pdf',
  ReporteServicio = 'reporte_servicio',
  Imagen = 'imagen',
  Otro = 'otro',
}

export enum DocumentStatus {
  Available = 'available',
  Pending = 'pending',
  Archived = 'archived',
}

export interface Product extends AuditFields {
  id: string;                       
  sku: string;                      
  name: string;
  category: ProductCategory;
  application?: ProductApplication;
  commercial_brand?: string;
  description?: string;
  brand?: string;
  model?: string;
  unit_price_mxn?: number;
  reference_price_usd?: number;
  cost_price_mxn?: number;
  currency?: string;
  unit?: StockUnit;
  is_active?: boolean;
  requires_serial?: boolean;
  track_inventory?: boolean;
  lead_time_days?: number;
  old_price?: number;
  warranty_text?: string;
  shipping_info?: string;
  availability_status?: string;
  subcategory?: string;
  created_by?: string;
  item_type?: ProductItemType;
  product_condition?: ProductCondition | null;
  service_duration_minutes?: number | null;
  service_requires_visit?: boolean;
  service_includes?: string | null;
  service_notes?: string | null;
  physical_condition?: PhysicalCondition | null;
  functional_condition?: FunctionalCondition | null;
  inspection_date?: string | null;
  warranty_days?: number | null;
  condition_notes?: string | null;
  serial_number?: string | null;
  included_accessories?: string | null;

  // Asociaciones
  specs?: ProductSpec[];
  documents?: ProductDocument[];
  media?: ProductMedia[];

  // Legacy para compatibilidad con mocks (eliminar al final)
  price_mxn?: number;
  price_usd?: number;
  status?: ProductStatus;
  tags?: string[];
  image_url?: string;
}

export interface ProductSpec {
  id: string;
  product_id: string;               
  spec_group?: string;              
  spec_key?: string;                
  spec_value: string;               
  sort_order: number;
  created_at?: string;
  spec_name?: string; // Legacy mock
}

export interface ProductMedia {
  id: string;
  product_id: string;
  file_path: string;
  file_name?: string;
  document_type: DocumentType;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
}

export interface ProductDocument {
  id: string;
  product_id: string;               
  title: string;
  file_path?: string;
  document_type: DocumentType;
  status?: DocumentStatus;
  file_name?: string;
  file_extension?: string;
  file_size_bytes?: number;
  notes?: string;
  uploaded_by?: string;
  is_public_to_clients?: boolean;
  created_at?: string;
  updated_at?: string;

  // Legacy mocks
  file_url?: string;
  version?: string;
  language?: string;
  uploaded_at?: string;
}

export interface CreateProductDto {
  sku: string;
  name: string;
  category: ProductCategory;
  application?: ProductApplication;
  commercial_brand?: string;
  description?: string;
  brand?: string;
  model?: string;
  unit_price_mxn?: number;
  reference_price_usd?: number;
  cost_price_mxn?: number;
  currency?: string;
  unit?: StockUnit;
  is_active?: boolean;
  requires_serial?: boolean;
  track_inventory?: boolean;
  lead_time_days?: number;
  old_price?: number;
  warranty_text?: string;
  shipping_info?: string;
  availability_status?: string;
  subcategory?: string;
  item_type?: ProductItemType;
  product_condition?: ProductCondition | null;
  service_duration_minutes?: number | null;
  service_requires_visit?: boolean;
  service_includes?: string | null;
  service_notes?: string | null;
  physical_condition?: PhysicalCondition | null;
  functional_condition?: FunctionalCondition | null;
  inspection_date?: string | null;
  warranty_days?: number | null;
  condition_notes?: string | null;
  serial_number?: string | null;
  included_accessories?: string | null;
}

export type UpdateProductDto = Partial<CreateProductDto>;

export interface ProductFilters {
  search?: string;
  category?: ProductCategory;
  is_active?: boolean;
  min_price?: number;
  max_price?: number;
  status?: ProductStatus; // Legacy mock
  item_type?: ProductItemType;
  product_condition?: ProductCondition | '';
}
