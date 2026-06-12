import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { startWith } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { Client } from '../../../../core/models/client.model';
import { Product } from '../../../../models/product.model';

import {
  DEFAULT_QUOTE_TAX_PCT,
  Quote,
  QuoteItem,
  QuoteItemDraft,
  QuoteStatus,
  QuoteTotals,
  QuoteUpsertPayload,
} from '../../models/quote.model';
import { QuoteSupabaseService } from '../../services/quote.supabase.service';

@Component({
  selector: 'bc-quote-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    LoaderComponent,
    CustomSelectComponent,
  ],
  templateUrl: './quote-form.component.html',
  styleUrl: './quote-form.component.css',
})
export class QuoteFormComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly quotesService = inject(QuoteSupabaseService);

  readonly isEditMode = signal(false);
  readonly isLoadingData = signal(true);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly duplicateWarning = signal('');
  readonly clients = signal<Client[]>([]);
  readonly products = signal<Product[]>([]);
  readonly selectedClient = signal<Client | null>(null);
  readonly totals = signal<QuoteTotals>({ grossSubtotal: 0, itemsDiscount: 0, subtotal: 0, tax: 0, total: 0 });
  readonly productSearch = signal('');

  quoteId: string | null = null;

  readonly statusOptions = [
    { value: QuoteStatus.Draft, label: 'Borrador' },
    { value: QuoteStatus.Sent, label: 'Enviada' },
    { value: QuoteStatus.Approved, label: 'Aprobada' },
    { value: QuoteStatus.Rejected, label: 'Rechazada' },
    { value: QuoteStatus.Expired, label: 'Vencida' },
    { value: QuoteStatus.Converted, label: 'Convertida' },
  ];

  readonly clientOptions = computed(() =>
    this.clients().map(client => ({
      value: client.id,
      label: client.tradeName
        ? `${client.businessName} (${client.tradeName})`
        : client.businessName,
    }))
  );

  readonly filteredProductOptions = computed(() => {
    const query = this.productSearch().trim().toLowerCase();
    const all = this.products().map(product => ({
      value: product.id,
      label: `${product.sku} · ${product.name}`,
      meta: `${product.sku} ${product.name} ${(product as any).brand ?? ''} ${(product as any).model ?? ''} ${product.category ?? ''}`.toLowerCase(),
    }));
    if (!query) return all;
    return all.filter(opt => opt.meta.includes(query));
  });

  readonly form = this.fb.group({
    clientId: ['', Validators.required],
    clientNameSnapshot: [''],
    clientRfcSnapshot: [''],
    clientAddressSnapshot: [''],
    status: [QuoteStatus.Draft, Validators.required],
    tax_pct: [DEFAULT_QUOTE_TAX_PCT, [Validators.required, Validators.min(0)]],
    taxExempt: [false],
    discount: [null as number | null, [Validators.min(0)]],
    validUntil: [this.getDefaultValidUntil(), Validators.required],
    notes: ['', Validators.maxLength(800)],
    conditions: ['', Validators.maxLength(1200)],
    items: this.fb.array([]),
  });

  constructor() {
    this.form.valueChanges
      .pipe(
        startWith(this.form.getRawValue()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.recalculateTotals());

    void this.initialize();
  }

  get pageTitle(): string {
    return this.isEditMode() ? 'Editar cotizacion' : 'Nueva cotizacion';
  }

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Cotizaciones', routerLink: '/cotizaciones' },
      { label: this.pageTitle },
    ];
  }

  get itemsArray(): FormArray {
    return this.form.get('items') as FormArray;
  }

  private async initialize(): Promise<void> {
    this.quoteId = this.route.snapshot.paramMap.get('id');
    const isEditing = !!this.quoteId;
    this.isEditMode.set(isEditing);

    try {
      const [clients, products] = await Promise.all([
        this.quotesService.getActiveClients(),
        this.quotesService.getAvailableProducts(),
      ]);

      this.clients.set(clients);
      this.products.set(products);

      if (isEditing && this.quoteId) {
        await this.loadQuote(this.quoteId);
      } else {
        this.addQuoteLine();
      }
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible preparar el formulario de cotización.');
    } finally {
      this.isLoadingData.set(false);
    }
  }

  async loadQuote(id: string): Promise<void> {
    const quote = await this.quotesService.getQuoteById(id);

    if (!quote) {
      await this.router.navigate(['/cotizaciones']);
      return;
    }

    this.form.patchValue({
      clientId: quote.clientId,
      clientNameSnapshot: quote.clientNameSnapshot,
      clientRfcSnapshot: quote.clientRfcSnapshot,
      clientAddressSnapshot: quote.clientAddressSnapshot,
      status: quote.status,
      tax_pct: quote.tax_pct,
      taxExempt: quote.taxExempt,
      discount: quote.discount,
      validUntil: this.toDateInputValue(quote.validUntil),
      notes: quote.notes,
      conditions: quote.conditions,
    }, { emitEvent: false });

    this.syncSelectedClient(quote.clientId, quote);

    this.itemsArray.clear();
    quote.items.forEach(item => this.addQuoteLine(item));
    this.recalculateTotals();
  }

  addQuoteLine(item?: Partial<QuoteItem>): void {
    this.itemsArray.push(this.fb.group({
      productId: [item?.productId ?? '', Validators.required],
      sku: [item?.sku ?? ''],
      productName: [item?.productName ?? ''],
      productCategory: [item?.productCategory ?? ''],
      quantity: [item?.quantity ?? (null as number | null), [Validators.required, Validators.min(1)]],
      unitPrice: [item?.unitPrice ?? (null as number | null), [Validators.required, Validators.min(0)]],
      discount: [item?.discount ?? (null as number | null), [Validators.min(0)]],
      grossLinePrice: [item?.grossLinePrice ?? 0],
      totalLinePrice: [item?.totalLinePrice ?? 0],
    }));

    this.recalculateTotals();
  }

  removeQuoteLine(index: number): void {
    this.itemsArray.removeAt(index);

    if (this.itemsArray.length === 0) {
      this.addQuoteLine();
      return;
    }

    this.recalculateTotals();
  }

  onClientSelected(clientId: string): void {
    this.syncSelectedClient(clientId);
  }

  onProductSelected(index: number, productId: string): void {
    const lineGroup = this.itemsArray.at(index) as FormGroup;
    const product = this.products().find(item => item.id === productId);

    if (!product) {
      lineGroup.patchValue({
        sku: '',
        productName: '',
        productCategory: '',
        unitPrice: null,
        discount: null,
        grossLinePrice: 0,
        totalLinePrice: 0,
      }, { emitEvent: false });
      this.recalculateTotals();
      return;
    }

    // Anti-duplicate: check if product already in another line
    const existingIndex = this.itemsArray.controls.findIndex((ctrl, i) => {
      if (i === index) return false;
      return (ctrl as FormGroup).get('productId')?.value === productId;
    });

    if (existingIndex >= 0) {
      // Revert selection and show warning
      lineGroup.patchValue({ productId: '' }, { emitEvent: false });
      const existingQty = Number((this.itemsArray.at(existingIndex) as FormGroup).get('quantity')?.value ?? 1);
      this.duplicateWarning.set(`"${product.name}" ya está en la línea ${existingIndex + 1}. Puedes modificar la cantidad allí (actual: ${existingQty}).`);
      setTimeout(() => this.duplicateWarning.set(''), 5000);
      return;
    }

    this.duplicateWarning.set('');
    lineGroup.patchValue({
      productId,
      sku: product.sku ?? '',
      productName: product.name ?? '',
      productCategory: (product as any).category ?? '',
      unitPrice: product.unit_price_mxn ?? (product as any).price_mxn ?? 0,
    }, { emitEvent: false });

    this.recalculateTotals();
  }

  getProductCategoryLabel(index: number): string {
    const group = this.itemsArray.at(index) as FormGroup;
    const cat = group.get('productCategory')?.value as string;
    const labels: Record<string, string> = {
      equipo_medico: 'Equipo médico',
      ultrasonido_humano: 'Ultrasonido humano',
      ultrasonido_veterinario: 'Ultrasonido veterinario',
      consumible: 'Consumible',
      refaccion: 'Refacción',
      accesorio: 'Accesorio',
      servicio: 'Servicio',
    };
    return labels[cat] ?? cat ?? '—';
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Completa los campos requeridos antes de guardar la cotizacion.');
      return;
    }

    const payload = this.buildPayload();
    if (!payload.items.length) {
      this.errorMessage.set('Agrega al menos un concepto valido a la cotizacion.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');

    try {
      const savedQuote = this.isEditMode() && this.quoteId
        ? await this.quotesService.updateQuote(this.quoteId, payload)
        : await this.quotesService.createQuote(payload);

      if (!savedQuote) {
        this.errorMessage.set('No fue posible guardar la cotizacion.');
        return;
      }

      await this.router.navigate(['/cotizaciones', savedQuote.id]);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Ocurrio un error al guardar la cotizacion. Intenta nuevamente.');
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

  hasLineError(index: number, controlName: string, errorName?: string): boolean {
    const group = this.itemsArray.at(index) as FormGroup;
    const control = group.get(controlName);
    if (!control || !(control.touched || control.dirty)) {
      return false;
    }
    return errorName ? control.hasError(errorName) : control.invalid;
  }

  getLineGross(index: number): number {
    const group = this.itemsArray.at(index) as FormGroup;
    return Number(group.get('grossLinePrice')?.value ?? 0);
  }

  getLineSubtotal(index: number): number {
    const group = this.itemsArray.at(index) as FormGroup;
    return Number(group.get('totalLinePrice')?.value ?? 0);
  }

  getLineDiscountExceedsWarning(index: number): boolean {
    const group = this.itemsArray.at(index) as FormGroup;
    const gross = this.getLineGross(index);
    const discount = Number(group.get('discount')?.value ?? 0);
    return discount > 0 && discount >= gross;
  }

  private syncSelectedClient(clientId: string, quote?: Quote): void {
    const client = this.clients().find(item => item.id === clientId) ?? null;
    this.selectedClient.set(client);

    this.form.patchValue({
      clientNameSnapshot: quote?.clientNameSnapshot ?? client?.businessName ?? '',
      clientRfcSnapshot: quote?.clientRfcSnapshot ?? client?.rfc ?? '',
      clientAddressSnapshot: quote?.clientAddressSnapshot ?? (client
        ? `${client.shippingAddress || client.address || ''}, ${client.city ?? ''}, ${client.state ?? ''}`
        : ''),
    }, { emitEvent: false });
  }

  private recalculateTotals(): void {
    const draftItems = this.itemsArray.controls.map(control => {
      const group = control as FormGroup;
      const quantityValue = group.get('quantity')?.value;
      const unitPriceValue = group.get('unitPrice')?.value;
      const quantity = quantityValue === null || quantityValue === '' ? 1 : Math.max(1, Number(quantityValue));
      const unitPrice = Number(unitPriceValue) || 0;
      const grossLinePrice = this.roundCurrency(quantity * unitPrice);
      const rawDiscount = Number(group.get('discount')?.value) || 0;
      const discount = this.roundCurrency(Math.min(Math.max(rawDiscount, 0), grossLinePrice));
      const totalLinePrice = this.roundCurrency(grossLinePrice - discount);

      group.patchValue({
        quantity,
        discount,
        grossLinePrice,
        totalLinePrice,
      }, { emitEvent: false });

      return {
        productId: String(group.get('productId')?.value ?? ''),
        sku: String(group.get('sku')?.value ?? ''),
        productName: String(group.get('productName')?.value ?? ''),
        quantity,
        unitPrice,
        discount,
      } satisfies QuoteItemDraft;
    });

    const taxPct = Number(this.form.get('tax_pct')?.value ?? DEFAULT_QUOTE_TAX_PCT);
    const taxExempt = !!this.form.get('taxExempt')?.value;
    const globalDiscount = Math.max(0, Number(this.form.get('discount')?.value) || 0);
    this.totals.set(this.quotesService.calculateTotals(draftItems, taxPct, taxExempt, globalDiscount));
  }

  private buildPayload(): QuoteUpsertPayload {
    const rawValue = this.form.getRawValue();
    const items = (rawValue.items ?? [])
      .filter((item: any) => item.productId)
      .map((item: any) => ({
        productId: String(item.productId),
        sku: String(item.sku ?? ''),
        productName: String(item.productName ?? ''),
        productCategory: item.productCategory ?? undefined,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount ?? 0),
      })) as QuoteItemDraft[];

    return {
      clientId: rawValue.clientId ?? '',
      clientNameSnapshot: rawValue.clientNameSnapshot ?? '',
      clientRfcSnapshot: rawValue.clientRfcSnapshot ?? '',
      clientAddressSnapshot: rawValue.clientAddressSnapshot ?? '',
      status: rawValue.status ?? QuoteStatus.Draft,
      tax_pct: Number(rawValue.tax_pct ?? DEFAULT_QUOTE_TAX_PCT),
      taxExempt: !!rawValue.taxExempt,
      discount: Math.max(0, Number(rawValue.discount ?? 0)),
      validUntil: this.toIsoFromDateInput(String(rawValue.validUntil ?? '')),
      notes: rawValue.notes ?? '',
      conditions: rawValue.conditions ?? '',
      items,
    };
  }

  private getDefaultValidUntil(): string {
    const date = new Date();
    date.setDate(date.getDate() + 15);
    return this.toDateInputValue(date.toISOString());
  }

  private toDateInputValue(isoDate: string): string {
    if (!isoDate) return '';
    return new Date(isoDate).toISOString().slice(0, 10);
  }

  private toIsoFromDateInput(value: string): string {
    if (!value) return new Date().toISOString();
    return new Date(`${value}T23:59:59`).toISOString();
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
