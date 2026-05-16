// features/products/pages/product-form/product-form.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ProductsMockService } from '../../services/products.mock.service';
import { ProductCategory, ProductStatus } from '../../../../models/product.model';

@Component({
  selector: 'bc-product-form',
  standalone: true,
  imports: [
    RouterLink, NgFor, NgIf, ReactiveFormsModule,
    PageHeaderComponent, LoaderComponent, CustomSelectComponent
  ],
  templateUrl: './product-form.component.html',
  styleUrl: './product-form.component.css'
})
export class ProductFormComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private productsService = inject(ProductsMockService);

  isEditMode = false;
  productId: string | null = null;
  isLoadingData = signal(false);
  isSaving = signal(false);
  errorMessage = signal('');
  imagePreview = signal('');

  form: FormGroup = this.fb.group({
    sku: ['', [Validators.required, Validators.maxLength(50)]],
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', Validators.maxLength(500)],
    category: ['', Validators.required],
    status: [ProductStatus.Active, Validators.required],
    brand: ['', Validators.maxLength(80)],
    model: ['', Validators.maxLength(80)],
    image_url: [''],
    price_mxn: [null, [Validators.required, Validators.min(0)]],
    price_usd: [null, Validators.min(0)],
    tags_raw: [''],
  });

  readonly categories = [
    { value: ProductCategory.UltrasoundVet, label: 'Ultrasonido Veterinario' },
    { value: ProductCategory.UltrasoundHuman, label: 'Ultrasonido Humano' },
    { value: ProductCategory.Consumables, label: 'Consumibles' },
    { value: ProductCategory.SpareParts, label: 'Refacciones' },
    { value: ProductCategory.Services, label: 'Servicios' },
  ];

  readonly statuses = [
    { value: ProductStatus.Active, label: 'Activo' },
    { value: ProductStatus.Draft, label: 'Borrador' },
    { value: ProductStatus.Inactive, label: 'Inactivo' },
    { value: ProductStatus.Discontinued, label: 'Descontinuado' },
  ];

  get pageTitle(): string {
    return this.isEditMode ? 'Editar producto' : 'Nuevo producto';
  }

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Productos', routerLink: '/productos' },
      { label: this.pageTitle },
    ];
  }

  ngOnInit(): void {
    this.productId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.productId && this.route.snapshot.url.some(s => s.path === 'editar');

    if (this.isEditMode && this.productId) {
      this.isLoadingData.set(true);
      this.productsService.getProduct(this.productId).subscribe({
        next: (product) => {
          if (product) {
            this.form.patchValue({
              ...product,
              tags_raw: (product.tags ?? []).join(', '),
            });
            this.imagePreview.set(product.image_url ?? '');
          }
          this.isLoadingData.set(false);
        },
        error: () => this.isLoadingData.set(false)
      });
    }
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.errorMessage.set('Selecciona un archivo de imagen valido para el producto.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      this.form.patchValue({ image_url: result });
      this.imagePreview.set(result);
    };
    reader.readAsDataURL(file);
  }

  clearImage(): void {
    this.form.patchValue({ image_url: '' });
    this.imagePreview.set('');
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');

    const { tags_raw, ...rest } = this.form.value;
    const dto = {
      ...rest,
      image_url: rest.image_url || undefined,
      tags: tags_raw
        ? (tags_raw as string).split(',').map((t: string) => t.trim()).filter(Boolean)
        : [],
      price_mxn: Number(rest.price_mxn),
      price_usd: rest.price_usd ? Number(rest.price_usd) : undefined,
    };

    const operation = this.isEditMode && this.productId
      ? this.productsService.updateProduct(this.productId, dto)
      : this.productsService.createProduct(dto);

    operation.subscribe({
      next: (result) => {
        this.isSaving.set(false);
        if (result) {
          this.router.navigate(['/productos']);
        }
      },
      error: () => {
        this.isSaving.set(false);
        this.errorMessage.set('Ocurrio un error al guardar. Intenta de nuevo.');
      }
    });
  }

  hasError(ctrl: string, error?: string): boolean {
    const control = this.form.get(ctrl);
    if (!control?.touched) return false;
    return error ? control.hasError(error) : control.invalid;
  }
}
