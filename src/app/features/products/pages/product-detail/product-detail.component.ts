import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgFor, NgIf, CurrencyPipe, DatePipe } from '@angular/common';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { ProductSupabaseService } from '../../services/product.supabase.service';
import { DocumentsSupabaseService } from '../../../documents/services/documents.supabase.service';
import { DocumentStatus, DocumentType, RelatedEntityType, SystemDocument } from '../../../documents/models/document.model';
import { Product, ProductCategory } from '../../../../models/product.model';

@Component({
  selector: 'bc-product-detail',
  standalone: true,
  imports: [
    RouterLink, NgFor, NgIf, CurrencyPipe, DatePipe,
    PageHeaderComponent, StatusBadgeComponent, LoaderComponent
  ],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.css'
})
export class ProductDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private productsService = inject(ProductSupabaseService);
  private documentsService = inject(DocumentsSupabaseService);

  private readonly technicalDocumentTypes = new Set<DocumentType>([
    DocumentType.UserManual,
    DocumentType.TechnicalSheet,
    DocumentType.Certificate,
    DocumentType.Warranty,
    DocumentType.MaintenanceGuide,
  ]);

  product = signal<Product | null>(null);
  technicalDocuments = signal<SystemDocument[]>([]);
  isLoading = signal(true);
  areDocumentsLoading = signal(false);
  isDeleting = signal(false);
  processingDocumentId = signal<string | null>(null);
  actionMessage = signal('');

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Productos', routerLink: '/productos' },
      { label: this.product()?.name ?? 'Detalle' },
    ];
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.productsService.getProductById(id).subscribe({
      next: (p) => {
        this.product.set(p);
        this.isLoading.set(false);
        if (p) {
          void this.loadTechnicalDocuments(p.id);
        }
      },
      error: () => this.isLoading.set(false)
    });
  }

  async deleteProduct(): Promise<void> {
    const currentProduct = this.product();
    if (!currentProduct) {
      return;
    }

    const confirmed = window.confirm(`Se eliminara el producto ${currentProduct.name}. Esta accion quitara el registro del catalogo actual. Deseas continuar?`);
    if (!confirmed) {
      return;
    }

    this.isDeleting.set(true);
    this.productsService.deleteProduct(currentProduct.id).subscribe({
      next: async () => {
        this.isDeleting.set(false);
        await this.router.navigate(['/productos']);
      },
      error: () => {
        this.isDeleting.set(false);
        this.actionMessage.set('No fue posible eliminar el producto. Intenta nuevamente.');
      }
    });
  }

  async addTechnicalDocument(): Promise<void> {
    const currentProduct = this.product();
    if (!currentProduct) {
      return;
    }

    await this.router.navigate(['/documentos/nuevo'], {
      queryParams: {
        productId: currentProduct.id,
        relatedEntityType: RelatedEntityType.Product,
      },
    });
  }

  async downloadDocument(systemDocument: SystemDocument): Promise<void> {
    this.processingDocumentId.set(systemDocument.id);
    this.actionMessage.set('');

    try {
      await this.documentsService.triggerMockDownload(systemDocument);
    } catch {
      this.actionMessage.set('No fue posible descargar el documento tecnico. Intenta nuevamente.');
    } finally {
      this.processingDocumentId.set(null);
    }
  }

  async archiveDocument(systemDocument: SystemDocument): Promise<void> {
    if (systemDocument.status === DocumentStatus.Archived) {
      return;
    }

    const confirmed = window.confirm(`Se archivara el documento ${systemDocument.title}. Deseas continuar?`);
    if (!confirmed) {
      return;
    }

    this.processingDocumentId.set(systemDocument.id);
    this.actionMessage.set('');

    try {
      await this.documentsService.archiveDocument(systemDocument.id);
      const currentProduct = this.product();
      if (currentProduct) {
        await this.loadTechnicalDocuments(currentProduct.id);
      }
    } catch {
      this.actionMessage.set('No fue posible archivar el documento tecnico. Intenta nuevamente.');
    } finally {
      this.processingDocumentId.set(null);
    }
  }

  getCategoryLabel(cat: ProductCategory): string {
    const labels: Record<string, string> = {
      [ProductCategory.EquipoMedico]: 'Equipo Médico',
      [ProductCategory.UltrasonidoHumano]: 'Ultrasonido Humano',
      [ProductCategory.UltrasonidoVeterinario]: 'Ultrasonido Veterinario',
      [ProductCategory.Consumible]: 'Consumibles',
      [ProductCategory.Refaccion]: 'Refacciones',
      [ProductCategory.Accesorio]: 'Accesorios',
      [ProductCategory.Servicio]: 'Servicios',
    };
    return labels[cat] ?? cat;
  }

  getStatusBadge(isActive: boolean | undefined): { label: string; variant: BadgeVariant } {
    if (isActive) {
      return { label: 'Activo', variant: 'success' };
    }
    return { label: 'Inactivo', variant: 'neutral' };
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
    return labels[type] ?? type;
  }

  getDocumentStatusBadge(status: DocumentStatus): { label: string; variant: BadgeVariant } {
    const map: Record<DocumentStatus, { label: string; variant: BadgeVariant }> = {
      [DocumentStatus.Available]: { label: 'Disponible', variant: 'success' },
      [DocumentStatus.Pending]: { label: 'Pendiente', variant: 'warning' },
      [DocumentStatus.Archived]: { label: 'Archivado', variant: 'neutral' },
    };

    return map[status] ?? { label: status, variant: 'neutral' };
  }

  getDocumentMeta(systemDocument: SystemDocument): string {
    const parts = [systemDocument.fileName, systemDocument.fileSizeLabel, systemDocument.fileExtension.toUpperCase()];
    return parts.filter(Boolean).join(' · ');
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return '';
    const mb = bytes / 1_000_000;
    return mb < 1 ? `${Math.round(bytes / 1000)} KB` : `${mb.toFixed(1)} MB`;
  }

  getSpecGroups(product: Product): string[] {
    return [...new Set((product.specs ?? []).map(s => s.spec_group ?? 'General'))];
  }

  getSpecsByGroup(product: Product, group: string) {
    return (product.specs ?? [])
      .filter(s => (s.spec_group ?? 'General') === group)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  private async loadTechnicalDocuments(productId: string): Promise<void> {
    this.areDocumentsLoading.set(true);
    this.actionMessage.set('');

    try {
      const documents = await this.documentsService.getDocuments({ productId });
      this.technicalDocuments.set(
        documents.filter(document => this.technicalDocumentTypes.has(document.documentType))
      );
    } catch {
      this.technicalDocuments.set([]);
      this.actionMessage.set('No fue posible cargar los documentos tecnicos del producto.');
    } finally {
      this.areDocumentsLoading.set(false);
    }
  }
}

