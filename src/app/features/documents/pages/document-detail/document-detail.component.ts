import { Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { ProductCategory } from '../../../../models/product.model';
import { DocumentsSupabaseService } from '../../services/documents.supabase.service';
import { DocumentStatus, DocumentType, RelatedEntityType, SystemDocument } from '../../models/document.model';

@Component({
  selector: 'bc-document-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    DatePipe,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoaderComponent,
  ],
  templateUrl: './document-detail.component.html',
  styleUrl: './document-detail.component.css',
})
export class DocumentDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly documentsService = inject(DocumentsSupabaseService);

  readonly isLoading = signal(true);
  readonly isProcessing = signal(false);
  readonly documentRecord = signal<SystemDocument | null>(null);
  readonly actionMessage = signal('');
  readonly productCategoryLabel = signal('');

  constructor() {
    void this.loadDocument();
  }

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Documentos', routerLink: '/documentos' },
      { label: this.documentRecord()?.title ?? 'Detalle' },
    ];
  }

  async loadDocument(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');

    if (!id) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);

    try {
      const systemDocument = await this.documentsService.getDocumentById(id);

      if (!systemDocument) {
        this.documentRecord.set(null);
        return;
      }

      this.documentRecord.set(systemDocument);

      if (systemDocument.productId) {
        const product = await this.documentsService.getProductById(systemDocument.productId);
        this.productCategoryLabel.set(product ? this.getCategoryLabel(product.category) : '');
      }
    } catch (error) {
      this.documentRecord.set(null);
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible cargar el documento.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async downloadDocument(): Promise<void> {
    const systemDocument = this.documentRecord();
    if (!systemDocument) {
      return;
    }

    this.isProcessing.set(true);

    try {
      await this.documentsService.triggerMockDownload(systemDocument);
      this.actionMessage.set(`Documento abierto para ${systemDocument.fileName}.`);
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible abrir el documento.');
    } finally {
      this.isProcessing.set(false);
    }
  }

  async archiveDocument(): Promise<void> {
    const systemDocument = this.documentRecord();
    if (!systemDocument || systemDocument.status === DocumentStatus.Archived) {
      return;
    }

    this.isProcessing.set(true);

    try {
      const updated = await this.documentsService.archiveDocument(systemDocument.id);
      if (!updated) {
        return;
      }

      this.documentRecord.set(updated);
      this.actionMessage.set(`Documento ${updated.title} archivado correctamente.`);
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible archivar el documento.');
    } finally {
      this.isProcessing.set(false);
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

  getRelatedEntityLabel(type: RelatedEntityType): string {
    const labels: Record<RelatedEntityType, string> = {
      [RelatedEntityType.Product]: 'Producto',
      [RelatedEntityType.Equipment]: 'Equipo',
      [RelatedEntityType.Client]: 'Cliente',
      [RelatedEntityType.Ticket]: 'Ticket',
      [RelatedEntityType.General]: 'General',
    };

    return labels[type];
  }

  private getCategoryLabel(category: ProductCategory): string {
    const labels: Record<string, string> = {
      [ProductCategory.EquipoMedico]: 'Equipo medico',
      [ProductCategory.UltrasonidoHumano]: 'Ultrasonido humano',
      [ProductCategory.UltrasonidoVeterinario]: 'Ultrasonido veterinario',
      [ProductCategory.Consumible]: 'Consumibles',
      [ProductCategory.Refaccion]: 'Refacciones',
      [ProductCategory.Accesorio]: 'Accesorios',
      [ProductCategory.Servicio]: 'Servicios',
      [ProductCategory.UltrasoundVet]: 'Ultrasonido veterinario',
      [ProductCategory.UltrasoundHuman]: 'Ultrasonido humano',
      [ProductCategory.Consumables]: 'Consumibles',
      [ProductCategory.SpareParts]: 'Refacciones',
      [ProductCategory.Services]: 'Servicios',
    };

    return labels[category] ?? 'Sin categoria';
  }
}
