import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ProductSupabaseService } from '../../products/services/product.supabase.service';
import { Product } from '../../../models/product.model';
import {
  DocumentCreatePayload,
  DocumentFilters,
  DocumentStatus,
  DocumentType,
  RelatedEntityType,
  SystemDocument,
} from '../models/document.model';
import { SupabaseService } from '../../../core/services/supabase.service';

@Injectable({ providedIn: 'root' })
export class DocumentsSupabaseService {
  private readonly tableName = 'product_documents';

  constructor(
    private readonly supabase: SupabaseService,
    private readonly productsService: ProductSupabaseService,
  ) {}

  async getDocuments(filters?: DocumentFilters): Promise<SystemDocument[]> {
    let query = this.supabase.client
      .from(this.tableName)
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.productId) {
      query = query.eq('product_id', filters.productId);
    }

    const [response, products] = await Promise.all([
      query,
      this.getAvailableProducts(),
    ]);

    if (response.error) {
      throw this.toAppError(response.error.message, 'No fue posible cargar los documentos técnicos.');
    }

    const productMap = new Map(products.map(product => [product.id, product]));
    let documents = (response.data ?? []).map(row => this.mapDocument(row, productMap));

    if (filters?.search?.trim()) {
      const search = filters.search.trim().toLowerCase();
      documents = documents.filter(document =>
        document.title.toLowerCase().includes(search) ||
        document.fileName.toLowerCase().includes(search) ||
        (document.productNameSnapshot?.toLowerCase().includes(search) ?? false) ||
        (document.relatedEntityName?.toLowerCase().includes(search) ?? false)
      );
    }

    if (filters?.documentType) {
      documents = documents.filter(document => document.documentType === filters.documentType);
    }

    if (filters?.status) {
      documents = documents.filter(document => document.status === filters.status);
    }

    return documents;
  }

  async getDocumentById(id: string): Promise<SystemDocument | undefined> {
    const [response, products] = await Promise.all([
      this.supabase.client
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single(),
      this.getAvailableProducts(),
    ]);

    if (response.error) {
      if (response.error.code === 'PGRST116') {
        return undefined;
      }

      throw this.toAppError(response.error.message, 'No fue posible cargar el documento solicitado.');
    }

    const productMap = new Map(products.map(product => [product.id, product]));
    return this.mapDocument(response.data, productMap);
  }

  async getAvailableProducts(): Promise<Product[]> {
    const products = await firstValueFrom(this.productsService.getProducts());
    return products.filter(product => product.is_active !== false);
  }

  async getProductById(id: string): Promise<Product | undefined> {
    try {
      return await firstValueFrom(this.productsService.getProductById(id));
    } catch {
      return undefined;
    }
  }

  async createDocument(payload: DocumentCreatePayload): Promise<SystemDocument> {
    const extension = this.extractExtension(payload.fileName);
    const insertPayload = {
      title: payload.title.trim(),
      product_id: payload.productId ?? null,
      document_type: payload.documentType,
      status: payload.status ?? DocumentStatus.Available,
      file_name: payload.fileName.trim(),
      file_extension: extension,
      notes: payload.notes?.trim() || null,
      uploaded_by: payload.uploadedBy?.trim() || 'Usuario administrativo',
      equipment_serial_number: payload.equipmentSerialNumber?.trim() || null,
      file_path: null,
    };

    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      throw this.toAppError(error.message, 'No fue posible registrar el documento técnico.');
    }

    const productMap = new Map((await this.getAvailableProducts()).map(product => [product.id, product]));
    return this.mapDocument(data, productMap);
  }

  async archiveDocument(id: string): Promise<SystemDocument | undefined> {
    const { data, error } = await this.supabase.client
      .from(this.tableName)
      .update({ status: DocumentStatus.Archived, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return undefined;
      }

      throw this.toAppError(error.message, 'No fue posible archivar el documento técnico.');
    }

    const productMap = new Map((await this.getAvailableProducts()).map(product => [product.id, product]));
    return this.mapDocument(data, productMap);
  }

  async triggerMockDownload(systemDocument: SystemDocument): Promise<void> {
    const resolvedUrl = this.resolveDocumentUrl(systemDocument.mockFileUrl);
    if (!resolvedUrl) {
      throw new Error('Este documento no tiene un archivo disponible para descarga en este momento.');
    }

    window.open(resolvedUrl, '_blank', 'noopener');
  }

  private mapDocument(row: any, productMap: Map<string, Product>): SystemDocument {
    const product = row.product_id ? productMap.get(row.product_id) : undefined;
    const fileName = row.file_name ?? this.extractFileNameFromPath(row.file_path) ?? 'archivo.pdf';
    const fileExtension = (row.file_extension ?? this.extractExtension(fileName) ?? 'pdf').toLowerCase();
    const productName = row.product_name_snapshot ?? product?.name;
    const relatedType = this.resolveRelatedEntityType(row, product);

    return {
      id: String(row.id),
      title: row.title ?? 'Documento sin título',
      documentType: (row.document_type ?? DocumentType.Other) as DocumentType,
      status: (row.status ?? DocumentStatus.Available) as DocumentStatus,
      relatedEntityType: relatedType,
      relatedEntityId: row.related_entity_id ?? row.product_id ?? undefined,
      relatedEntityName: productName ?? this.getRelatedEntityName(relatedType),
      productId: row.product_id ?? undefined,
      productNameSnapshot: productName,
      equipmentSerialNumber: row.equipment_serial_number ?? undefined,
      fileName,
      fileExtension,
      fileSizeLabel: this.formatFileSizeLabel(row.file_size_bytes),
      mockFileUrl: row.file_path ?? row.mock_file_url ?? undefined,
      uploadedBy: row.uploaded_by ?? 'Usuario administrativo',
      uploadedAt: row.uploaded_at ?? row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
      notes: row.notes ?? undefined,
    };
  }

  private resolveRelatedEntityType(row: any, product?: Product): RelatedEntityType {
    if (row.related_entity_type && Object.values(RelatedEntityType).includes(row.related_entity_type as RelatedEntityType)) {
      return row.related_entity_type as RelatedEntityType;
    }

    if (row.product_id || product) {
      return RelatedEntityType.Product;
    }

    if (row.equipment_serial_number) {
      return RelatedEntityType.Equipment;
    }

    return RelatedEntityType.General;
  }

  private resolveDocumentUrl(filePath?: string): string | null {
    if (!filePath) {
      return null;
    }

    const normalized = String(filePath).trim();
    if (!normalized) {
      return null;
    }

    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }

    return null;
  }

  private extractExtension(fileName: string): string {
    const normalized = fileName.trim();
    const extension = normalized.includes('.') ? normalized.split('.').pop() ?? '' : '';
    return extension.toLowerCase() || 'pdf';
  }

  private extractFileNameFromPath(filePath?: string): string | null {
    if (!filePath) {
      return null;
    }

    const segments = String(filePath).split('/').filter(Boolean);
    return segments.at(-1) ?? null;
  }

  private formatFileSizeLabel(bytes?: number): string {
    if (!bytes || bytes <= 0) {
      return 'Sin tamaño registrado';
    }

    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private getRelatedEntityName(entityType: RelatedEntityType): string {
    const labels: Record<RelatedEntityType, string> = {
      [RelatedEntityType.Product]: 'Producto relacionado',
      [RelatedEntityType.Equipment]: 'Equipo relacionado',
      [RelatedEntityType.Client]: 'Cliente relacionado',
      [RelatedEntityType.Ticket]: 'Ticket relacionado',
      [RelatedEntityType.General]: 'Documento general',
    };

    return labels[entityType];
  }

  private toAppError(message: string, fallback: string): Error {
    const lowered = message.toLowerCase();
    if (lowered.includes('permission') || lowered.includes('rls') || lowered.includes('policy')) {
      return new Error('No tienes permisos para consultar o modificar documentos técnicos.');
    }

    return new Error(message || fallback);
  }
}

