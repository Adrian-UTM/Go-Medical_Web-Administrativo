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
import { ProductCategory, ProductApplication, StockUnit, ProductItemType, ProductCondition, PhysicalCondition, FunctionalCondition } from '../../../../models/product.model';

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
    item_type: [ProductItemType.Product, Validators.required],
    sku: ['', [Validators.required, Validators.maxLength(50)]],
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', Validators.maxLength(500)],
    category: ['', Validators.required],
    product_condition: [ProductCondition.New],
    application: [ProductApplication.General, Validators.required],
    is_active: [true, Validators.required],
    brand: ['', Validators.maxLength(80)],
    model: ['', Validators.maxLength(80)],
    unit_price_mxn: [null as number | null, [Validators.required, Validators.min(0)]],
    cost_price_mxn: [null as number | null, [Validators.required, Validators.min(0)]],
    reference_price_usd: [null as number | null, Validators.min(0)],
    currency: ['MXN', Validators.required],
    unit: [StockUnit.Pieza, Validators.required],
    image_url: [''],
    service_duration_minutes: [null, Validators.min(0)],
    service_requires_visit: [false],
    service_includes: ['', Validators.maxLength(500)],
    service_notes: ['', Validators.maxLength(500)],
    physical_condition: [null],
    functional_condition: [null],
    inspection_date: [null],
    warranty_days: [null, Validators.min(0)],
    condition_notes: ['', Validators.maxLength(500)],
    serial_number: ['', Validators.maxLength(80)],
    included_accessories: ['', Validators.maxLength(500)],
  });

  readonly itemTypes = [
    { value: ProductItemType.Product, label: 'Producto físico' },
    { value: ProductItemType.Service, label: 'Servicio' },
  ];

  readonly productConditions = [
    { value: ProductCondition.New, label: 'Nuevo' },
    { value: ProductCondition.Preowned, label: 'Seminuevo' },
    { value: ProductCondition.Remanufactured, label: 'Remanufacturado' },
  ];

  readonly physicalConditions = [
    { value: PhysicalCondition.Excellent, label: 'Excelente' },
    { value: PhysicalCondition.Good, label: 'Bueno' },
    { value: PhysicalCondition.Fair, label: 'Regular' },
    { value: PhysicalCondition.Poor, label: 'Deficiente' },
  ];

  readonly functionalConditions = [
    { value: FunctionalCondition.Operational, label: 'Operativo' },
    { value: FunctionalCondition.RequiresService, label: 'Requiere servicio' },
    { value: FunctionalCondition.NotOperational, label: 'No operativo' },
  ];
  readonly categories = [
    { value: ProductCategory.EquipoMedico, label: 'Equipo Médico' },
    { value: ProductCategory.UltrasonidoHumano, label: 'Ultrasonido Humano' },
    { value: ProductCategory.UltrasonidoVeterinario, label: 'Ultrasonido Veterinario' },
    { value: ProductCategory.Consumible, label: 'Consumibles' },
    { value: ProductCategory.Refaccion, label: 'Refacciones' },
    { value: ProductCategory.Accesorio, label: 'Accesorios' },
    { value: ProductCategory.Servicio, label: 'Servicios' },
  ];

  get filteredCategories() {
    if (this.isService) {
      return this.categories.filter(c => c.value === ProductCategory.Servicio);
    } else {
      return this.categories.filter(c => c.value !== ProductCategory.Servicio);
    }
  }

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

  get isService(): boolean {
    return this.form.get('item_type')?.value === ProductItemType.Service;
  }

  get isPhysicalProduct(): boolean {
    return !this.isService;
  }

  get isPreowned(): boolean {
    const condition = this.form.get('product_condition')?.value;
    return this.isPhysicalProduct && (condition === ProductCondition.Preowned || condition === ProductCondition.Remanufactured);
  }

  get nameLabel(): string {
    return this.isService ? 'Nombre del servicio' : 'Nombre del producto';
  }

  get skuLabel(): string {
    return this.isService ? 'Código del servicio' : 'SKU';
  }

  get priceLabel(): string {
    return this.isService ? 'Precio base MXN' : 'Precio venta MXN';
  }

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
    this.form.get('item_type')?.valueChanges.subscribe(value => this.applyItemTypeRules(value));
    this.form.get('product_condition')?.valueChanges.subscribe(value => this.applyConditionRules(value));
    this.productId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.productId;

    if (this.isEditMode && this.productId) {
      this.isLoadingData.set(true);
      this.productsService.getProductById(this.productId).subscribe({
        next: (product) => {
          if (product) {
            this.form.patchValue({
              ...product,
              item_type: product.item_type ?? ProductItemType.Product,
              product_condition: product.product_condition ?? ProductCondition.New,
              is_active: product.is_active ? 'true' : 'false'
            });
            this.applyItemTypeRules(this.form.get('item_type')?.value, false);
            this.applyConditionRules(this.form.get('product_condition')?.value, false);

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
    } else {
      this.applyItemTypeRules(this.form.get('item_type')?.value, false);
      this.applyConditionRules(this.form.get('product_condition')?.value, false);
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
      ...this.form.getRawValue(),
      is_active: this.form.value.is_active === true || this.form.value.is_active === 'true',
      unit_price_mxn: Number(this.form.value.unit_price_mxn),
      cost_price_mxn: Number(this.form.value.cost_price_mxn),
      reference_price_usd: this.form.value.reference_price_usd === null || this.form.value.reference_price_usd === ''
        ? null
        : Number(this.form.value.reference_price_usd),
    };

    delete dto.image_url;
    this.normalizeDtoByType(dto);

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

  private applyItemTypeRules(itemType: unknown, emitEvent = true): void {
    if (itemType === ProductItemType.Service) {
      this.form.patchValue({
        product_condition: null,
        category: ProductCategory.Servicio,
        application: ProductApplication.General,
        unit: StockUnit.Servicio,
        cost_price_mxn: null,
        reference_price_usd: null,
        brand: '',
        model: '',
        physical_condition: null,
        functional_condition: null,
        inspection_date: null,
        warranty_days: null,
        condition_notes: '',
        serial_number: '',
        included_accessories: '',
      }, { emitEvent });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (!this.form.get('product_condition')?.value) {
      updates['product_condition'] = ProductCondition.New;
    }
    if (this.form.get('category')?.value === ProductCategory.Servicio) {
      updates['category'] = '';
    }
    if (this.form.get('unit')?.value === StockUnit.Servicio) {
      updates['unit'] = StockUnit.Pieza;
    }
    if (Object.keys(updates).length > 0) {
      this.form.patchValue(updates, { emitEvent });
    }
  }

  private applyConditionRules(condition: unknown, emitEvent = true): void {
    if (condition !== ProductCondition.Preowned && condition !== ProductCondition.Remanufactured) {
      this.form.patchValue({
        physical_condition: null,
        functional_condition: null,
        inspection_date: null,
        warranty_days: null,
        condition_notes: '',
        serial_number: '',
        included_accessories: '',
      }, { emitEvent });
    }
  }

  private normalizeDtoByType(dto: any): void {
    if (dto.item_type === ProductItemType.Service) {
      dto.product_condition = null;
      dto.service_requires_visit = !!dto.service_requires_visit;
      dto.service_duration_minutes = dto.service_duration_minutes === null || dto.service_duration_minutes === '' ? null : Number(dto.service_duration_minutes);
      dto.physical_condition = null;
      dto.functional_condition = null;
      dto.inspection_date = null;
      dto.warranty_days = null;
      dto.condition_notes = null;
      dto.serial_number = null;
      dto.included_accessories = null;
      return;
    }

    dto.item_type = ProductItemType.Product;
    dto.product_condition = dto.product_condition || ProductCondition.New;
    dto.service_duration_minutes = null;
    dto.service_requires_visit = false;
    dto.service_includes = null;
    dto.service_notes = null;

    if (dto.product_condition !== ProductCondition.Preowned && dto.product_condition !== ProductCondition.Remanufactured) {
      dto.physical_condition = null;
      dto.functional_condition = null;
      dto.inspection_date = null;
      dto.warranty_days = null;
      dto.condition_notes = null;
      dto.serial_number = null;
      dto.included_accessories = null;
    } else {
      dto.warranty_days = dto.warranty_days === null || dto.warranty_days === '' ? null : Number(dto.warranty_days);
    }
  }
  hasError(ctrl: string, error?: string): boolean {
    const control = this.form.get(ctrl);
    if (!control?.touched) return false;
    return error ? control.hasError(error) : control.invalid;
  }
}

