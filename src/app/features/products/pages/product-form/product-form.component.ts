// features/products/pages/product-form/product-form.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ProductSupabaseService } from '../../services/product.supabase.service';
import { ProductCategory, ProductApplication, StockUnit } from '../../../../models/product.model';

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
  private productsService = inject(ProductSupabaseService);

  isEditMode = false;
  productId: string | null = null;
  isLoadingData = signal(false);
  isSaving = signal(false);
  errorMessage = signal('');
  imagePreview = signal('');
  selectedFile: File | null = null;

  form: FormGroup = this.fb.group({
    sku: ['', [Validators.required, Validators.maxLength(50)]],
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', Validators.maxLength(500)],
    category: ['', Validators.required],
    application: [ProductApplication.General, Validators.required],
    is_active: [true, Validators.required],
    brand: ['', Validators.maxLength(80)],
    model: ['', Validators.maxLength(80)],
    unit_price_mxn: [0, [Validators.required, Validators.min(0)]],
    cost_price_mxn: [0, [Validators.required, Validators.min(0)]],
    reference_price_usd: [null, Validators.min(0)],
    currency: ['MXN', Validators.required],
    unit: [StockUnit.Pieza, Validators.required],
    image_url: [''],
  });

  readonly categories = [
    { value: ProductCategory.EquipoMedico, label: 'Equipo Médico' },
    { value: ProductCategory.UltrasonidoHumano, label: 'Ultrasonido Humano' },
    { value: ProductCategory.UltrasonidoVeterinario, label: 'Ultrasonido Veterinario' },
    { value: ProductCategory.Consumible, label: 'Consumibles' },
    { value: ProductCategory.Refaccion, label: 'Refacciones' },
    { value: ProductCategory.Accesorio, label: 'Accesorios' },
    { value: ProductCategory.Servicio, label: 'Servicios' },
  ];

  readonly applications = [
    { value: ProductApplication.Humano, label: 'Uso Humano' },
    { value: ProductApplication.Veterinario, label: 'Uso Veterinario' },
    { value: ProductApplication.Ambos, label: 'Ambos' },
    { value: ProductApplication.General, label: 'General' },
  ];

  readonly units = [
    { value: StockUnit.Pieza, label: 'Pieza' },
    { value: StockUnit.Caja, label: 'Caja' },
    { value: StockUnit.Unidad, label: 'Unidad' },
    { value: StockUnit.Litro, label: 'Litro' },
    { value: StockUnit.Rollo, label: 'Rollo' },
    { value: StockUnit.Paquete, label: 'Paquete' },
    { value: StockUnit.Servicio, label: 'Servicio' },
  ];

  readonly statuses = [
    { value: 'true', label: 'Activo' },
    { value: 'false', label: 'Inactivo' },
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
      this.productsService.getProductById(this.productId).subscribe({
        next: (product) => {
          if (product) {
            this.form.patchValue({
              ...product,
              is_active: product.is_active ? 'true' : 'false'
            });

            // Cargar imagen si existe
            const primaryMedia = product.media?.find(m => m.is_primary) || product.media?.[0];
            if (primaryMedia) {
              this.imagePreview.set(primaryMedia.file_path);
              this.form.patchValue({ image_url: primaryMedia.file_path });
            }
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
      this.errorMessage.set('Selecciona un archivo de imagen válido para el producto.');
      input.value = '';
      return;
    }

    this.selectedFile = file;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      this.form.patchValue({ image_url: result });
      this.imagePreview.set(result);
    };
    reader.readAsDataURL(file);
  }

  clearImage(): void {
    this.selectedFile = null;
    this.form.patchValue({ image_url: '' });
    this.imagePreview.set('');
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');

    const dto = {
      ...this.form.value,
      is_active: this.form.value.is_active === true || this.form.value.is_active === 'true',
      unit_price_mxn: Number(this.form.value.unit_price_mxn),
      cost_price_mxn: Number(this.form.value.cost_price_mxn),
      reference_price_usd: this.form.value.reference_price_usd === null || this.form.value.reference_price_usd === ''
        ? null
        : Number(this.form.value.reference_price_usd),
    };

    delete dto.image_url;

    try {
      const result = this.isEditMode && this.productId
        ? await firstValueFrom(this.productsService.updateProduct(this.productId, dto))
        : await firstValueFrom(this.productsService.createProduct(dto));

      if (result?.id && this.selectedFile) {
        const publicUrl = await firstValueFrom(this.productsService.uploadProductImage(result.id, this.selectedFile));
        await firstValueFrom(this.productsService.saveProductMedia(result.id, publicUrl));
      } else if (result?.id && this.isEditMode && !this.imagePreview()) {
        await firstValueFrom(this.productsService.deleteProductMedia(result.id));
      }

      await this.router.navigate(['/productos']);
    } catch (error) {
      console.error('[Products] save failed', error);
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible guardar el producto.');
    } finally {
      this.isSaving.set(false);
    }
  }

  hasError(ctrl: string, error?: string): boolean {
    const control = this.form.get(ctrl);
    if (!control?.touched) return false;
    return error ? control.hasError(error) : control.invalid;
  }
}

