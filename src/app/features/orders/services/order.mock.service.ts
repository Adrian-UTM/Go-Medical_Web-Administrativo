import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ClientMockService } from '../../clients/services/client.mock.service';
import { ProductsMockService } from '../../products/services/products.mock.service';
import { Client, ClientStatus } from '../../../core/models/client.model';
import { Product, ProductCategory, ProductStatus } from '../../../models/product.model';
import {
  DEFAULT_ORDER_TAX_PCT,
  Order,
  OrderFilters,
  OrderItem,
  OrderItemDraft,
  OrderStatus,
  OrderTotals,
  OrderUpsertPayload,
} from '../../../models/order.model';

const MOCK_ORDERS: Order[] = [
  {
    id: 'ord-001',
    folio: 'BCO-2026-0001',
    clientId: 'cli-001',
    clientNameSnapshot: 'Unidad de Diagnostico Avanzado S.A. de C.V.',
    status: OrderStatus.Paid,
    items: [
      {
        productId: 'prod-002',
        sku: 'UHU-500-HM',
        productName: 'MedScan Pro 500',
        productCategory: ProductCategory.UltrasoundHuman,
        quantity: 1,
        unitPrice: 245000,
        totalLinePrice: 245000,
      },
      {
        productId: 'prod-003',
        sku: 'CON-GEL-500ML',
        productName: 'Gel conductor ultrasonico 500 ml',
        productCategory: ProductCategory.Consumables,
        quantity: 12,
        unitPrice: 145,
        totalLinePrice: 1740,
      },
    ],
    subtotal: 246740,
    taxPct: DEFAULT_ORDER_TAX_PCT,
    taxExempt: false,
    tax: 39478.4,
    total: 286218.4,
    notes: 'Entrega parcial en almacen y capacitacion programada para el personal clinico.',
    createdAt: '2026-03-12T10:15:00Z',
    updatedAt: '2026-03-13T16:40:00Z',
  },
  {
    id: 'ord-002',
    folio: 'BCO-2026-0002',
    clientId: 'cli-003',
    clientNameSnapshot: 'Servicios Veterinarios Peninsulares SC',
    status: OrderStatus.Processing,
    items: [
      {
        productId: 'prod-001',
        sku: 'UVT-300-VT',
        productName: 'AlphaVet 300',
        productCategory: ProductCategory.UltrasoundVet,
        quantity: 1,
        unitPrice: 89500,
        totalLinePrice: 89500,
      },
      {
        productId: 'prod-004',
        sku: 'SRV-MNT-PREV',
        productName: 'Mantenimiento preventivo anual',
        productCategory: ProductCategory.Services,
        quantity: 1,
        unitPrice: 3800,
        totalLinePrice: 3800,
      },
      {
        productId: 'prod-003',
        sku: 'CON-GEL-500ML',
        productName: 'Gel conductor ultrasonico 500 ml',
        productCategory: ProductCategory.Consumables,
        quantity: 24,
        unitPrice: 145,
        totalLinePrice: 3480,
      },
    ],
    subtotal: 96780,
    taxPct: DEFAULT_ORDER_TAX_PCT,
    taxExempt: false,
    tax: 15484.8,
    total: 112264.8,
    notes: 'Pedido para nueva sala de imagen veterinaria. Pendiente confirmar fecha de instalacion.',
    createdAt: '2026-03-24T12:00:00Z',
    updatedAt: '2026-03-26T09:30:00Z',
  },
  {
    id: 'ord-003',
    folio: 'BCO-2026-0003',
    clientId: 'cli-002',
    clientNameSnapshot: 'Carlos Ruiz Altaba',
    status: OrderStatus.PendingPayment,
    items: [
      {
        productId: 'prod-005',
        sku: 'REF-SOND-L38',
        productName: 'Transductor lineal 3-8 MHz (refaccion)',
        productCategory: ProductCategory.SpareParts,
        quantity: 1,
        unitPrice: 12200,
        totalLinePrice: 12200,
      },
      {
        productId: 'prod-004',
        sku: 'SRV-MNT-PREV',
        productName: 'Mantenimiento preventivo anual',
        productCategory: ProductCategory.Services,
        quantity: 1,
        unitPrice: 3800,
        totalLinePrice: 3800,
      },
    ],
    subtotal: 16000,
    taxPct: DEFAULT_ORDER_TAX_PCT,
    taxExempt: true,
    tax: 0,
    total: 16000,
    notes: 'Facturacion exenta solicitada por convenio de servicio preferente.',
    createdAt: '2026-04-01T08:20:00Z',
    updatedAt: '2026-04-01T08:20:00Z',
  },
  {
    id: 'ord-004',
    folio: 'BCO-2026-0004',
    clientId: 'cli-003',
    clientNameSnapshot: 'Servicios Veterinarios Peninsulares SC',
    status: OrderStatus.Delivered,
    items: [
      {
        productId: 'prod-003',
        sku: 'CON-GEL-500ML',
        productName: 'Gel conductor ultrasonico 500 ml',
        productCategory: ProductCategory.Consumables,
        quantity: 40,
        unitPrice: 145,
        totalLinePrice: 5800,
      },
      {
        productId: 'prod-004',
        sku: 'SRV-MNT-PREV',
        productName: 'Mantenimiento preventivo anual',
        productCategory: ProductCategory.Services,
        quantity: 1,
        unitPrice: 3800,
        totalLinePrice: 3800,
      },
    ],
    subtotal: 9600,
    taxPct: DEFAULT_ORDER_TAX_PCT,
    taxExempt: false,
    tax: 1536,
    total: 11136,
    notes: 'Pedido entregado en bodega de cliente y validado por administracion.',
    createdAt: '2026-02-18T15:00:00Z',
    updatedAt: '2026-02-22T18:10:00Z',
  },
  {
    id: 'ord-005',
    folio: 'BCO-2026-0005',
    clientId: 'cli-001',
    clientNameSnapshot: 'Unidad de Diagnostico Avanzado S.A. de C.V.',
    status: OrderStatus.Shipped,
    items: [
      {
        productId: 'prod-002',
        sku: 'UHU-500-HM',
        productName: 'MedScan Pro 500',
        productCategory: ProductCategory.UltrasoundHuman,
        quantity: 1,
        unitPrice: 245000,
        totalLinePrice: 245000,
      },
      {
        productId: 'prod-005',
        sku: 'REF-SOND-L38',
        productName: 'Transductor lineal 3-8 MHz (refaccion)',
        productCategory: ProductCategory.SpareParts,
        quantity: 1,
        unitPrice: 12200,
        totalLinePrice: 12200,
      },
    ],
    subtotal: 257200,
    taxPct: DEFAULT_ORDER_TAX_PCT,
    taxExempt: false,
    tax: 41152,
    total: 298352,
    notes: 'Equipo embarcado a Merida con entrega en recepcion de ingenieria clinica.',
    createdAt: '2026-04-28T11:45:00Z',
    updatedAt: '2026-04-30T09:15:00Z',
  },
  {
    id: 'ord-006',
    folio: 'BCO-2026-0006',
    clientId: 'cli-003',
    clientNameSnapshot: 'Servicios Veterinarios Peninsulares SC',
    status: OrderStatus.Delivered,
    items: [
      {
        productId: 'prod-001',
        sku: 'UVT-300-VT',
        productName: 'AlphaVet 300',
        productCategory: ProductCategory.UltrasoundVet,
        quantity: 1,
        unitPrice: 89500,
        totalLinePrice: 89500,
      },
      {
        productId: 'prod-003',
        sku: 'CON-GEL-500ML',
        productName: 'Gel conductor ultrasonico 500 ml',
        productCategory: ProductCategory.Consumables,
        quantity: 18,
        unitPrice: 145,
        totalLinePrice: 2610,
      },
    ],
    subtotal: 92110,
    taxPct: DEFAULT_ORDER_TAX_PCT,
    taxExempt: false,
    tax: 14737.6,
    total: 106847.6,
    notes: 'Instalacion completada y acta de entrega firmada por la clinica veterinaria.',
    createdAt: '2026-05-02T09:05:00Z',
    updatedAt: '2026-05-03T17:30:00Z',
  },
  {
    id: 'ord-007',
    folio: 'BCO-2026-0007',
    clientId: 'cli-001',
    clientNameSnapshot: 'Unidad de Diagnostico Avanzado S.A. de C.V.',
    status: OrderStatus.PendingReview,
    items: [
      {
        productId: 'prod-004',
        sku: 'SRV-MNT-PREV',
        productName: 'Mantenimiento preventivo anual',
        productCategory: ProductCategory.Services,
        quantity: 2,
        unitPrice: 3800,
        totalLinePrice: 7600,
      },
      {
        productId: 'prod-003',
        sku: 'CON-GEL-500ML',
        productName: 'Gel conductor ultrasonico 500 ml',
        productCategory: ProductCategory.Consumables,
        quantity: 30,
        unitPrice: 145,
        totalLinePrice: 4350,
      },
    ],
    subtotal: 11950,
    taxPct: DEFAULT_ORDER_TAX_PCT,
    taxExempt: false,
    tax: 1912,
    total: 13862,
    notes: 'Solicitud en revision comercial antes de emitir confirmacion de surtido.',
    createdAt: '2026-05-06T13:25:00Z',
    updatedAt: '2026-05-06T13:25:00Z',
  },
  {
    id: 'ord-008',
    folio: 'BCO-2026-0008',
    clientId: 'cli-002',
    clientNameSnapshot: 'Carlos Ruiz Altaba',
    status: OrderStatus.Canceled,
    items: [
      {
        productId: 'prod-005',
        sku: 'REF-SOND-L38',
        productName: 'Transductor lineal 3-8 MHz (refaccion)',
        productCategory: ProductCategory.SpareParts,
        quantity: 1,
        unitPrice: 12200,
        totalLinePrice: 12200,
      },
      {
        productId: 'prod-003',
        sku: 'CON-GEL-500ML',
        productName: 'Gel conductor ultrasonico 500 ml',
        productCategory: ProductCategory.Consumables,
        quantity: 10,
        unitPrice: 145,
        totalLinePrice: 1450,
      },
    ],
    subtotal: 13650,
    taxPct: DEFAULT_ORDER_TAX_PCT,
    taxExempt: false,
    tax: 2184,
    total: 15834,
    notes: 'Pedido cancelado por cambio de presupuesto del cliente.',
    createdAt: '2026-05-10T16:10:00Z',
    updatedAt: '2026-05-11T09:40:00Z',
  },
  {
    id: 'ord-009',
    folio: 'BCO-2026-0009',
    clientId: 'cli-003',
    clientNameSnapshot: 'Servicios Veterinarios Peninsulares SC',
    status: OrderStatus.Paid,
    items: [
      {
        productId: 'prod-003',
        sku: 'CON-GEL-500ML',
        productName: 'Gel conductor ultrasonico 500 ml',
        productCategory: ProductCategory.Consumables,
        quantity: 60,
        unitPrice: 145,
        totalLinePrice: 8700,
      },
      {
        productId: 'prod-004',
        sku: 'SRV-MNT-PREV',
        productName: 'Mantenimiento preventivo anual',
        productCategory: ProductCategory.Services,
        quantity: 1,
        unitPrice: 3800,
        totalLinePrice: 3800,
      },
    ],
    subtotal: 12500,
    taxPct: DEFAULT_ORDER_TAX_PCT,
    taxExempt: false,
    tax: 2000,
    total: 14500,
    notes: 'Pago confirmado por transferencia. Programar entrega express de consumibles.',
    createdAt: '2026-05-13T10:30:00Z',
    updatedAt: '2026-05-13T12:10:00Z',
  },
  {
    id: 'ord-010',
    folio: 'BCO-2026-0010',
    clientId: 'cli-001',
    clientNameSnapshot: 'Unidad de Diagnostico Avanzado S.A. de C.V.',
    status: OrderStatus.Draft,
    items: [
      {
        productId: 'prod-004',
        sku: 'SRV-MNT-PREV',
        productName: 'Mantenimiento preventivo anual',
        productCategory: ProductCategory.Services,
        quantity: 1,
        unitPrice: 3800,
        totalLinePrice: 3800,
      },
      {
        productId: 'prod-003',
        sku: 'CON-GEL-500ML',
        productName: 'Gel conductor ultrasonico 500 ml',
        productCategory: ProductCategory.Consumables,
        quantity: 15,
        unitPrice: 145,
        totalLinePrice: 2175,
      },
    ],
    subtotal: 5975,
    taxPct: DEFAULT_ORDER_TAX_PCT,
    taxExempt: false,
    tax: 956,
    total: 6931,
    notes: 'Borrador generado durante llamada comercial para cierre del dia.',
    createdAt: '2026-05-15T09:40:00Z',
    updatedAt: '2026-05-15T09:40:00Z',
  },
];

@Injectable({
  providedIn: 'root'
})
export class OrderMockService {
  private readonly clientService = inject(ClientMockService);
  private readonly productsService = inject(ProductsMockService);

  private readonly _orders = signal<Order[]>([...MOCK_ORDERS]);
  private readonly _activeClients = signal<Client[]>([]);
  private readonly _availableProducts = signal<Product[]>([]);

  private catalogLoaded = false;
  private catalogPromise: Promise<void> | null = null;

  readonly orders = this._orders.asReadonly();
  readonly activeClients = computed(() => this._activeClients());
  readonly availableProducts = computed(() => this._availableProducts());

  constructor() {
    void this.ensureCatalogLoaded();
  }

  async getOrders(filters?: OrderFilters): Promise<Order[]> {
    await this.ensureCatalogLoaded();

    let result = [...this._orders()];

    if (filters?.search?.trim()) {
      const query = filters.search.trim().toLowerCase();
      result = result.filter(order =>
        order.folio.toLowerCase().includes(query) ||
        order.clientNameSnapshot.toLowerCase().includes(query) ||
        order.items.some(item =>
          item.productName.toLowerCase().includes(query) ||
          item.sku.toLowerCase().includes(query)
        )
      );
    }

    if (filters?.status) {
      result = result.filter(order => order.status === filters.status);
    }

    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return this.delay(result.map(order => ({ ...order, items: [...order.items] })), 300);
  }

  async getOrderById(id: string): Promise<Order | undefined> {
    await this.ensureCatalogLoaded();
    const order = this._orders().find(item => item.id === id);

    if (!order) {
      return this.delay(undefined, 200);
    }

    return this.delay({ ...order, items: [...order.items] }, 220);
  }

  async getActiveClients(): Promise<Client[]> {
    await this.ensureCatalogLoaded();
    return this.delay([...this._activeClients()], 180);
  }

  async getAvailableProducts(): Promise<Product[]> {
    await this.ensureCatalogLoaded();
    return this.delay([...this._availableProducts()], 180);
  }

  async createOrder(payload: OrderUpsertPayload): Promise<Order> {
    await this.ensureCatalogLoaded();

    const now = new Date().toISOString();
    const order = this.composeOrder({
      id: `ord-${Date.now()}`,
      folio: this.generateFolio(),
      createdAt: now,
      updatedAt: now,
      payload,
    });

    this._orders.update(current => [order, ...current]);

    return this.delay({ ...order, items: [...order.items] }, 350);
  }

  async updateOrder(id: string, payload: OrderUpsertPayload): Promise<Order | undefined> {
    await this.ensureCatalogLoaded();

    const currentOrders = this._orders();
    const currentIndex = currentOrders.findIndex(order => order.id === id);

    if (currentIndex === -1) {
      return this.delay(undefined, 220);
    }

    const currentOrder = currentOrders[currentIndex];
    const updatedOrder = this.composeOrder({
      id: currentOrder.id,
      folio: currentOrder.folio,
      createdAt: currentOrder.createdAt,
      updatedAt: new Date().toISOString(),
      payload,
    });

    const nextOrders = [...currentOrders];
    nextOrders[currentIndex] = updatedOrder;
    this._orders.set(nextOrders);

    return this.delay({ ...updatedOrder, items: [...updatedOrder.items] }, 350);
  }

  async deleteOrder(id: string): Promise<boolean> {
    const currentLength = this._orders().length;
    this._orders.update(current => current.filter(order => order.id !== id));
    return this.delay(this._orders().length < currentLength, 220);
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order | undefined> {
    await this.ensureCatalogLoaded();

    const currentOrders = this._orders();
    const currentIndex = currentOrders.findIndex(order => order.id === id);

    if (currentIndex === -1) {
      return this.delay(undefined, 220);
    }

    const updatedOrder: Order = {
      ...currentOrders[currentIndex],
      status,
      updatedAt: new Date().toISOString(),
    };

    const nextOrders = [...currentOrders];
    nextOrders[currentIndex] = updatedOrder;
    this._orders.set(nextOrders);

    return this.delay({ ...updatedOrder, items: [...updatedOrder.items] }, 250);
  }

  calculateTotals(items: OrderItemDraft[], taxPct: number = DEFAULT_ORDER_TAX_PCT, taxExempt = false): OrderTotals {
    const normalizedItems = this.normalizeItems(items);
    const subtotal = this.roundCurrency(
      normalizedItems.reduce((sum, item) => sum + item.totalLinePrice, 0)
    );
    const tax = taxExempt ? 0 : this.roundCurrency(subtotal * taxPct);

    return {
      subtotal,
      tax,
      total: this.roundCurrency(subtotal + tax),
    };
  }

  async getClientById(id: string): Promise<Client | undefined> {
    await this.ensureCatalogLoaded();

    const localClient = this._activeClients().find(client => client.id === id);
    if (localClient) {
      return this.delay({ ...localClient }, 120);
    }

    return this.clientService.getClientById(id);
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

  private composeOrder(config: {
    id: string;
    folio: string;
    createdAt: string;
    updatedAt: string;
    payload: OrderUpsertPayload;
  }): Order {
    const normalizedItems = this.normalizeItems(config.payload.items);
    const taxPct = this.sanitizeTaxPct(config.payload.taxPct);
    const taxExempt = !!config.payload.taxExempt;
    const totals = this.calculateTotals(normalizedItems, taxPct, taxExempt);

    return {
      id: config.id,
      folio: config.folio,
      clientId: config.payload.clientId,
      clientNameSnapshot: this.resolveClientName(config.payload.clientId, config.payload.clientNameSnapshot),
      status: config.payload.status ?? OrderStatus.Draft,
      items: normalizedItems,
      subtotal: totals.subtotal,
      taxPct,
      taxExempt,
      tax: totals.tax,
      total: totals.total,
      notes: config.payload.notes?.trim() ?? '',
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  private normalizeItems(items: OrderItemDraft[]): OrderItem[] {
    return items
      .filter(item => !!item.productId)
      .map(item => {
        const product = this._availableProducts().find(productItem => productItem.id === item.productId);
        const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
        const unitPrice = this.roundCurrency(
          item.unitPrice ?? product?.price_mxn ?? 0
        );

        return {
          productId: item.productId,
          sku: item.sku ?? product?.sku ?? 'SIN-SKU',
          productName: item.productName ?? product?.name ?? 'Producto sin referencia',
          productCategory: item.productCategory ?? product?.category ?? ProductCategory.Consumables,
          quantity,
          unitPrice,
          totalLinePrice: this.roundCurrency(quantity * unitPrice),
        };
      });
  }

  private resolveClientName(clientId: string, snapshot?: string): string {
    if (snapshot?.trim()) {
      return snapshot.trim();
    }

    return this._activeClients().find(client => client.id === clientId)?.businessName ?? 'Cliente no disponible';
  }

  private sanitizeTaxPct(taxPct?: number): number {
    const normalized = Number.isFinite(taxPct) ? Number(taxPct) : DEFAULT_ORDER_TAX_PCT;
    return normalized >= 0 ? normalized : DEFAULT_ORDER_TAX_PCT;
  }

  private generateFolio(): string {
    const year = new Date().getFullYear();
    const sequence = this._orders()
      .filter(order => order.folio.startsWith(`BCO-${year}-`))
      .map(order => Number(order.folio.split('-').at(-1)))
      .filter(value => Number.isFinite(value))
      .reduce((max, value) => Math.max(max, value), 0);

    return `BCO-${year}-${String(sequence + 1).padStart(4, '0')}`;
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private delay<T>(data: T, ms = 250): Promise<T> {
    return new Promise(resolve => setTimeout(() => resolve(data), ms));
  }
}

