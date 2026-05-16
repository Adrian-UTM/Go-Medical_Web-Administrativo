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

const MOCK_QUOTES: Quote[] = [
  {
    id: 'qte-001',
    quoteNumber: 'BCQ-2026-0001',
    clientId: 'cli-001',
    clientNameSnapshot: 'Unidad de Diagnostico Avanzado S.A. de C.V.',
    clientRfcSnapshot: 'UDA901231MX5',
    clientAddressSnapshot: 'Calle 60 #123, Centro, Merida, Yucatan',
    status: QuoteStatus.Sent,
    items: [
      {
        productId: 'prod-002',
        sku: 'UHU-500-HM',
        productName: 'MedScan Pro 500',
        quantity: 1,
        unitPrice: 245000,
        discount: 12000,
        totalLinePrice: 233000,
      },
      {
        productId: 'prod-003',
        sku: 'CON-GEL-500ML',
        productName: 'Gel conductor ultrasonico 500 ml',
        quantity: 10,
        unitPrice: 145,
        discount: 0,
        totalLinePrice: 1450,
      },
    ],
    subtotal: 234450,
    tax_pct: DEFAULT_QUOTE_TAX_PCT,
    tax: 37512,
    total: 271962,
    validUntil: '2026-05-31T23:59:59.000Z',
    notes: 'Incluye entrega programada y capacitacion inicial para el personal medico.',
    conditions: 'Precios expresados en MXN. Vigencia sujeta a disponibilidad de fabrica. Anticipo del 50% para programar entrega.',
    createdAt: '2026-05-02T11:00:00.000Z',
    updatedAt: '2026-05-04T09:20:00.000Z',
  },
  {
    id: 'qte-002',
    quoteNumber: 'BCQ-2026-0002',
    clientId: 'cli-003',
    clientNameSnapshot: 'Servicios Veterinarios Peninsulares SC',
    clientRfcSnapshot: 'SVP100228K9A',
    clientAddressSnapshot: 'Bodega 3, Av. Canek, Merida, Yucatan',
    status: QuoteStatus.Draft,
    items: [
      {
        productId: 'prod-001',
        sku: 'UVT-300-VT',
        productName: 'AlphaVet 300',
        quantity: 1,
        unitPrice: 89500,
        discount: 4500,
        totalLinePrice: 85000,
      },
      {
        productId: 'prod-004',
        sku: 'SRV-MNT-PREV',
        productName: 'Mantenimiento preventivo anual',
        quantity: 1,
        unitPrice: 3800,
        discount: 0,
        totalLinePrice: 3800,
      },
    ],
    subtotal: 88800,
    tax_pct: DEFAULT_QUOTE_TAX_PCT,
    tax: 14208,
    total: 103008,
    validUntil: '2026-06-05T23:59:59.000Z',
    notes: 'Propuesta para renovacion de consultorio veterinario con equipo portatil y plan de servicio anual.',
    conditions: 'Entrega estimada de 2 a 3 semanas una vez confirmado el anticipo y disponibilidad en almacen.',
    createdAt: '2026-05-06T13:15:00.000Z',
    updatedAt: '2026-05-06T13:15:00.000Z',
  },
  {
    id: 'qte-003',
    quoteNumber: 'BCQ-2026-0003',
    clientId: 'cli-002',
    clientNameSnapshot: 'Carlos Ruiz Altaba',
    clientRfcSnapshot: 'RUAC800412HDF',
    clientAddressSnapshot: 'Av. Colon 450, Consultorio 12, Merida, Yucatan',
    status: QuoteStatus.Approved,
    items: [
      {
        productId: 'prod-005',
        sku: 'REF-SOND-L38',
        productName: 'Transductor lineal 3-8 MHz (refaccion)',
        quantity: 1,
        unitPrice: 12200,
        discount: 700,
        totalLinePrice: 11500,
      },
    ],
    subtotal: 11500,
    tax_pct: DEFAULT_QUOTE_TAX_PCT,
    tax: 1840,
    total: 13340,
    validUntil: '2026-05-18T23:59:59.000Z',
    notes: 'Cliente solicita entrega con prioridad por agenda de consulta.',
    conditions: 'Cotizacion aprobada internamente; pendiente coordinacion de pago y entrega.',
    createdAt: '2026-04-28T17:10:00.000Z',
    updatedAt: '2026-05-01T10:05:00.000Z',
  },
  {
    id: 'qte-004',
    quoteNumber: 'BCQ-2026-0004',
    clientId: 'cli-001',
    clientNameSnapshot: 'Unidad de Diagnostico Avanzado S.A. de C.V.',
    clientRfcSnapshot: 'UDA901231MX5',
    clientAddressSnapshot: 'Calle 60 #123, Centro, Merida, Yucatan',
    status: QuoteStatus.Expired,
    items: [
      {
        productId: 'prod-003',
        sku: 'CON-GEL-500ML',
        productName: 'Gel conductor ultrasonico 500 ml',
        quantity: 50,
        unitPrice: 145,
        discount: 250,
        totalLinePrice: 7000,
      },
    ],
    subtotal: 7000,
    tax_pct: DEFAULT_QUOTE_TAX_PCT,
    tax: 1120,
    total: 8120,
    validUntil: '2026-04-20T23:59:59.000Z',
    notes: 'Cotizacion de consumibles enviada para reposicion trimestral.',
    conditions: 'Vigencia vencida. Requiere actualizacion comercial antes de reenviar.',
    createdAt: '2026-04-05T08:40:00.000Z',
    updatedAt: '2026-04-21T09:00:00.000Z',
  },
];

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
