import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgFor, NgIf, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ActionMenuComponent } from '../../../../shared/components/action-menu/action-menu.component';
import { ProductSupabaseService } from '../../services/product.supabase.service';
import {
  ProductPromotion,
  ProductPromotionPayload,
  ProductPromotionsSupabaseService,
  PromotionDiscountType,
} from '../../services/product-promotions.supabase.service';
import { Product, ProductCategory, ProductFilters, ProductItemType, ProductCondition } from '../../../../models/product.model';
import { PageVisibilityService } from '../../../../core/services/page-visibility.service';
import { AuthService } from '../../../../core/services/auth.service';

type PromotionModalMode = 'create' | 'view' | 'edit';
type ProductsPanel = 'catalog' | 'promotions';
type PromotionPanelTab = 'active' | 'scheduled' | 'special' | 'history';
type PromotionStatusFilter = '' | 'active' | 'scheduled' | 'inactive' | 'expired' | 'cancelled';
type PromotionKindForm = 'normal' | 'special_campaign';
type QuickValidity = 'today' | 'tomorrow' | '7d' | '15d' | '30d' | 'weekend' | 'custom';

@Component({
  selector: 'bc-product-list',
  standalone: true,
  imports: [
    RouterLink, NgFor, NgIf, CurrencyPipe, FormsModule,
    PageHeaderComponent, StatusBadgeComponent, LoaderComponent, EmptyStateComponent, CustomSelectComponent, ActionMenuComponent
  ],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.css'
})
export class ProductListComponent implements OnInit {
  private productsService = inject(ProductSupabaseService);
  private promotionsService = inject(ProductPromotionsSupabaseService);
  private readonly pageVisibility = inject(PageVisibilityService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);

  private loadInFlight = false;

  products = signal<Product[]>([]);
  isLoading = signal(false);
  deletingId = signal('');
  actionMessage = signal('');
  promotionMessage = signal('');
  promotionErrorMessage = signal('');
  promotionSaving = signal(false);
  promotionModalOpen = signal(false);
  promotionAdditionalOpen = signal(false);
  promotionModalMode = signal<PromotionModalMode>('create');
  selectedPromotionProduct = signal<Product | null>(null);
  selectedPromotion = signal<ProductPromotion | null>(null);
  activePromotions = signal<Record<string, ProductPromotion>>({});
  promotionValidationErrors = signal<string[]>([]);
  productsPanel = signal<ProductsPanel>('catalog');
  promotionsPanelTab = signal<PromotionPanelTab>('active');
  allPromotions = signal<ProductPromotion[]>([]);
  promotionProducts = signal<Record<string, Product>>({});
  promotionsLoading = signal(false);
  promotionsLoaded = signal(false);
  promotionsSearchTerm = signal('');
  promotionsStatusFilter = signal<PromotionStatusFilter>('');

  searchTerm = '';
  selectedCategory = '';
  selectedStatus = '';
  activeTab: ProductItemType = ProductItemType.Product;
  selectedCondition: '' | ProductCondition = '';

  readonly categories: { value: string; label: string }[] = [
    { value: '', label: 'Todas las categorías' },
    { value: ProductCategory.EquipoMedico, label: 'Equipo médico' },
    { value: ProductCategory.UltrasonidoHumano, label: 'Ultrasonido humano' },
    { value: ProductCategory.UltrasonidoVeterinario, label: 'Ultrasonido veterinario' },
    { value: ProductCategory.Consumible, label: 'Consumibles' },
    { value: ProductCategory.Refaccion, label: 'Refacciones' },
    { value: ProductCategory.Accesorio, label: 'Accesorios' },
    { value: ProductCategory.Servicio, label: 'Servicios' },
  ];

  get filteredCategories() {
    if (this.activeTab === ProductItemType.Product) {
      return this.categories.filter(c => c.value !== ProductCategory.Servicio);
    }
    return this.categories.filter(c => c.value === '' || c.value === ProductCategory.Servicio);
  }

  readonly conditionOptions: { value: '' | ProductCondition; label: string }[] = [
    { value: '', label: 'Todos' },
    { value: ProductCondition.New, label: 'Nuevos' },
    { value: ProductCondition.Preowned, label: 'Seminuevos' },
    { value: ProductCondition.Remanufactured, label: 'Remanufacturados' },
  ];
  readonly statuses: { value: string; label: string }[] = [
    { value: '', label: 'Todos los estados' },
    { value: 'true', label: 'Activo' },
    { value: 'false', label: 'Inactivo' },
  ];

  readonly promotionStatusOptions: { value: PromotionStatusFilter; label: string }[] = [
    { value: '', label: 'Estado: Todos' },
    { value: 'active', label: 'Activas' },
    { value: 'scheduled', label: 'Programadas' },
    { value: 'inactive', label: 'Inactivas' },
    { value: 'expired', label: 'Vencidas' },
    { value: 'cancelled', label: 'Canceladas' },
  ];

  readonly promotionStats = computed(() => {
    const promotions = this.allPromotions();
    return {
      active: promotions.filter(promotion => this.getPromotionComputedStatus(promotion) === 'active').length,
      scheduled: promotions.filter(promotion => this.getPromotionComputedStatus(promotion) === 'scheduled').length,
      special: promotions.filter(promotion => this.isSpecialPromotion(promotion)).length,
      history: promotions.filter(promotion => ['inactive', 'expired', 'cancelled'].includes(this.getPromotionComputedStatus(promotion))).length,
    };
  });

  readonly filteredPromotions = computed(() => {
    const query = this.promotionsSearchTerm().trim().toLowerCase();
    const statusFilter = this.promotionsStatusFilter();
    const tab = this.promotionsPanelTab();

    return this.allPromotions().filter(promotion => {
      const product = this.getPromotionProduct(promotion);
      const status = this.getPromotionComputedStatus(promotion);
      const matchesTab =
        (tab === 'active' && status === 'active') ||
        (tab === 'scheduled' && status === 'scheduled') ||
        (tab === 'special' && this.isSpecialPromotion(promotion)) ||
        (tab === 'history' && ['inactive', 'expired', 'cancelled'].includes(status));
      const matchesStatus = !statusFilter || status === statusFilter;
      const matchesQuery = !query || [
        promotion.name,
        promotion.description ?? '',
        promotion.internal_notes ?? '',
        product?.name ?? '',
        product?.sku ?? '',
      ].some(value => String(value).toLowerCase().includes(query));

      return matchesTab && matchesStatus && matchesQuery;
    });
  });

  promotionForm: {
    product_id: string;
    name: string;
    description: string;
    promotion_kind: PromotionKindForm;
    campaign_name: string;
    custom_campaign_name: string;
    discount_type: PromotionDiscountType;
    discount_value: number | null;
    start_date: string;
    start_time: string;
    end_date: string;
    end_time: string;
    is_enabled: boolean;
    quick_validity: QuickValidity;
    internal_notes: string;
  } = this.getEmptyPromotionForm();

  readonly specialCampaignOptions = [
    'Hot Sale',
    'Buen Fin',
    'Navidad',
    'Año Nuevo',
    'Día del Médico',
    'Aniversario Go Medical',
    'Otra campaña',
  ];

  readonly quickValidityOptions: { value: QuickValidity; label: string }[] = [
    { value: 'today', label: 'Hoy' },
    { value: 'tomorrow', label: 'Mañana' },
    { value: '7d', label: '7 días' },
    { value: '15d', label: '15 días' },
    { value: '30d', label: '30 días' },
    { value: 'weekend', label: 'Fin de semana' },
    { value: 'custom', label: 'Personalizado' },
  ];

  readonly promotionProductOptions = computed(() => [
    { value: '', label: 'Buscar y seleccionar producto' },
    ...Object.values(this.promotionProducts()).map(product => ({
      value: product.id,
      label: `${product.sku} · ${product.name}`,
    })),
  ]);

  ngOnInit(): void {
    this.loadProducts();

    this.pageVisibility.visible$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadProducts();
      });
  }

  loadProducts(): void {
    if (this.loadInFlight) {
      return;
    }

    this.loadInFlight = true;
    this.isLoading.set(true);
    const filters: ProductFilters = {
      search: this.searchTerm || undefined,
      category: this.selectedCategory as ProductCategory || undefined,
      is_active: this.selectedStatus === '' ? undefined : this.selectedStatus === 'true',
      item_type: this.activeTab,
      product_condition: this.activeTab === ProductItemType.Product ? this.selectedCondition || undefined : undefined,
    };

    this.productsService.getProducts(filters)
      .pipe(
        finalize(() => {
          this.loadInFlight = false;
          this.isLoading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (res) => {
          const sortedProducts = this.sortProductsByName(res);
          this.products.set(sortedProducts);
          void this.loadActivePromotions(sortedProducts);
        },
        error: () => {
          this.products.set([]);
          this.activePromotions.set({});
        }
      });
  }

  private sortProductsByName(products: Product[]): Product[] {
    return [...products].sort((a, b) =>
      String(a.name ?? '').localeCompare(String(b.name ?? ''), 'es-MX', { sensitivity: 'base' })
    );
  }

  async openPromotionModal(product: Product, mode: PromotionModalMode = 'create'): Promise<void> {
    if (!this.canManagePromotions) {
      this.promotionErrorMessage.set('Solo usuarios admin pueden administrar promociones.');
      return;
    }

    this.productsPanel.set('promotions');
    await this.loadPromotionsPanel();
    this.selectedPromotionProduct.set(product);
    this.promotionModalMode.set(mode);
    this.promotionValidationErrors.set([]);
    this.promotionErrorMessage.set('');
    this.promotionAdditionalOpen.set(false);
    this.promotionForm = this.getEmptyPromotionForm(product);
    this.selectedPromotion.set(null);
    this.promotionModalOpen.set(true);
    this.scrollPromotionEditorIntoView();

    try {
      const promotion = await this.promotionsService.getPromotionByProductId(product.id);
      if (promotion && mode !== 'create') {
        this.selectedPromotion.set(promotion);
        this.promotionForm = this.mapPromotionToForm(promotion);
      }
    } catch (error) {
      this.promotionErrorMessage.set(error instanceof Error ? error.message : 'No fue posible consultar la promoción.');
    }
  }

  closePromotionModal(): void {
    if (this.promotionSaving()) {
      return;
    }
    this.promotionModalOpen.set(false);
    this.promotionAdditionalOpen.set(false);
    this.selectedPromotionProduct.set(null);
    this.selectedPromotion.set(null);
    this.promotionValidationErrors.set([]);
    this.promotionErrorMessage.set('');
  }

  setPromotionEditMode(): void {
    this.promotionModalMode.set('edit');
    this.promotionValidationErrors.set([]);
  }

  async savePromotion(): Promise<void> {
    const product = this.selectedPromotionProduct();
    if (!product || this.promotionModalMode() === 'view') {
      return;
    }

    const validationErrors = this.validatePromotionForm(product);
    this.promotionValidationErrors.set(validationErrors);
    if (validationErrors.length > 0) {
      return;
    }

    this.promotionSaving.set(true);
    this.promotionErrorMessage.set('');

    const payload = this.buildPromotionPayload();

    try {
      const currentPromotion = this.selectedPromotion();
      let savedPromotion: ProductPromotion;
      if (currentPromotion) {
        savedPromotion = await this.promotionsService.updatePromotion(currentPromotion.id, payload);
        this.promotionMessage.set('Promoción actualizada correctamente.');
      } else {
        savedPromotion = await this.promotionsService.createPromotion(product.id, payload);
        this.promotionMessage.set('Promoción guardada correctamente.');
      }

      this.productsPanel.set('promotions');
      this.promotionsSearchTerm.set('');
      this.promotionsStatusFilter.set('');
      this.promotionsPanelTab.set(this.getPromotionPanelTab(savedPromotion));
      await this.refreshPromotionForProduct(product.id);
      await this.loadPromotionsPanel(true);
      this.ensureSavedPromotionInPanel(savedPromotion, product);
      this.closePromotionModal();
      this.scrollPromotionsPanelIntoView();
      setTimeout(() => this.promotionMessage.set(''), 5000);
    } catch (error) {
      this.promotionErrorMessage.set(error instanceof Error ? error.message : 'No fue posible guardar la promoción.');
    } finally {
      this.promotionSaving.set(false);
    }
  }

  async cancelPromotion(product: Product): Promise<void> {
    const promotion = this.getProductPromotion(product);
    if (!promotion) {
      return;
    }

    const reason = window.prompt('Motivo de cancelación de la promoción (opcional):') ?? '';
    const confirmed = window.confirm(`Se cancelará la promoción de "${product.name}". Esta acción no elimina el historial. ¿Deseas continuar?`);
    if (!confirmed) {
      return;
    }

    this.promotionErrorMessage.set('');

    try {
      await this.promotionsService.cancelPromotion(promotion.id, reason.trim() || undefined);
      await this.refreshPromotionForProduct(product.id);
      if (this.promotionsLoaded()) {
        await this.loadPromotionsPanel(true);
      }
      this.promotionMessage.set('Promoción cancelada correctamente.');
      setTimeout(() => this.promotionMessage.set(''), 5000);
    } catch (error) {
      this.promotionErrorMessage.set(error instanceof Error ? error.message : 'No fue posible cancelar la promoción.');
    }
  }

  getProductPromotion(product: Product): ProductPromotion | null {
    return this.activePromotions()[product.id] ?? null;
  }

  getProductPrice(product: Product): number {
    return Number(product.unit_price_mxn ?? product.price_mxn ?? 0);
  }

  getPromotionalPrice(product: Product): number {
    const promotion = this.getProductPromotion(product);
    if (!promotion) {
      return this.getProductPrice(product);
    }

    return this.promotionsService.calculatePromotionalPrice(
      this.getProductPrice(product),
      'percentage',
      promotion.discount_value
    );
  }

  getPromotionStatusLabel(product: Product): string {
    const promotion = this.getProductPromotion(product);
    if (!promotion) {
      return '';
    }

    const status = this.promotionsService.getComputedStatus(promotion);
    if (status === 'scheduled') return 'Promoción programada';
    if (status === 'expired') return 'Vencida';
    if (status === 'cancelled') return 'Cancelada';
    return 'Promoción activa';
  }

  getPromotionModalTitle(): string {
    const mode = this.promotionModalMode();
    if (mode === 'view') return 'Promoción actual';
    if (this.selectedPromotion()) return 'Editar promoción';
    return 'Crear promoción';
  }

  getCalculatedPromotionPrice(): number {
    const product = this.selectedPromotionProduct();
    if (!product) {
      return 0;
    }

    return this.promotionsService.calculatePromotionalPrice(
      this.getProductPrice(product),
      'percentage',
      Number(this.promotionForm.discount_value ?? 0)
    );
  }

  private async loadActivePromotions(products: Product[]): Promise<void> {
    try {
      const promotions = await this.promotionsService.getPromotionsByProductIds(products.map(product => product.id));
      const currentPromotions = promotions.filter(promotion => {
        const status = this.promotionsService.getComputedStatus(promotion);
        return status === 'active' || status === 'scheduled';
      });
      this.activePromotions.set(Object.fromEntries(currentPromotions.map(promotion => [promotion.product_id, promotion])));
      this.promotionErrorMessage.set('');
    } catch (error) {
      this.activePromotions.set({});
      this.promotionErrorMessage.set(error instanceof Error ? error.message : 'No fue posible cargar promociones.');
    }
  }

  private async refreshPromotionForProduct(productId: string): Promise<void> {
    const promotions = await this.promotionsService.getPromotionsByProductId(productId);
    const promotion = promotions.find(item => {
      const status = this.promotionsService.getComputedStatus(item);
      return status === 'active' || status === 'scheduled';
    }) ?? null;
    this.activePromotions.update(current => {
      const next = { ...current };
      if (promotion) {
        next[productId] = promotion;
      } else {
        delete next[productId];
      }
      return next;
    });
  }

  private validatePromotionForm(product: Product): string[] {
    const errors: string[] = [];
    const value = Number(this.promotionForm.discount_value ?? NaN);
    const startsAt = this.getPromotionStartAt().getTime();
    const endsAt = this.getPromotionEndAt().getTime();
    const finalPrice = this.getCalculatedPromotionPrice();

    if (!this.promotionForm.name.trim()) errors.push('El nombre de la promoción es obligatorio.');
    if (!this.promotionForm.product_id) errors.push('Selecciona un producto o servicio.');
    if (!this.promotionForm.promotion_kind) errors.push('Selecciona el tipo de promoción.');
    if (this.promotionForm.promotion_kind === 'special_campaign' && !this.getCampaignName().trim()) errors.push('Selecciona o escribe la campaña especial.');
    if (!Number.isFinite(value)) errors.push('El porcentaje de descuento es obligatorio.');
    if (Number.isFinite(value) && value < 1) errors.push('El porcentaje mínimo es 1%.');
    if (Number.isFinite(value) && value > 100) errors.push('El porcentaje máximo es 100%.');
    if (!this.promotionForm.start_date) errors.push('La fecha de inicio es obligatoria.');
    if (!this.promotionForm.start_time) errors.push('La hora de inicio es obligatoria.');
    if (!this.promotionForm.end_date) errors.push('La fecha de fin es obligatoria.');
    if (!this.promotionForm.end_time) errors.push('La hora de fin es obligatoria.');
    if (Number.isFinite(startsAt) && Number.isFinite(endsAt) && endsAt <= startsAt) errors.push('La fecha final debe ser mayor a la fecha inicial.');
    if (finalPrice < 0) errors.push('El precio final no puede ser negativo.');

    return errors;
  }

  private buildPromotionPayload(): ProductPromotionPayload {
    const campaignName = this.getCampaignName().trim();
    return {
      name: this.promotionForm.name.trim(),
      description: this.promotionForm.description.trim() || null,
      discount_type: 'percentage',
      discount_value: Number(this.promotionForm.discount_value ?? 0),
      currency: 'MXN',
      starts_at: this.getPromotionStartAt().toISOString(),
      ends_at: this.getPromotionEndAt().toISOString(),
      status: this.promotionForm.is_enabled ? 'enabled' : 'disabled',
      internal_notes: this.promotionForm.internal_notes.trim() || null,
      promotion_kind: this.promotionForm.promotion_kind,
      campaign_name: campaignName || null,
      auto_activate: true,
      is_special_campaign: this.promotionForm.promotion_kind === 'special_campaign',
      is_enabled: this.promotionForm.is_enabled,
    };
  }

  private getEmptyPromotionForm(product?: Product) {
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    return {
      product_id: product?.id ?? '',
      name: product ? `Promoción ${product.name}` : '',
      description: '',
      promotion_kind: 'normal' as PromotionKindForm,
      campaign_name: '',
      custom_campaign_name: '',
      discount_type: 'percentage' as PromotionDiscountType,
      discount_value: null,
      start_date: this.toDateInputValue(now),
      start_time: this.toTimeInputValue(now),
      end_date: this.toDateInputValue(nextMonth),
      end_time: this.toTimeInputValue(nextMonth),
      is_enabled: true,
      quick_validity: '30d' as QuickValidity,
      internal_notes: '',
    };
  }

  private mapPromotionToForm(promotion: ProductPromotion) {
    const startsAt = new Date(promotion.starts_at);
    const endsAt = new Date(promotion.ends_at);
    return {
      product_id: promotion.product_id,
      name: promotion.name ?? '',
      description: promotion.description ?? '',
      promotion_kind: promotion.promotion_kind ?? (promotion.is_special_campaign ? 'special_campaign' : 'normal'),
      campaign_name: promotion.campaign_name ?? '',
      custom_campaign_name: promotion.campaign_name && !this.specialCampaignOptions.includes(promotion.campaign_name) ? promotion.campaign_name : '',
      discount_type: 'percentage' as PromotionDiscountType,
      discount_value: promotion.discount_value,
      start_date: this.toDateInputValue(startsAt),
      start_time: this.toTimeInputValue(startsAt),
      end_date: this.toDateInputValue(endsAt),
      end_time: this.toTimeInputValue(endsAt),
      is_enabled: promotion.is_enabled !== false && promotion.status !== 'disabled' && promotion.status !== 'inactive',
      quick_validity: 'custom' as QuickValidity,
      internal_notes: promotion.internal_notes ?? '',
    };
  }

  private toDatetimeLocalValue(date: Date): string {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  private toDateInputValue(date: Date): string {
    return this.toDatetimeLocalValue(date).slice(0, 10);
  }

  private toTimeInputValue(date: Date): string {
    return this.toDatetimeLocalValue(date).slice(11, 16);
  }

  onSearch(): void {
    this.loadProducts();
  }

  onFilterChange(): void {
    this.loadProducts();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedCategory = '';
    this.selectedStatus = '';
    this.selectedCondition = '';
    this.loadProducts();
  }

  setTab(tab: ProductItemType): void {
    if (this.activeTab === tab) {
      return;
    }

    this.activeTab = tab;
    this.selectedCondition = '';
    this.selectedCategory = '';
    this.loadProducts();
  }

  setProductsPanel(panel: ProductsPanel): void {
    this.productsPanel.set(panel);
    if (panel === 'promotions') {
      void this.loadPromotionsPanel();
    }
  }

  setPromotionsPanelTab(tab: PromotionPanelTab): void {
    this.promotionsPanelTab.set(tab);
  }

  private getPromotionPanelTab(promotion: ProductPromotion): PromotionPanelTab {
    if (this.isSpecialPromotion(promotion)) {
      return 'special';
    }

    const status = this.getPromotionComputedStatus(promotion);
    if (status === 'scheduled') {
      return 'scheduled';
    }

    if (['inactive', 'expired', 'cancelled'].includes(status)) {
      return 'history';
    }

    return 'active';
  }

  private ensureSavedPromotionInPanel(promotion: ProductPromotion, product: Product): void {
    const promotions = this.allPromotions();
    if (!promotions.some(item => item.id === promotion.id)) {
      this.allPromotions.set([promotion, ...promotions]);
    }

    this.promotionProducts.set({
      ...this.promotionProducts(),
      [product.id]: product,
    });
  }

  async loadPromotionsPanel(force = false): Promise<void> {
    if (this.promotionsLoading() || (this.promotionsLoaded() && !force)) {
      return;
    }

    this.promotionsLoading.set(true);
    this.promotionErrorMessage.set('');

    try {
      const [promotions, products] = await Promise.all([
        this.promotionsService.getPromotions(),
        firstValueFrom(this.productsService.getProducts()),
      ]);
      this.allPromotions.set(promotions);
      this.promotionProducts.set(Object.fromEntries(products.map(product => [product.id, product])));
      this.promotionsLoaded.set(true);
    } catch (error) {
      this.allPromotions.set([]);
      this.promotionProducts.set({});
      this.promotionErrorMessage.set(error instanceof Error ? error.message : 'No fue posible cargar promociones.');
    } finally {
      this.promotionsLoading.set(false);
    }
  }

  openEmptyPromotionForm(): void {
    if (!this.canManagePromotions) {
      this.promotionErrorMessage.set('Solo usuarios admin pueden administrar promociones.');
      return;
    }

    this.selectedPromotion.set(null);
    this.selectedPromotionProduct.set(null);
    this.promotionModalMode.set('create');
    this.promotionValidationErrors.set([]);
    this.promotionErrorMessage.set('');
    this.promotionAdditionalOpen.set(false);
    this.promotionForm = this.getEmptyPromotionForm();
    this.promotionModalOpen.set(true);
    this.scrollPromotionEditorIntoView();
  }

  closePromotionEditor(): void {
    this.closePromotionModal();
  }

  onPromotionProductChange(productId: string): void {
    this.promotionForm.product_id = productId;
    const product = this.promotionProducts()[productId] ?? this.products().find(item => item.id === productId) ?? null;
    this.selectedPromotionProduct.set(product);
    if (product && !this.promotionForm.name.trim()) {
      this.promotionForm.name = `Promoción ${product.name}`;
    }
  }

  applyQuickValidity(value: QuickValidity): void {
    this.promotionForm.quick_validity = value;
    if (value === 'custom') {
      return;
    }

    const start = new Date();
    const end = new Date(start);

    if (value === 'today') {
      end.setHours(23, 59, 0, 0);
    } else if (value === 'tomorrow') {
      start.setDate(start.getDate() + 1);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setHours(23, 59, 0, 0);
    } else if (value === 'weekend') {
      const day = start.getDay();
      const daysUntilSaturday = (6 - day + 7) % 7;
      start.setDate(start.getDate() + daysUntilSaturday);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(start.getDate() + 1);
      end.setHours(23, 59, 0, 0);
    } else {
      const days = value === '7d' ? 7 : value === '15d' ? 15 : 30;
      end.setDate(end.getDate() + days);
    }

    this.promotionForm.start_date = this.toDateInputValue(start);
    this.promotionForm.start_time = this.toTimeInputValue(start);
    this.promotionForm.end_date = this.toDateInputValue(end);
    this.promotionForm.end_time = this.toTimeInputValue(end);
  }

  clearPromotionFilters(): void {
    this.promotionsSearchTerm.set('');
    this.promotionsStatusFilter.set('');
  }

  get hasPromotionFilters(): boolean {
    return !!this.promotionsSearchTerm().trim() || !!this.promotionsStatusFilter();
  }

  getPromotionProduct(promotion: ProductPromotion): Product | null {
    return this.promotionProducts()[promotion.product_id] ?? this.products().find(product => product.id === promotion.product_id) ?? null;
  }

  get selectedEditorProduct(): Product | null {
    return this.selectedPromotionProduct();
  }

  getPromotionProductPrice(promotion: ProductPromotion): number {
    const product = this.getPromotionProduct(promotion);
    return product ? this.getProductPrice(product) : 0;
  }

  getPromotionFinalPrice(promotion: ProductPromotion): number {
    return this.promotionsService.calculatePromotionalPrice(
      this.getPromotionProductPrice(promotion),
      'percentage',
      promotion.discount_value
    );
  }

  getPromotionComputedStatus(promotion: ProductPromotion): string {
    return this.promotionsService.getComputedStatus(promotion);
  }

  getPromotionStatusBadge(promotion: ProductPromotion): { label: string; variant: BadgeVariant } {
    const status = this.getPromotionComputedStatus(promotion);
    if (status === 'active') return { label: 'Activa', variant: 'success' };
    if (status === 'scheduled') return { label: 'Programada', variant: 'info' };
    if (status === 'inactive') return { label: 'Inactiva', variant: 'neutral' };
    if (status === 'cancelled') return { label: 'Cancelada', variant: 'danger' };
    return { label: 'Vencida', variant: 'neutral' };
  }

  getPromotionTypeLabel(type: PromotionDiscountType): string {
    return type === 'percentage' ? 'Porcentaje' : 'Promoción heredada';
  }

  getPromotionValueLabel(promotion: ProductPromotion): string {
    return `${promotion.discount_value}%`;
  }

  getPromotionDateLabel(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Fecha no disponible';
    }

    return date.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  isSpecialPromotion(promotion: ProductPromotion): boolean {
    if (promotion.promotion_kind === 'special_campaign' || promotion.is_special_campaign) {
      return true;
    }

    const text = `${promotion.name} ${promotion.description ?? ''} ${promotion.internal_notes ?? ''} ${promotion.campaign_name ?? ''}`.toLowerCase();
    return ['hot sale', 'navidad', 'buen fin', 'fin de semana', 'cyber', 'temporada'].some(keyword => text.includes(keyword));
  }

  async openPromotionModalFromPromotion(promotion: ProductPromotion, mode: PromotionModalMode): Promise<void> {
    const product = this.getPromotionProduct(promotion);
    if (!product) {
      this.promotionErrorMessage.set('No fue posible abrir la promoción porque el producto no está disponible.');
      return;
    }

    if (!this.canManagePromotions && mode !== 'view') {
      this.promotionErrorMessage.set('Solo usuarios admin pueden administrar promociones.');
      return;
    }

    this.selectedPromotionProduct.set(product);
    this.selectedPromotion.set(promotion);
    this.promotionModalMode.set(mode);
    this.promotionValidationErrors.set([]);
    this.promotionErrorMessage.set('');
    this.promotionAdditionalOpen.set(false);
    this.promotionForm = this.mapPromotionToForm(promotion);
    this.promotionModalOpen.set(true);
    this.scrollPromotionEditorIntoView();
  }

  async cancelPromotionFromPanel(promotion: ProductPromotion): Promise<void> {
    if (!this.canManagePromotions) {
      this.promotionErrorMessage.set('Solo usuarios admin pueden administrar promociones.');
      return;
    }

    const product = this.getPromotionProduct(promotion);
    const productName = product?.name ?? promotion.name;
    const reason = window.prompt('Motivo de cancelación de la promoción (opcional):') ?? '';
    const confirmed = window.confirm(`Se cancelará la promoción "${promotion.name}" de "${productName}". Esta acción no elimina el historial. ¿Deseas continuar?`);
    if (!confirmed) {
      return;
    }

    this.promotionErrorMessage.set('');

    try {
      await this.promotionsService.cancelPromotion(promotion.id, reason.trim() || undefined);
      if (product) {
        await this.refreshPromotionForProduct(product.id);
      }
      await this.loadPromotionsPanel(true);
      this.promotionMessage.set('Promoción cancelada correctamente.');
      setTimeout(() => this.promotionMessage.set(''), 5000);
    } catch (error) {
      this.promotionErrorMessage.set(error instanceof Error ? error.message : 'No fue posible cancelar la promoción.');
    }
  }

  async togglePromotionEnabledFromPanel(promotion: ProductPromotion): Promise<void> {
    if (!this.canManagePromotions) {
      this.promotionErrorMessage.set('Solo usuarios admin pueden administrar promociones.');
      return;
    }

    const status = this.getPromotionComputedStatus(promotion);
    const enabled = status === 'inactive';
    const confirmed = window.confirm(`¿Deseas ${enabled ? 'activar' : 'desactivar'} la promoción "${promotion.name}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await this.promotionsService.setPromotionEnabled(promotion.id, enabled);
      const product = this.getPromotionProduct(promotion);
      if (product) {
        await this.refreshPromotionForProduct(product.id);
      }
      await this.loadPromotionsPanel(true);
      this.promotionMessage.set(`Promoción ${enabled ? 'activada' : 'desactivada'} correctamente.`);
      setTimeout(() => this.promotionMessage.set(''), 5000);
    } catch (error) {
      this.promotionErrorMessage.set(error instanceof Error ? error.message : 'No fue posible actualizar la promoción.');
    }
  }

  isProductPromotionActive(product: Product): boolean {
    const promotion = this.getProductPromotion(product);
    return !!promotion && this.getPromotionComputedStatus(promotion) === 'active';
  }

  isProductPromotionScheduled(product: Product): boolean {
    const promotion = this.getProductPromotion(product);
    return !!promotion && this.getPromotionComputedStatus(promotion) === 'scheduled';
  }

  getPromotionPreviewStatus(): { label: string; variant: BadgeVariant } {
    if (!this.promotionForm.is_enabled) {
      return { label: 'Inactiva', variant: 'neutral' };
    }

    const now = Date.now();
    const startsAt = this.getPromotionStartAt().getTime();
    const endsAt = this.getPromotionEndAt().getTime();
    if (Number.isFinite(endsAt) && now > endsAt) return { label: 'Vencida', variant: 'neutral' };
    if (Number.isFinite(startsAt) && now < startsAt) return { label: 'Programada', variant: 'info' };
    return { label: 'Activa', variant: 'success' };
  }

  getPromotionPreviewSavings(): number {
    const product = this.selectedEditorProduct;
    if (!product) return 0;
    return Math.max(0, this.getProductPrice(product) - this.getCalculatedPromotionPrice());
  }

  getPromotionDiscountBadge(product: Product): string {
    const promotion = this.getProductPromotion(product);
    if (!promotion) {
      return '';
    }

    return `-${Number(promotion.discount_value ?? 0)}%`;
  }

  getCampaignName(): string {
    if (this.promotionForm.promotion_kind !== 'special_campaign') {
      return '';
    }

    return this.promotionForm.campaign_name === 'Otra campaña'
      ? this.promotionForm.custom_campaign_name
      : this.promotionForm.campaign_name;
  }

  get canManagePromotions(): boolean {
    return String(this.authService.currentUser?.role ?? '').trim().toLowerCase() === 'admin';
  }

  private getPromotionStartAt(): Date {
    return new Date(`${this.promotionForm.start_date}T${this.promotionForm.start_time || '00:00'}`);
  }

  private getPromotionEndAt(): Date {
    return new Date(`${this.promotionForm.end_date}T${this.promotionForm.end_time || '23:59'}`);
  }

  private scrollPromotionEditorIntoView(): void {
    window.setTimeout(() => {
      document.getElementById('promotion-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  private scrollPromotionsPanelIntoView(): void {
    window.setTimeout(() => {
      document.getElementById('promotions-dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  deleteProduct(product: Product): void {
    const confirmed = window.confirm(`Se eliminara el producto ${product.name}. Esta accion eliminara el registro de la base de datos. Deseas continuar?`);
    if (!confirmed) {
      return;
    }

    this.deletingId.set(product.id);
    this.productsService.deleteProduct(product.id).subscribe({
      next: () => {
        this.products.update(current => current.filter(item => item.id !== product.id));
        this.actionMessage.set(`Producto ${product.name} eliminado del catalogo.`);
        this.deletingId.set('');
      },
      error: () => {
        this.deletingId.set('');
        this.actionMessage.set('No fue posible eliminar el producto. Intenta nuevamente.');
      }
    });
  }

  toggleProductActive(product: Product): void {
    const currentStatus = product.is_active ?? false;
    const nextStatus = !currentStatus;
    const actionLabel = nextStatus ? 'activar' : 'desactivar';
    const confirmed = window.confirm(`Deseas ${actionLabel} el producto "${product.name}"?`);
    if (!confirmed) {
      return;
    }

    this.productsService.toggleActive(product.id, currentStatus).subscribe({
      next: (updatedProduct) => {
        this.products.update(current =>
          current.map(item => item.id === product.id ? { ...item, is_active: updatedProduct.is_active } : item)
        );
        const stateWord = nextStatus ? 'activado' : 'desactivado';
        this.actionMessage.set(`Producto "${product.name}" ${stateWord} correctamente.`);
        
        setTimeout(() => {
          this.actionMessage.set('');
        }, 5000);
      },
      error: () => {
        this.actionMessage.set(`No fue posible ${actionLabel} el producto. Intenta nuevamente.`);
        setTimeout(() => {
          this.actionMessage.set('');
        }, 5000);
      }
    });
  }


  getCategoryLabel(cat: ProductCategory): string {
    const labels: Record<string, string> = {
      [ProductCategory.EquipoMedico]: 'Equipo Médico',
      [ProductCategory.UltrasonidoHumano]: 'Ultrasonido Hum.',
      [ProductCategory.UltrasonidoVeterinario]: 'Ultrasonido Vet.',
      [ProductCategory.Consumible]: 'Consumibles',
      [ProductCategory.Refaccion]: 'Refacciones',
      [ProductCategory.Accesorio]: 'Accesorios',
      [ProductCategory.Servicio]: 'Servicios',
    };
    return labels[cat] ?? cat;
  }

  getItemTypeLabel(product: Product): string {
    return (product.item_type ?? ProductItemType.Product) === ProductItemType.Service ? 'Servicio' : 'Producto físico';
  }

  getConditionLabel(condition?: ProductCondition | null): string {
    if (condition === ProductCondition.Remanufactured) return 'Remanufacturado';
    return condition === ProductCondition.Preowned ? 'Seminuevo' : 'Nuevo';
  }

  getVisitLabel(product: Product): string {
    return product.service_requires_visit ? 'Requiere visita' : 'Sin visita';
  }

  getDurationLabel(minutes?: number | null): string {
    return minutes ? `${minutes} min` : 'No definida';
  }

  get activeTabLabel(): string {
    return this.activeTab === ProductItemType.Service ? 'servicio' : 'producto';
  }

  get isServicesTab(): boolean {
    return this.activeTab === ProductItemType.Service;
  }

  get ProductItemType() {
    return ProductItemType;
  }

  getStatusBadge(isActive: boolean): { label: string; variant: BadgeVariant } {
    if (isActive) {
      return { label: 'Activo', variant: 'success' };
    }
    return { label: 'Inactivo', variant: 'neutral' };
  }

  get hasActiveFilters(): boolean {
    return !!(this.searchTerm || this.selectedCategory || this.selectedStatus || this.selectedCondition);
  }
}
