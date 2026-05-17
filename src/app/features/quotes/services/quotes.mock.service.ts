import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ClientMockService } from '../../clients/services/client.mock.service';
import { ProductsMockService } from '../../products/services/products.mock.service';
import { Client, ClientStatus } from '../../../core/models/client.model';
import { Product, ProductStatus } from '../../../models/product.model';
import {
  DEFAULT_QUOTE_TAX_PCT,
  Quote,
  QuoteFilters,
  QuoteItem,
  QuoteItemDraft,
  QuoteStatus,
  QuoteTotals,
  QuoteUpsertPayload,
} from '../models/quote.model';

const MOCK_QUOTES: Quote[] = [];

@Injectable({
  providedIn: 'root'
})
export class QuotesMockService {
  private readonly clientService = inject(ClientMockService);
  private readonly productsService = inject(ProductsMockService);

  private readonly _quotes = signal<Quote[]>([...MOCK_QUOTES]);
  private readonly _activeClients = signal<Client[]>([]);
  private readonly _availableProducts = signal<Product[]>([]);

  private catalogLoaded = false;
  private catalogPromise: Promise<void> | null = null;

  readonly quotes = this._quotes.asReadonly();
  readonly activeClients = computed(() => this._activeClients());
  readonly availableProducts = computed(() => this._availableProducts());

  constructor() {
    void this.ensureCatalogLoaded();
  }

  async getQuotes(filters?: QuoteFilters): Promise<Quote[]> {
    await this.ensureCatalogLoaded();

    let result = [...this._quotes()];

    if (filters?.search?.trim()) {
      const query = filters.search.trim().toLowerCase();
      result = result.filter(quote =>
        quote.quoteNumber.toLowerCase().includes(query) ||
        quote.clientNameSnapshot.toLowerCase().includes(query) ||
        quote.items.some(item =>
          item.productName.toLowerCase().includes(query) ||
          item.sku.toLowerCase().includes(query)
        )
      );
    }

    if (filters?.status) {
      result = result.filter(quote => quote.status === filters.status);
    }

    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return this.delay(result.map(quote => ({ ...quote, items: [...quote.items] })), 280);
  }

  async getQuoteById(id: string): Promise<Quote | undefined> {
    await this.ensureCatalogLoaded();
    const quote = this._quotes().find(item => item.id === id);

    if (!quote) {
      return this.delay(undefined, 180);
    }

    return this.delay({ ...quote, items: [...quote.items] }, 220);
  }

  async getActiveClients(): Promise<Client[]> {
    await this.ensureCatalogLoaded();
    return this.delay([...this._activeClients()], 180);
  }

  async getAvailableProducts(): Promise<Product[]> {
    await this.ensureCatalogLoaded();
    return this.delay([...this._availableProducts()], 180);
  }

  async getClientById(id: string): Promise<Client | undefined> {
    await this.ensureCatalogLoaded();

    const localClient = this._activeClients().find(client => client.id === id);
    if (localClient) {
      return this.delay({ ...localClient }, 120);
    }

    return this.clientService.getClientById(id);
  }

  async createQuote(payload: QuoteUpsertPayload): Promise<Quote> {
    await this.ensureCatalogLoaded();

    const now = new Date().toISOString();
    const quote = this.composeQuote({
      id: `qte-${Date.now()}`,
      quoteNumber: this.generateQuoteNumber(),
      createdAt: now,
      updatedAt: now,
      payload,
    });

    this._quotes.update(current => [quote, ...current]);

    return this.delay({ ...quote, items: [...quote.items] }, 320);
  }

  async updateQuote(id: string, payload: QuoteUpsertPayload): Promise<Quote | undefined> {
    await this.ensureCatalogLoaded();

    const currentQuotes = this._quotes();
    const currentIndex = currentQuotes.findIndex(quote => quote.id === id);

    if (currentIndex === -1) {
      return this.delay(undefined, 220);
    }

    const currentQuote = currentQuotes[currentIndex];
    const updatedQuote = this.composeQuote({
      id: currentQuote.id,
      quoteNumber: currentQuote.quoteNumber,
      createdAt: currentQuote.createdAt,
      updatedAt: new Date().toISOString(),
      payload,
    });

    const nextQuotes = [...currentQuotes];
    nextQuotes[currentIndex] = updatedQuote;
    this._quotes.set(nextQuotes);

    return this.delay({ ...updatedQuote, items: [...updatedQuote.items] }, 320);
  }

  async updateQuoteStatus(id: string, status: QuoteStatus): Promise<Quote | undefined> {
    await this.ensureCatalogLoaded();

    const currentQuotes = this._quotes();
    const currentIndex = currentQuotes.findIndex(quote => quote.id === id);

    if (currentIndex === -1) {
      return this.delay(undefined, 200);
    }

    const updatedQuote: Quote = {
      ...currentQuotes[currentIndex],
      status,
      updatedAt: new Date().toISOString(),
    };

    const nextQuotes = [...currentQuotes];
    nextQuotes[currentIndex] = updatedQuote;
    this._quotes.set(nextQuotes);

    return this.delay({ ...updatedQuote, items: [...updatedQuote.items] }, 240);
  }

  calculateTotals(items: QuoteItemDraft[], taxPct: number = DEFAULT_QUOTE_TAX_PCT): QuoteTotals {
    const normalizedItems = this.normalizeItems(items);
    const subtotal = this.roundCurrency(
      normalizedItems.reduce((sum, item) => sum + item.totalLinePrice, 0)
    );
    const tax = this.roundCurrency(subtotal * taxPct);

    return {
      subtotal,
      tax,
      total: this.roundCurrency(subtotal + tax),
    };
  }

  private async ensureCatalogLoaded(): Promise<void> {
    if (this.catalogLoaded) {
      return;
    }

    if (!this.catalogPromise) {
      this.catalogPromise = (async () => {
        const [clients, productResponse] = await Promise.all([
          this.clientService.getClients(),
          firstValueFrom(this.productsService.getProducts({ status: ProductStatus.Active })),
        ]);

        this._activeClients.set(clients.filter(client => client.status === ClientStatus.Active));
        this._availableProducts.set(
          productResponse.data.filter(product => product.status === ProductStatus.Active)
        );
        this.catalogLoaded = true;
      })();
    }

    await this.catalogPromise;
  }

  private composeQuote(config: {
    id: string;
    quoteNumber: string;
    createdAt: string;
    updatedAt: string;
    payload: QuoteUpsertPayload;
  }): Quote {
    const normalizedItems = this.normalizeItems(config.payload.items);
    const taxPct = this.sanitizeTaxPct(config.payload.tax_pct);
    const totals = this.calculateTotals(normalizedItems, taxPct);
    const clientSnapshot = this.resolveClientSnapshots(
      config.payload.clientId,
      config.payload.clientNameSnapshot,
      config.payload.clientRfcSnapshot,
      config.payload.clientAddressSnapshot,
    );

    return {
      id: config.id,
      quoteNumber: config.quoteNumber,
      clientId: config.payload.clientId,
      clientNameSnapshot: clientSnapshot.name,
      clientRfcSnapshot: clientSnapshot.rfc,
      clientAddressSnapshot: clientSnapshot.address,
      status: config.payload.status ?? QuoteStatus.Draft,
      items: normalizedItems,
      subtotal: totals.subtotal,
      tax_pct: taxPct,
      tax: totals.tax,
      total: totals.total,
      validUntil: config.payload.validUntil,
      notes: config.payload.notes?.trim() ?? '',
      conditions: config.payload.conditions?.trim() ?? '',
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  private normalizeItems(items: QuoteItemDraft[]): QuoteItem[] {
    return items
      .filter(item => !!item.productId)
      .map(item => {
        const product = this._availableProducts().find(productItem => productItem.id === item.productId);
        const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
        const unitPrice = this.roundCurrency(item.unitPrice ?? product?.price_mxn ?? 0);
        const gross = this.roundCurrency(quantity * unitPrice);
        const discount = this.roundCurrency(Math.min(Math.max(Number(item.discount) || 0, 0), gross));

        return {
          productId: item.productId,
          sku: item.sku ?? product?.sku ?? 'SIN-SKU',
          productName: item.productName ?? product?.name ?? 'Producto sin referencia',
          quantity,
          unitPrice,
          discount,
          totalLinePrice: this.roundCurrency(gross - discount),
        };
      });
  }

  private resolveClientSnapshots(
    clientId: string,
    nameSnapshot?: string,
    rfcSnapshot?: string,
    addressSnapshot?: string,
  ): { name: string; rfc: string; address: string } {
    const client = this._activeClients().find(item => item.id === clientId);

    return {
      name: nameSnapshot?.trim() || client?.businessName || 'Cliente no disponible',
      rfc: rfcSnapshot?.trim() || client?.rfc || 'RFC no disponible',
      address:
        addressSnapshot?.trim() ||
        (client ? `${client.shippingAddress || client.address}, ${client.city}, ${client.state}` : 'Direccion no disponible'),
    };
  }

  private sanitizeTaxPct(taxPct?: number): number {
    const normalized = Number.isFinite(taxPct) ? Number(taxPct) : DEFAULT_QUOTE_TAX_PCT;
    return normalized >= 0 ? normalized : DEFAULT_QUOTE_TAX_PCT;
  }

  private generateQuoteNumber(): string {
    const year = new Date().getFullYear();
    const sequence = this._quotes()
      .filter(quote => quote.quoteNumber.startsWith(`BCQ-${year}-`))
      .map(quote => Number(quote.quoteNumber.split('-').at(-1)))
      .filter(value => Number.isFinite(value))
      .reduce((max, value) => Math.max(max, value), 0);

    return `BCQ-${year}-${String(sequence + 1).padStart(4, '0')}`;
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private delay<T>(data: T, ms = 250): Promise<T> {
    return new Promise(resolve => setTimeout(() => resolve(data), ms));
  }
}
