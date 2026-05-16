import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ProductsMockService } from '../../products/services/products.mock.service';
import { Product, ProductCategory, ProductStatus } from '../../../models/product.model';
import {
  InventoryAdjustmentPayload,
  InventoryMovement,
  InventoryMovementFilters,
  InventoryStock,
  InventoryStockFilters,
  InventoryStockStatus,
  InventoryUnit,
  MovementType,
  ReferenceType,
} from '../../../models/inventory.model';

interface StockSeed {
  productId: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unit: InventoryUnit;
  warehouseName: string;
  updatedAt: string;
}

interface MovementSeed {
  id: string;
  productId: string;
  movementType: MovementType;
  quantity: number;
  previousStock: number;
  resultingStock: number;
  referenceType: ReferenceType;
  referenceId: string;
  notes: string;
  createdAt: string;
  createdBy: string;
}

const STOCK_SEED: StockSeed[] = [
  {
    productId: 'prod-001',
    currentStock: 3,
    minStock: 1,
    maxStock: 8,
    unit: 'pieza',
    warehouseName: 'Almacen Central Merida',
    updatedAt: '2026-04-06T11:20:00Z',
  },
  {
    productId: 'prod-002',
    currentStock: 1,
    minStock: 1,
    maxStock: 4,
    unit: 'pieza',
    warehouseName: 'Almacen Central Merida',
    updatedAt: '2026-04-05T17:10:00Z',
  },
  {
    productId: 'prod-003',
    currentStock: 18,
    minStock: 24,
    maxStock: 120,
    unit: 'caja',
    warehouseName: 'Consumibles Clinicos',
    updatedAt: '2026-04-08T09:00:00Z',
  },
  {
    productId: 'prod-005',
    currentStock: 0,
    minStock: 2,
    maxStock: 10,
    unit: 'pieza',
    warehouseName: 'Refacciones Biomédicas',
    updatedAt: '2026-04-07T13:45:00Z',
  },
];

const MOVEMENT_SEED: MovementSeed[] = [
  {
    id: 'mov-001',
    productId: 'prod-001',
    movementType: MovementType.InitialLoad,
    quantity: 4,
    previousStock: 0,
    resultingStock: 4,
    referenceType: ReferenceType.Product,
    referenceId: 'prod-001',
    notes: 'Carga inicial de inventario para equipo veterinario de demostracion.',
    createdAt: '2026-03-01T09:00:00Z',
    createdBy: 'Administrador Go Medical',
  },
  {
    id: 'mov-002',
    productId: 'prod-001',
    movementType: MovementType.OrderReserve,
    quantity: 1,
    previousStock: 4,
    resultingStock: 3,
    referenceType: ReferenceType.Order,
    referenceId: 'BCO-2026-0002',
    notes: 'Reserva mock para pedido en proceso.',
    createdAt: '2026-03-24T12:15:00Z',
    createdBy: 'Ventas Go Medical',
  },
  {
    id: 'mov-003',
    productId: 'prod-002',
    movementType: MovementType.InitialLoad,
    quantity: 2,
    previousStock: 0,
    resultingStock: 2,
    referenceType: ReferenceType.Product,
    referenceId: 'prod-002',
    notes: 'Ingreso inicial de sistema de ultrasonido humano.',
    createdAt: '2026-03-03T10:00:00Z',
    createdBy: 'Administrador Go Medical',
  },
  {
    id: 'mov-004',
    productId: 'prod-002',
    movementType: MovementType.OrderDiscount,
    quantity: 1,
    previousStock: 2,
    resultingStock: 1,
    referenceType: ReferenceType.Order,
    referenceId: 'BCO-2026-0001',
    notes: 'Salida mock asociada a pedido pagado.',
    createdAt: '2026-03-13T16:30:00Z',
    createdBy: 'Ventas Go Medical',
  },
  {
    id: 'mov-005',
    productId: 'prod-003',
    movementType: MovementType.InitialLoad,
    quantity: 30,
    previousStock: 0,
    resultingStock: 30,
    referenceType: ReferenceType.Product,
    referenceId: 'prod-003',
    notes: 'Alta inicial de consumibles en almacen principal.',
    createdAt: '2026-02-25T08:45:00Z',
    createdBy: 'Almacen Go Medical',
  },
  {
    id: 'mov-006',
    productId: 'prod-003',
    movementType: MovementType.OrderReserve,
    quantity: 12,
    previousStock: 30,
    resultingStock: 18,
    referenceType: ReferenceType.Order,
    referenceId: 'BCO-2026-0001',
    notes: 'Reserva de gel conductor para entrega programada.',
    createdAt: '2026-03-12T10:30:00Z',
    createdBy: 'Almacen Go Medical',
  },
  {
    id: 'mov-007',
    productId: 'prod-005',
    movementType: MovementType.InitialLoad,
    quantity: 1,
    previousStock: 0,
    resultingStock: 1,
    referenceType: ReferenceType.Product,
    referenceId: 'prod-005',
    notes: 'Ingreso inicial de refaccion lineal.',
    createdAt: '2026-03-10T11:00:00Z',
    createdBy: 'Almacen Go Medical',
  },
  {
    id: 'mov-008',
    productId: 'prod-005',
    movementType: MovementType.OrderDiscount,
    quantity: 1,
    previousStock: 1,
    resultingStock: 0,
    referenceType: ReferenceType.Order,
    referenceId: 'BCO-2026-0003',
    notes: 'Salida mock para pedido pendiente de pago.',
    createdAt: '2026-04-01T08:30:00Z',
    createdBy: 'Ventas Go Medical',
  },
];

@Injectable({
  providedIn: 'root'
})
export class InventoryMockService {
  private readonly productsService = inject(ProductsMockService);

  private readonly _stocks = signal<InventoryStock[]>([]);
  private readonly _movements = signal<InventoryMovement[]>([]);
  private readonly _inventoryProducts = signal<Product[]>([]);

  private catalogLoaded = false;
  private catalogPromise: Promise<void> | null = null;

  readonly stocks = this._stocks.asReadonly();
  readonly movements = this._movements.asReadonly();
  readonly inventoryProducts = computed(() => this._inventoryProducts());

  constructor() {
    void this.ensureCatalogLoaded();
  }

  async getStocks(filters?: InventoryStockFilters): Promise<InventoryStock[]> {
    await this.ensureCatalogLoaded();

    let result = [...this._stocks()];

    if (filters?.search?.trim()) {
      const query = filters.search.trim().toLowerCase();
      result = result.filter(stock =>
        stock.sku.toLowerCase().includes(query) ||
        stock.productName.toLowerCase().includes(query) ||
        stock.warehouseName.toLowerCase().includes(query)
      );
    }

    if (filters?.category) {
      result = result.filter(stock => stock.productCategory === filters.category);
    }

    if (filters?.stockStatus) {
      result = result.filter(stock => this.getStockStatus(stock) === filters.stockStatus);
    }

    result.sort((a, b) => a.productName.localeCompare(b.productName));
    return this.delay(result.map(stock => ({ ...stock })), 260);
  }

  async getMovements(filters?: InventoryMovementFilters): Promise<InventoryMovement[]> {
    await this.ensureCatalogLoaded();

    let result = [...this._movements()];

    if (filters?.movementType) {
      result = result.filter(movement => movement.movementType === filters.movementType);
    }

    if (filters?.productId) {
      result = result.filter(movement => movement.productId === filters.productId);
    }

    if (filters?.category) {
      result = result.filter(movement => movement.productCategory === filters.category);
    }

    const sortDirection = filters?.sortDirection ?? 'desc';
    result.sort((a, b) => {
      const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDirection === 'asc' ? delta : -delta;
    });

    return this.delay(result.map(movement => ({ ...movement })), 280);
  }

  async getInventoryProducts(): Promise<Product[]> {
    await this.ensureCatalogLoaded();
    return this.delay([...this._inventoryProducts()], 180);
  }

  async getStockByProductId(productId: string): Promise<InventoryStock | undefined> {
    await this.ensureCatalogLoaded();
    const stock = this._stocks().find(item => item.productId === productId);
    return this.delay(stock ? { ...stock } : undefined, 160);
  }

  async registerManualMovement(payload: InventoryAdjustmentPayload): Promise<InventoryMovement> {
    await this.ensureCatalogLoaded();

    const quantity = Number(payload.quantity);
    if (!Number.isFinite(quantity) || quantity === 0) {
      throw new Error('La cantidad debe ser mayor a cero.');
    }

    const product = this._inventoryProducts().find(item => item.id === payload.productId);
    if (!product) {
      throw new Error('No se encontro el producto seleccionado.');
    }

    const currentStocks = this._stocks();
    const stockIndex = currentStocks.findIndex(item => item.productId === payload.productId);
    const currentStock = stockIndex >= 0 ? currentStocks[stockIndex] : this.createDefaultStock(product);
    const signedQuantity = this.resolveSignedQuantity(payload.movementType, quantity);
    const resultingStock = currentStock.currentStock + signedQuantity;

    if (resultingStock < 0) {
      throw new Error('El movimiento no puede dejar el stock en negativo.');
    }

    const updatedStock: InventoryStock = {
      ...currentStock,
      currentStock: resultingStock,
      updatedAt: new Date().toISOString(),
    };

    if (stockIndex >= 0) {
      const nextStocks = [...currentStocks];
      nextStocks[stockIndex] = updatedStock;
      this._stocks.set(nextStocks);
    } else {
      this._stocks.update(stocks => [updatedStock, ...stocks]);
    }

    const movement: InventoryMovement = {
      id: `mov-${Date.now()}`,
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      productCategory: product.category,
      movementType: payload.movementType,
      quantity: signedQuantity,
      previousStock: currentStock.currentStock,
      resultingStock,
      referenceType: ReferenceType.Manual,
      referenceId: `MAN-${Date.now()}`,
      notes: payload.notes?.trim() ?? '',
      createdAt: new Date().toISOString(),
      createdBy: payload.createdBy,
    };

    this._movements.update(movements => [movement, ...movements]);

    return this.delay({ ...movement }, 320);
  }

  getStockStatus(stock: InventoryStock): InventoryStockStatus {
    if (stock.currentStock <= 0) {
      return InventoryStockStatus.OutOfStock;
    }

    if (stock.currentStock <= stock.minStock) {
      return InventoryStockStatus.LowStock;
    }

    return InventoryStockStatus.Normal;
  }

  getProjectedStock(productId: string, movementType: MovementType, quantity: number): number | null {
    const stock = this._stocks().find(item => item.productId === productId);
    const product = this._inventoryProducts().find(item => item.id === productId);

    if (!stock && !product) {
      return null;
    }

    const currentStock = stock?.currentStock ?? 0;
    const signedQuantity = this.resolveSignedQuantity(movementType, quantity);
    return currentStock + signedQuantity;
  }

  private async ensureCatalogLoaded(): Promise<void> {
    if (this.catalogLoaded) {
      return;
    }

    if (!this.catalogPromise) {
      this.catalogPromise = (async () => {
        const productResponse = await firstValueFrom(
          this.productsService.getProducts({ status: ProductStatus.Active })
        );
        const products = productResponse.data.filter(product => product.category !== ProductCategory.Services);

        this._inventoryProducts.set(products);
        this._stocks.set(this.buildStocks(products));
        this._movements.set(this.buildMovements(products));
        this.catalogLoaded = true;
      })();
    }

    await this.catalogPromise;
  }

  private buildStocks(products: Product[]): InventoryStock[] {
    return STOCK_SEED
      .map(seed => {
        const product = products.find(item => item.id === seed.productId);
        if (!product) {
          return null;
        }

        return {
          id: `stk-${product.id}`,
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          productCategory: product.category,
          currentStock: seed.currentStock,
          minStock: seed.minStock,
          maxStock: seed.maxStock,
          unit: seed.unit,
          warehouseName: seed.warehouseName,
          updatedAt: seed.updatedAt,
        } satisfies InventoryStock;
      })
      .filter((stock): stock is InventoryStock => !!stock);
  }

  private buildMovements(products: Product[]): InventoryMovement[] {
    return MOVEMENT_SEED
      .map(seed => {
        const product = products.find(item => item.id === seed.productId);
        if (!product) {
          return null;
        }

        return {
          id: seed.id,
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          productCategory: product.category,
          movementType: seed.movementType,
          quantity: seed.quantity,
          previousStock: seed.previousStock,
          resultingStock: seed.resultingStock,
          referenceType: seed.referenceType,
          referenceId: seed.referenceId,
          notes: seed.notes,
          createdAt: seed.createdAt,
          createdBy: seed.createdBy,
        } satisfies InventoryMovement;
      })
      .filter((movement): movement is InventoryMovement => !!movement)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  private createDefaultStock(product: Product): InventoryStock {
    return {
      id: `stk-${product.id}`,
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      productCategory: product.category,
      currentStock: 0,
      minStock: 1,
      maxStock: 10,
      unit: this.resolveDefaultUnit(product.category),
      warehouseName: 'Almacen General',
      updatedAt: new Date().toISOString(),
    };
  }

  private resolveSignedQuantity(movementType: MovementType, quantity: number): number {
    const absQuantity = Math.abs(quantity);

    switch (movementType) {
      case MovementType.Entry:
      case MovementType.InitialLoad:
      case MovementType.Return:
        return absQuantity;
      case MovementType.Exit:
      case MovementType.OrderReserve:
      case MovementType.OrderDiscount:
      case MovementType.ServiceUsage:
        return -absQuantity;
      case MovementType.Adjustment:
        return quantity;
      default:
        return quantity;
    }
  }

  private resolveDefaultUnit(category: ProductCategory): InventoryUnit {
    switch (category) {
      case ProductCategory.Consumables:
        return 'caja';
      case ProductCategory.SpareParts:
        return 'pieza';
      default:
        return 'unidad';
    }
  }

  private delay<T>(data: T, ms = 240): Promise<T> {
    return new Promise(resolve => setTimeout(() => resolve(data), ms));
  }
}

