import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ProductsMockService } from '../../products/services/products.mock.service';
import { Product, ProductStatus } from '../../../models/product.model';
import {
  DocumentCreatePayload,
  DocumentFilters,
  DocumentStatus,
  DocumentType,
  RelatedEntityType,
  SystemDocument,
} from '../models/document.model';

const MOCK_DOCUMENTS: SystemDocument[] = [];

@Injectable({ providedIn: 'root' })
export class DocumentsMockService {
  private readonly productsService = inject(ProductsMockService);

  private readonly _documents = signal<SystemDocument[]>([...MOCK_DOCUMENTS]);
  private readonly _products = signal<Product[]>([]);

  private catalogLoaded = false;
  private catalogPromise: Promise<void> | null = null;

  readonly documents = this._documents.asReadonly();
  readonly availableProducts = computed(() => this._products());

  constructor() {
    void this.ensureCatalogLoaded();
  }

  async getDocuments(filters?: DocumentFilters): Promise<SystemDocument[]> {
    await this.ensureCatalogLoaded();

    let result = [...this._documents()];

    if (filters?.search?.trim()) {
      const query = filters.search.trim().toLowerCase();
      result = result.filter(document =>
        document.title.toLowerCase().includes(query) ||
        document.fileName.toLowerCase().includes(query) ||
        (document.productNameSnapshot?.toLowerCase().includes(query) ?? false) ||
        (document.relatedEntityName?.toLowerCase().includes(query) ?? false)
      );
    }

    if (filters?.documentType) {
      result = result.filter(document => document.documentType === filters.documentType);
    }

    if (filters?.status) {
      result = result.filter(document => document.status === filters.status);
    }

    if (filters?.productId) {
      result = result.filter(document => document.productId === filters.productId);
    }

    result.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    return this.delay(result.map(document => ({ ...document })), 240);
  }

  async getDocumentById(id: string): Promise<SystemDocument | undefined> {
    await this.ensureCatalogLoaded();
    const document = this._documents().find(item => item.id === id);
    return this.delay(document ? { ...document } : undefined, 180);
  }

  async getAvailableProducts(): Promise<Product[]> {
    await this.ensureCatalogLoaded();
    return this.delay([...this._products()], 180);
  }

  async getProductById(id: string): Promise<Product | undefined> {
    await this.ensureCatalogLoaded();
    const product = this._products().find(item => item.id === id);
    return this.delay(product ? { ...product } : undefined, 140);
  }

  async createDocument(payload: DocumentCreatePayload): Promise<SystemDocument> {
    await this.ensureCatalogLoaded();

    const product = payload.productId
      ? this._products().find(item => item.id === payload.productId)
      : undefined;

    const now = new Date().toISOString();
    const extension = this.extractExtension(payload.fileName);

    const document: SystemDocument = {
      id: `docsys-${Date.now()}`,
      title: payload.title.trim(),
      documentType: payload.documentType,
      status: payload.status ?? DocumentStatus.Available,
      relatedEntityType: payload.relatedEntityType,
      relatedEntityId: product?.id,
      relatedEntityName: product?.name ?? this.getRelatedEntityName(payload.relatedEntityType),
      productId: product?.id,
      productNameSnapshot: product?.name,
      equipmentSerialNumber: payload.equipmentSerialNumber?.trim() || undefined,
      fileName: payload.fileName.trim(),
      fileExtension: extension,
      fileSizeLabel: this.generateMockFileSizeLabel(extension),
      mockFileUrl: '#',
      uploadedBy: payload.uploadedBy?.trim() || 'Usuario administrativo',
      uploadedAt: now,
      updatedAt: now,
      notes: payload.notes?.trim() || undefined,
    };

    this._documents.update(current => [document, ...current]);

    return this.delay({ ...document }, 300);
  }

  async archiveDocument(id: string): Promise<SystemDocument | undefined> {
    await this.ensureCatalogLoaded();

    const current = this._documents();
    const index = current.findIndex(document => document.id === id);
    if (index === -1) {
      return this.delay(undefined, 150);
    }

    const updated: SystemDocument = {
      ...current[index],
      status: DocumentStatus.Archived,
      updatedAt: new Date().toISOString(),
    };

    const next = [...current];
    next[index] = updated;
    this._documents.set(next);

    return this.delay({ ...updated }, 220);
  }

  async triggerMockDownload(systemDocument: SystemDocument): Promise<void> {
    const productLine = systemDocument.productNameSnapshot
      ? `Producto relacionado: ${systemDocument.productNameSnapshot}`
      : 'Producto relacionado: No aplica';

    const content = [
      'GO MEDICAL - DOCUMENTO TECNICO MOCK',
      `Titulo: ${systemDocument.title}`,
      `Tipo: ${systemDocument.documentType}`,
      `Estado: ${systemDocument.status}`,
      productLine,
      `Archivo: ${systemDocument.fileName}`,
      `Cargado por: ${systemDocument.uploadedBy}`,
      `Fecha de carga: ${systemDocument.uploadedAt}`,
      systemDocument.notes ? `Notas: ${systemDocument.notes}` : 'Notas: Sin notas registradas',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = systemDocument.fileName;
    link.click();
    URL.revokeObjectURL(url);

    await this.delay(undefined, 120);
  }

  private async ensureCatalogLoaded(): Promise<void> {
    if (this.catalogLoaded) {
      return;
    }

    if (!this.catalogPromise) {
      this.catalogPromise = (async () => {
        const response = await firstValueFrom(this.productsService.getProducts({ status: ProductStatus.Active }));
        this._products.set(response.data.filter(product => product.status === ProductStatus.Active));
        this.catalogLoaded = true;
      })();
    }

    await this.catalogPromise;
  }

  private extractExtension(fileName: string): string {
    const normalized = fileName.trim();
    const extension = normalized.includes('.') ? normalized.split('.').pop() ?? '' : '';
    return extension.toLowerCase() || 'pdf';
  }

  private generateMockFileSizeLabel(extension: string): string {
    const sizes: Record<string, string> = {
      pdf: '1.8 MB',
      png: '680 KB',
      jpg: '710 KB',
      jpeg: '710 KB',
      docx: '920 KB',
      xlsx: '540 KB',
    };

    return sizes[extension] ?? '1.2 MB';
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

  private delay<T>(data: T, ms = 220): Promise<T> {
    return new Promise(resolve => setTimeout(() => resolve(data), ms));
  }
}


