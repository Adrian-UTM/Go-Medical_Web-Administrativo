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

const MOCK_ORDERS: Order[] = [];

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

