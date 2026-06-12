// models/inventory.model.ts
// Modelos del modulo de inventario

import { ProductCategory } from './product.model';

export type InventoryUnit = 'pieza' | 'caja' | 'unidad' | 'litro' | 'rollo';

export enum InventoryStockStatus {
  Normal = 'normal',
  LowStock = 'low_stock',
  OutOfStock = 'out_of_stock',
}

export enum MovementType {
  InitialLoad = 'initial_load',
  Entry = 'entry',
  Exit = 'exit',
  Adjustment = 'adjustment',
  OrderReserve = 'order_reserve',
  OrderDiscount = 'order_discount',
  Return = 'return',
  ServiceUsage = 'service_usage',
}

export enum ReferenceType {
  Manual = 'manual',
  Order = 'order',
  Product = 'product',
  Service = 'service',
  Inventory = 'inventory',
}

export interface InventoryStock {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  productCategory: ProductCategory;
  brand?: string;
  model?: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unit: InventoryUnit;
  warehouseName: string;
  updatedAt: string;
  productImageUrl?: string;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  productCategory: ProductCategory;
  movementType: MovementType;
  quantity: number;
  previousStock: number;
  resultingStock: number;
  referenceType: ReferenceType;
  referenceId: string;
  notes: string;
  createdAt: string;
  createdBy: string;
  warehouseName?: string;
}

export interface InventoryStockFilters {
  search?: string;
  category?: ProductCategory | '';
  stockStatus?: InventoryStockStatus | '';
}

export interface InventoryMovementFilters {
  movementType?: MovementType | '';
  productId?: string;
  category?: ProductCategory | '';
  sortDirection?: 'asc' | 'desc';
}

export interface InventoryAdjustmentPayload {
  productId: string;
  movementType: MovementType;
  quantity: number;
  notes?: string;
  createdBy?: string;
}
