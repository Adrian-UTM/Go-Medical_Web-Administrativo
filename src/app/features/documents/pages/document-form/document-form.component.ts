import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { startWith } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { Product, ProductCategory } from '../../../../models/product.model';
import { DocumentsMockService } from '../../services/documents.mock.service';
import { DocumentStatus, DocumentType, RelatedEntityType } from '../../models/document.model';

@Component({
  selector: 'bc-document-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    LoaderComponent,
    CustomSelectComponent,
  ],
  templateUrl: './document-form.component.html',
  styleUrl: './document-form.component.css',
})
export class DocumentFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly documentsService = inject(DocumentsMockService);

  readonly isLoadingData = signal(true);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly products = signal<Product[]>([]);
  readonly selectedProduct = signal<Product | null>(null);

  readonly typeOptions = [
    { value: DocumentType.UserManual, label: 'Manual de usuario' },
    { value: DocumentType.TechnicalSheet, label: 'Ficha tecnica' },
    { value: DocumentType.Certificate, label: 'Certificado' },
    { value: DocumentType.Warranty, label: 'Garantia' },
    { value: DocumentType.MaintenanceGuide, label: 'Guia de mantenimiento' },
    { value: DocumentType.ServiceReport, label: 'Reporte tecnico' },
    { value: DocumentType.ProductImage, label: 'Imagen tecnica' },
    { value: DocumentType.Other, label: 'Otro' },
  ];

  readonly relatedEntityOptions = [
    { value: RelatedEntityType.Product, label: 'Producto' },
    { value: RelatedEntityType.Equipment, label: 'Equipo' },
    { value: RelatedEntityType.General, label: 'General' },
  ];

  readonly statusOptions = [
    { value: DocumentStatus.Available, label: 'Disponible' },
    { value: DocumentStatus.Pending, label: 'Pendiente' },
    { value: DocumentStatus.Archived, label: 'Archivado' },
  ];

  readonly productOptions = computed(() =>
    this.products().map(product => ({
      value: product.id,
      label: `${product.sku} · ${product.name}`,
    }))
  );

  readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(180)]],
    documentType: [DocumentType.UserManual, Validators.required],
    relatedEntityType: [RelatedEntityType.Product, Validators.required],
    productId: ['', Validators.required],
    equipmentSerialNumber: [''],
    fileName: ['', [Validators.required, Validators.maxLength(120)]],
    status: [DocumentStatus.Available, Validators.required],
    notes: ['', Validators.maxLength(1000)],
  });

  constructor() {
    this.form.get('relatedEntityType')?.valueChanges
      .pipe(
        startWith(this.form.get('relatedEntityType')?.value),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(value => this.updateProductRequirement(value as RelatedEntityType));

    void this.initialize();
  }

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Documentos', routerLink: '/documentos' },
      { label: 'Nuevo documento' },
    ];
  }

  async initialize(): Promise<void> {
    this.isLoadingData.set(true);
    this.products.set(await this.documentsService.getAvailableProducts());

    const preselectedEntity = this.route.snapshot.queryParamMap.get('relatedEntityType');
    const preselectedProductId = this.route.snapshot.queryParamMap.get('productId');

    if (preselectedEntity && Object.values(RelatedEntityType).includes(preselectedEntity as RelatedEntityType)) {
      this.form.patchValue({ relatedEntityType: preselectedEntity as RelatedEntityType });
    }

    if (preselectedProductId) {
      this.form.patchValue({ productId: preselectedProductId });
      this.onProductSelected(preselectedProductId);
    }

    this.isLoadingData.set(false);
  }

  onProductSelected(productId: string): void {
    const product = this.products().find(item => item.id === productId) ?? null;
    this.selectedProduct.set(product);
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Completa los campos requeridos antes de registrar el documento.');
      return;
    }

    const raw = this.form.getRawValue();
    this.isSaving.set(true);
    this.errorMessage.set('');

    try {
      const created = await this.documentsService.createDocument({
        title: raw.title ?? '',
        documentType: raw.documentType ?? DocumentType.UserManual,
        relatedEntityType: raw.relatedEntityType ?? RelatedEntityType.Product,
        productId: raw.productId || undefined,
        equipmentSerialNumber: raw.equipmentSerialNumber || undefined,
        fileName: raw.fileName ?? '',
        status: raw.status ?? DocumentStatus.Available,
        notes: raw.notes ?? '',
        uploadedBy: 'Usuario administrativo',
      });

      await this.router.navigate(['/documentos', created.id]);
    } catch {
      this.errorMessage.set('No fue posible registrar el documento mock. Intenta nuevamente.');
    } finally {
      this.isSaving.set(false);
    }
  }

  hasError(controlName: string, errorName?: string): boolean {
    const control = this.form.get(controlName);
    if (!control || !(control.touched || control.dirty)) {
      return false;
    }

    return errorName ? control.hasError(errorName) : control.invalid;
  }

  getCategoryLabel(category: ProductCategory): string {
    const labels: Record<ProductCategory, string> = {
      [ProductCategory.UltrasoundVet]: 'Ultrasonido veterinario',
      [ProductCategory.UltrasoundHuman]: 'Ultrasonido humano',
      [ProductCategory.Consumables]: 'Consumibles',
      [ProductCategory.SpareParts]: 'Refacciones',
      [ProductCategory.Services]: 'Servicios',
    };

    return labels[category];
  }

  private updateProductRequirement(entityType: RelatedEntityType): void {
    const productControl = this.form.get('productId');
    if (!productControl) {
      return;
    }

    if ([RelatedEntityType.Product, RelatedEntityType.Equipment].includes(entityType)) {
      productControl.setValidators([Validators.required]);
    } else {
      productControl.clearValidators();
      productControl.setValue('', { emitEvent: false });
      this.selectedProduct.set(null);
    }

    productControl.updateValueAndValidity({ emitEvent: false });
  }
}
