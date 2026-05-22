import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { Product } from '../../../../models/product.model';
import { DocumentsSupabaseService } from '../../services/documents.supabase.service';
import { DocumentStatus, DocumentType, SystemDocument } from '../../models/document.model';
import { PageVisibilityService } from '../../../../core/services/page-visibility.service';

@Component({
  selector: 'bc-document-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DatePipe,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoaderComponent,
    EmptyStateComponent,
    CustomSelectComponent,
  ],
  templateUrl: './document-list.component.html',
  styleUrl: './document-list.component.css',
})
export class DocumentListComponent implements OnInit {
  private readonly documentsService = inject(DocumentsSupabaseService);
  private readonly pageVisibility = inject(PageVisibilityService);
  private readonly destroyRef = inject(DestroyRef);

  private loadInFlight = false;

  readonly isLoading = signal(false);
  readonly isProcessing = signal<string | null>(null);
  readonly documents = signal<SystemDocument[]>([]);
  readonly products = signal<Product[]>([]);
  readonly searchQuery = signal('');
  readonly selectedType = signal<DocumentType | ''>('');
  readonly selectedStatus = signal<DocumentStatus | ''>('');
  readonly selectedProductId = signal('');
  readonly actionMessage = signal('');

  readonly typeOptions = [
    { value: '', label: 'Todos los tipos' },
    { value: DocumentType.UserManual, label: 'Manual de usuario' },
    { value: DocumentType.TechnicalSheet, label: 'Ficha tecnica' },
    { value: DocumentType.Certificate, label: 'Certificado' },
    { value: DocumentType.Warranty, label: 'Garantia' },
    { value: DocumentType.MaintenanceGuide, label: 'Guia de mantenimiento' },
    { value: DocumentType.ServiceReport, label: 'Reporte tecnico' },
    { value: DocumentType.ProductImage, label: 'Imagen tecnica' },
    { value: DocumentType.Other, label: 'Otro' },
  ];

  readonly statusOptions = [
    { value: '', label: 'Todos los estados' },
    { value: DocumentStatus.Available, label: 'Disponible' },
    { value: DocumentStatus.Pending, label: 'Pendiente' },
    { value: DocumentStatus.Archived, label: 'Archivado' },
  ];

  readonly productOptions = computed(() => [
    { value: '', label: 'Todos los productos' },
    ...this.products().map(product => ({ value: product.id, label: `${product.sku} · ${product.name}` })),
  ]);

  readonly filteredDocuments = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const type = this.selectedType();
    const status = this.selectedStatus();
    const productId = this.selectedProductId();

    return this.documents().filter(systemDocument => {
      const matchesQuery = !query || [
        systemDocument.title,
        systemDocument.fileName,
        systemDocument.productNameSnapshot || '',
        systemDocument.relatedEntityName || '',
      ].some(value => value.toLowerCase().includes(query));

      const matchesType = !type || systemDocument.documentType === type;
      const matchesStatus = !status || systemDocument.status === status;
      const matchesProduct = !productId || systemDocument.productId === productId;

      return matchesQuery && matchesType && matchesStatus && matchesProduct;
    });
  });

  readonly hasActiveFilters = computed(() =>
    !!this.searchQuery().trim() || !!this.selectedType() || !!this.selectedStatus() || !!this.selectedProductId()
  );

  ngOnInit(): void {
    void this.loadData();

    this.pageVisibility.visible$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.loadData();
      });
  }

  async loadData(): Promise<void> {
    if (this.loadInFlight) {
      return;
    }

    this.loadInFlight = true;
    this.isLoading.set(true);
    this.actionMessage.set('');

    try {
      const [documents, products] = await Promise.all([
        this.documentsService.getDocuments(),
        this.documentsService.getAvailableProducts(),
      ]);
      this.documents.set(documents);
      this.products.set(products);
    } catch (error) {
      this.documents.set([]);
      this.products.set([]);
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible cargar los documentos técnicos.');
    } finally {
      this.loadInFlight = false;
      this.isLoading.set(false);
    }
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedType.set('');
    this.selectedStatus.set('');
    this.selectedProductId.set('');
  }

  async downloadDocument(systemDocument: SystemDocument): Promise<void> {
    this.isProcessing.set(systemDocument.id);

    try {
      await this.documentsService.triggerMockDownload(systemDocument);
      this.actionMessage.set(`Documento abierto para ${systemDocument.fileName}.`);
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible abrir el documento.');
    } finally {
      this.isProcessing.set(null);
    }
  }

  async archiveDocument(systemDocument: SystemDocument): Promise<void> {
    if (systemDocument.status === DocumentStatus.Archived) {
      return;
    }

    this.isProcessing.set(systemDocument.id);

    try {
      const updated = await this.documentsService.archiveDocument(systemDocument.id);
      if (!updated) {
        return;
      }

      this.documents.update(current => current.map(item => item.id === updated.id ? updated : item));
      this.actionMessage.set(`Documento ${updated.title} archivado correctamente.`);
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible archivar el documento.');
    } finally {
      this.isProcessing.set(null);
    }
  }

  getDocumentTypeLabel(type: DocumentType): string {
    const labels: Record<DocumentType, string> = {
      [DocumentType.UserManual]: 'Manual de usuario',
      [DocumentType.TechnicalSheet]: 'Ficha tecnica',
      [DocumentType.Certificate]: 'Certificado',
      [DocumentType.Warranty]: 'Garantia',
      [DocumentType.MaintenanceGuide]: 'Guia de mantenimiento',
      [DocumentType.ServiceReport]: 'Reporte tecnico',
      [DocumentType.ProductImage]: 'Imagen tecnica',
      [DocumentType.Other]: 'Otro',
    };

    return labels[type];
  }

  getStatusBadge(status: DocumentStatus): { label: string; variant: BadgeVariant } {
    const map: Record<DocumentStatus, { label: string; variant: BadgeVariant }> = {
      [DocumentStatus.Available]: { label: 'Disponible', variant: 'success' },
      [DocumentStatus.Pending]: { label: 'Pendiente', variant: 'warning' },
      [DocumentStatus.Archived]: { label: 'Archivado', variant: 'neutral' },
    };

    return map[status];
  }

  getRelatedLabel(systemDocument: SystemDocument): string {
    if (systemDocument.productNameSnapshot) {
      return systemDocument.productNameSnapshot;
    }

    return systemDocument.relatedEntityName || 'Documento general';
  }
}
