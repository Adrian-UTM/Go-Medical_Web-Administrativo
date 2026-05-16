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

const MOCK_DOCUMENTS: SystemDocument[] = [
  {
    id: 'docsys-001',
    title: 'Manual de usuario AlphaVet 300',
    documentType: DocumentType.UserManual,
    status: DocumentStatus.Available,
    relatedEntityType: RelatedEntityType.Product,
    relatedEntityId: 'prod-001',
    relatedEntityName: 'AlphaVet 300',
    productId: 'prod-001',
    productNameSnapshot: 'AlphaVet 300',
    fileName: 'manual-alphavet-300-es.pdf',
    fileExtension: 'pdf',
    fileSizeLabel: '8.1 MB',
    mockFileUrl: '#',
    uploadedBy: 'Adriana Pech',
    uploadedAt: '2026-05-02T10:15:00.000Z',
    updatedAt: '2026-05-02T10:15:00.000Z',
    notes: 'Version vigente para entrega comercial y soporte postventa.',
  },
  {
    id: 'docsys-002',
    title: 'Ficha tecnica MedScan Pro 500',
    documentType: DocumentType.TechnicalSheet,
    status: DocumentStatus.Available,
    relatedEntityType: RelatedEntityType.Product,
    relatedEntityId: 'prod-002',
    relatedEntityName: 'MedScan Pro 500',
    productId: 'prod-002',
    productNameSnapshot: 'MedScan Pro 500',
    fileName: 'ficha-tecnica-medscan-pro-500.pdf',
    fileExtension: 'pdf',
    fileSizeLabel: '2.4 MB',
    mockFileUrl: '#',
    uploadedBy: 'Miguel Cetz',
    uploadedAt: '2026-05-03T08:30:00.000Z',
    updatedAt: '2026-05-03T08:30:00.000Z',
    notes: 'Ficha resumida para comparativos tecnicos con hospitales y clinicas.',
  },
  {
    id: 'docsys-003',
    title: 'Certificado de compatibilidad de transductor lineal 3-8 MHz',
    documentType: DocumentType.Certificate,
    status: DocumentStatus.Available,
    relatedEntityType: RelatedEntityType.Product,
    relatedEntityId: 'prod-005',
    relatedEntityName: 'Transductor lineal 3-8 MHz (refaccion)',
    productId: 'prod-005',
    productNameSnapshot: 'Transductor lineal 3-8 MHz (refaccion)',
    fileName: 'certificado-transductor-lineal-l38.pdf',
    fileExtension: 'pdf',
    fileSizeLabel: '1.1 MB',
    mockFileUrl: '#',
    uploadedBy: 'Laura Chan',
    uploadedAt: '2026-05-04T15:45:00.000Z',
    updatedAt: '2026-05-04T15:45:00.000Z',
    notes: 'Documento solicitado frecuentemente por clientes con requerimientos de validacion tecnica.',
  },
  {
    id: 'docsys-004',
    title: 'Guia de mantenimiento preventivo AlphaVet 300',
    documentType: DocumentType.MaintenanceGuide,
    status: DocumentStatus.Pending,
    relatedEntityType: RelatedEntityType.Equipment,
    relatedEntityId: 'prod-001',
    relatedEntityName: 'AlphaVet 300',
    productId: 'prod-001',
    productNameSnapshot: 'AlphaVet 300',
    equipmentSerialNumber: 'AV300-MER-2026-017',
    fileName: 'guia-mantenimiento-alphavet-300-v2.pdf',
    fileExtension: 'pdf',
    fileSizeLabel: '3.7 MB',
    mockFileUrl: '#',
    uploadedBy: 'Carlos Tamayo',
    uploadedAt: '2026-05-06T12:05:00.000Z',
    updatedAt: '2026-05-06T12:05:00.000Z',
    notes: 'Version pendiente de validacion interna para liberarse al area tecnica.',
  },
  {
    id: 'docsys-005',
    title: 'Garantia comercial MedScan Pro 500',
    documentType: DocumentType.Warranty,
    status: DocumentStatus.Available,
    relatedEntityType: RelatedEntityType.Product,
    relatedEntityId: 'prod-002',
    relatedEntityName: 'MedScan Pro 500',
    productId: 'prod-002',
    productNameSnapshot: 'MedScan Pro 500',
    fileName: 'garantia-medscan-pro-500.pdf',
    fileExtension: 'pdf',
    fileSizeLabel: '840 KB',
    mockFileUrl: '#',
    uploadedBy: 'Adriana Pech',
    uploadedAt: '2026-05-07T09:00:00.000Z',
    updatedAt: '2026-05-07T09:00:00.000Z',
    notes: 'Documento base para entregas comerciales y respaldo administrativo.',
  },
  {
    id: 'docsys-006',
    title: 'Imagen tecnica de transductor lineal L38',
    documentType: DocumentType.ProductImage,
    status: DocumentStatus.Archived,
    relatedEntityType: RelatedEntityType.Product,
    relatedEntityId: 'prod-005',
    relatedEntityName: 'Transductor lineal 3-8 MHz (refaccion)',
    productId: 'prod-005',
    productNameSnapshot: 'Transductor lineal 3-8 MHz (refaccion)',
    fileName: 'imagen-tecnica-transductor-l38.png',
    fileExtension: 'png',
    fileSizeLabel: '620 KB',
    mockFileUrl: '#',
    uploadedBy: 'Miguel Cetz',
    uploadedAt: '2026-04-25T16:20:00.000Z',
    updatedAt: '2026-05-01T18:10:00.000Z',
    notes: 'Version anterior archivada para control interno del equipo comercial.',
  },
];

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


