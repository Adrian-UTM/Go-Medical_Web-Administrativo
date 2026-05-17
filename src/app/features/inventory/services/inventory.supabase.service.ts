import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ProductSupabaseService } from '../../products/services/product.supabase.service';
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
import { Product, ProductCategory } from '../../../models/product.model';

@Injectable({
  providedIn: 'root'
})
export class InventorySupabaseService {
  private readonly stockTable = 'inventory_stock';
  private readonly movementTable = 'inventory_movements';
  private readonly warehouseTable = 'warehouses';

  constructor(
    private readonly supabase: SupabaseService,
    private readonly productsService: ProductSupabaseService,
  ) {}

  async getStocks(filters?: InventoryStockFilters): Promise<InventoryStock[]> {
    const [stockResponse, warehouseResponse, products] = await Promise.all([
      this.supabase.client
        .from(this.stockTable)
        .select('*')
        .order('updated_at', { ascending: false }),
      this.supabase.client
        .from(this.warehouseTable)
        .select('*'),
      this.getInventoryProducts(),
    ]);

    if (stockResponse.error) {
      throw this.toAppError(stockResponse.error.message, 'No fue posible cargar el inventario.');
    }

    if (warehouseResponse.error) {
      throw this.toAppError(warehouseResponse.error.message, 'No fue posible cargar los almacenes.');
    }

    const productMap = new Map(products.map(product => [product.id, product]));
    const warehouseMap = new Map((warehouseResponse.data ?? []).map((warehouse: any) => [warehouse.id, warehouse]));

    const stocks = (stockResponse.data ?? []).map(row => this.mapStock(row, productMap, warehouseMap));
    return this.applyStockFilters(stocks, filters);
  }

  async getMovements(filters?: InventoryMovementFilters): Promise<InventoryMovement[]> {
    const [movementResponse, products] = await Promise.all([
      this.supabase.client
        .from(this.movementTable)
        .select('*')
        .order('created_at', { ascending: false }),
      this.getInventoryProducts(),
    ]);

    if (movementResponse.error) {
      throw this.toAppError(movementResponse.error.message, 'No fue posible cargar los movimientos de inventario.');
    }

    const productMap = new Map(products.map(product => [product.id, product]));
    const movements = (movementResponse.data ?? []).map(row => this.mapMovement(row, productMap));
    return this.applyMovementFilters(movements, filters);
  }

  async getInventoryProducts(): Promise<Product[]> {
    const products = await firstValueFrom(this.productsService.getProducts());
    return products.filter(product => product.is_active !== false);
  }

  async getStockByProductId(productId: string): Promise<InventoryStock | undefined> {
    const [stockResponse, warehouseResponse, products] = await Promise.all([
      this.supabase.client
        .from(this.stockTable)
        .select('*')
        .eq('product_id', productId)
        .order('updated_at', { ascending: false })
        .limit(1),
      this.supabase.client
        .from(this.warehouseTable)
        .select('*'),
      this.getInventoryProducts(),
    ]);

    if (stockResponse.error) {
      throw this.toAppError(stockResponse.error.message, 'No fue posible consultar el stock del producto.');
    }

    if (warehouseResponse.error) {
      throw this.toAppError(warehouseResponse.error.message, 'No fue posible consultar los almacenes.');
    }

    const row = stockResponse.data?.[0];
    if (!row) {
      return undefined;
    }

    const productMap = new Map(products.map(product => [product.id, product]));
    const warehouseMap = new Map((warehouseResponse.data ?? []).map((warehouse: any) => [warehouse.id, warehouse]));
    return this.mapStock(row, productMap, warehouseMap);
  }

  async registerManualMovement(payload: InventoryAdjustmentPayload): Promise<InventoryMovement> {
    const [currentStock, warehouseResponse, products] = await Promise.all([
      this.getStockByProductId(payload.productId),
      this.supabase.client.from(this.warehouseTable).select('*').limit(1),
      this.getInventoryProducts(),
    ]);

    if (warehouseResponse.error) {
      throw this.toAppError(warehouseResponse.error.message, 'No fue posible resolver el almacén del movimiento.');
    }

    const product = products.find(item => item.id === payload.productId);
    if (!product) {
      throw new Error('El producto seleccionado ya no está disponible o no tienes permisos para verlo.');
    }

    const previousStock = currentStock?.currentStock ?? 0;
    const signedQuantity = this.getSignedQuantity(payload.movementType, payload.quantity);
    const resultingStock = this.roundQuantity(previousStock + signedQuantity);

    if (resultingStock < 0) {
      throw new Error('El movimiento no puede dejar stock negativo.');
    }

    const now = new Date().toISOString();
    const warehouseId = (currentStock as any)?.warehouseId ?? warehouseResponse.data?.[0]?.id ?? null;
    const referenceId = `INV-${Date.now()}`;
    const insertPayload: Record<string, unknown> = {
      product_id: payload.productId,
      sku: product.sku,
      product_name: product.name,
      product_category: product.category,
      warehouse_id: warehouseId,
      movement_type: payload.movementType,
      quantity: signedQuantity,
      previous_stock: previousStock,
      resulting_stock: resultingStock,
      reference_type: ReferenceType.Manual,
      reference_id: referenceId,
      notes: payload.notes ?? '',
      created_by: payload.createdBy,
      created_at: now,
    };

    const { data, error } = await this.supabase.client
      .from(this.movementTable)
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      throw this.toAppError(error.message, 'No fue posible registrar el movimiento.');
    }

    const productMap = new Map(products.map(item => [item.id, item]));
    return this.mapMovement(data, productMap);
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
    if (!productId) {
      return null;
    }

    const normalizedQuantity = Number.isFinite(quantity) ? quantity : 0;
    const currentStock = 0;
    return this.roundQuantity(currentStock + this.getSignedQuantity(movementType, normalizedQuantity));
  }

  private mapStock(row: any, productMap: Map<string, Product>, warehouseMap: Map<string, any>): InventoryStock {
    const product = productMap.get(row.product_id);
    const warehouse = warehouseMap.get(row.warehouse_id);

    return {
      id: String(row.id),
      productId: String(row.product_id ?? product?.id ?? ''),
      sku: row.sku ?? product?.sku ?? 'Sin SKU',
      productName: row.product_name ?? product?.name ?? 'Producto sin nombre',
      productCategory: (row.product_category ?? product?.category ?? '') as ProductCategory,
      currentStock: Number(row.quantity ?? row.current_stock ?? row.stock ?? 0),
      minStock: Number(row.min_stock ?? 0),
      maxStock: Number(row.max_stock ?? 0),
      unit: (row.unit ?? product?.unit ?? 'unidad') as InventoryUnit,
      warehouseName: row.warehouse_name ?? warehouse?.name ?? warehouse?.warehouse_name ?? 'Almacen general',
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
      ...(row.warehouse_id ? { warehouseId: row.warehouse_id } : {}),
    } as InventoryStock;
  }

  private mapMovement(row: any, productMap: Map<string, Product>): InventoryMovement {
    const product = productMap.get(row.product_id);

    return {
      id: String(row.id),
      productId: String(row.product_id ?? product?.id ?? ''),
      sku: row.sku ?? product?.sku ?? 'Sin SKU',
      productName: row.product_name ?? product?.name ?? 'Producto sin nombre',
      productCategory: (row.product_category ?? product?.category ?? '') as ProductCategory,
      movementType: (row.movement_type ?? MovementType.Entry) as MovementType,
      quantity: Number(row.quantity ?? 0),
      previousStock: Number(row.previous_stock ?? 0),
      resultingStock: Number(row.resulting_stock ?? 0),
      referenceType: (row.reference_type ?? ReferenceType.Inventory) as ReferenceType,
      referenceId: String(row.reference_id ?? row.id ?? ''),
      notes: row.notes ?? '',
      createdAt: row.created_at ?? new Date().toISOString(),
      createdBy: row.created_by ?? 'Sistema',
    };
  }

  private applyStockFilters(stocks: InventoryStock[], filters?: InventoryStockFilters): InventoryStock[] {
    if (!filters) {
      return stocks;
    }

    const query = filters.search?.trim().toLowerCase();
    return stocks.filter(stock => {
      const matchesQuery = !query || [stock.sku, stock.productName, stock.warehouseName]
        .some(value => value.toLowerCase().includes(query));
      const matchesCategory = !filters.category || stock.productCategory === filters.category;
      const matchesStatus = !filters.stockStatus || this.getStockStatus(stock) === filters.stockStatus;
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }

  private applyMovementFilters(movements: InventoryMovement[], filters?: InventoryMovementFilters): InventoryMovement[] {
    if (!filters) {
      return movements;
    }

    const direction = filters.sortDirection ?? 'desc';
    const filtered = movements.filter(movement => {
      const matchesType = !filters.movementType || movement.movementType === filters.movementType;
      const matchesProduct = !filters.productId || movement.productId === filters.productId;
      const matchesCategory = !filters.category || movement.productCategory === filters.category;
      return matchesType && matchesProduct && matchesCategory;
    });

    return filtered.sort((a, b) => {
      const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return direction === 'asc' ? delta : -delta;
    });
  }

  private getSignedQuantity(movementType: MovementType, quantity: number): number {
    const normalized = Math.abs(Number(quantity) || 0);

    if (movementType === MovementType.Adjustment) {
      return Number(quantity) || 0;
    }

    if ([MovementType.Exit, MovementType.OrderDiscount, MovementType.ServiceUsage].includes(movementType)) {
      return -normalized;
    }

    return normalized;
  }

  private roundQuantity(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private toAppError(message: string, fallback: string): Error {
    const lowered = message.toLowerCase();
    if (lowered.includes('permission') || lowered.includes('rls') || lowered.includes('policy')) {
      return new Error('No tienes permisos para consultar o registrar movimientos de inventario.');
    }

    return new Error(message || fallback);
  }
}

