import { BadgeVariant } from '../shared/components/status-badge/status-badge.component';
import { Order } from './order.model';
import { Client } from '../core/models/client.model';

export enum ReturnRequestStatus {
  PendingReview = 'pending_review',
  Approved = 'approved',
  Rejected = 'rejected',
  ProductReceived = 'product_received',
  RefundProcessed = 'refund_processed',
  ReplacementSent = 'replacement_sent',
  Closed = 'closed',
  Cancelled = 'cancelled',
}

export enum ReturnReasonType {
  DefectiveProduct = 'defective_product',
  WrongProduct = 'wrong_product',
  DamagedShipping = 'damaged_shipping',
  CustomerError = 'customer_error',
  Warranty = 'warranty',
  Other = 'other',
}

export enum ReturnItemCondition {
  NotReceived = 'not_received',
  Unopened = 'unopened',
  Good = 'good',
  Damaged = 'damaged',
  Defective = 'defective',
  MissingParts = 'missing_parts',
}

export enum ReturnItemResolution {
  Pending = 'pending',
  Restock = 'restock',
  Repair = 'repair',
  Replace = 'replace',
  Refund = 'refund',
  Reject = 'reject',
  Scrap = 'scrap',
}

export interface ReturnRequestItem {
  id: string;
  returnRequestId: string;
  orderItemId: string;
  productId: string;
  productNameSnapshot: string;
  skuSnapshot: string;
  quantity: number;
  receivedQuantity: number;
  unitPriceMxn: number;
  subtotalMxn: number;
  conditionReceived: ReturnItemCondition;
  resolution: ReturnItemResolution;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReturnRequest {
  id: string;
  returnNumber: string;
  orderId: string;
  clientId: string;
  status: ReturnRequestStatus;
  reason: ReturnReasonType;
  customerComments: string;
  adminNotes: string;
  resolutionNotes: string;
  requestedBy?: string;
  reviewedBy?: string;
  closedBy?: string;
  requestedAt: string;
  reviewedAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
  items: ReturnRequestItem[];
  order?: Order;
  client?: Client;
}

export interface ReturnRequestFilters {
  search?: string;
  status?: ReturnRequestStatus | '';
  reason?: ReturnReasonType | '';
}

export interface CreateReturnRequestItemPayload {
  orderItemId: string;
  productId: string;
  productNameSnapshot: string;
  skuSnapshot: string;
  quantity: number;
  unitPriceMxn: number;
}

export interface CreateReturnRequestPayload {
  orderId: string;
  clientId: string;
  reason: ReturnReasonType;
  customerComments?: string;
  adminNotes?: string;
  items: CreateReturnRequestItemPayload[];
}

export interface UpdateReturnRequestItemPayload {
  id: string;
  receivedQuantity: number;
  conditionReceived: ReturnItemCondition;
  resolution: ReturnItemResolution;
  notes?: string;
}

export const RETURN_REQUEST_STATUS_LABELS: Record<ReturnRequestStatus, string> = {
  [ReturnRequestStatus.PendingReview]: 'Pendiente de revision',
  [ReturnRequestStatus.Approved]: 'Aprobada',
  [ReturnRequestStatus.Rejected]: 'Rechazada',
  [ReturnRequestStatus.ProductReceived]: 'Producto recibido',
  [ReturnRequestStatus.RefundProcessed]: 'Reembolso procesado',
  [ReturnRequestStatus.ReplacementSent]: 'Cambio enviado',
  [ReturnRequestStatus.Closed]: 'Cerrada',
  [ReturnRequestStatus.Cancelled]: 'Cancelada',
};

export const RETURN_REASON_LABELS: Record<ReturnReasonType, string> = {
  [ReturnReasonType.DefectiveProduct]: 'Producto defectuoso',
  [ReturnReasonType.WrongProduct]: 'Producto equivocado',
  [ReturnReasonType.DamagedShipping]: 'Dano en envio',
  [ReturnReasonType.CustomerError]: 'Error del cliente',
  [ReturnReasonType.Warranty]: 'Garantia',
  [ReturnReasonType.Other]: 'Otro',
};

export const RETURN_ITEM_CONDITION_LABELS: Record<ReturnItemCondition, string> = {
  [ReturnItemCondition.NotReceived]: 'No recibido',
  [ReturnItemCondition.Unopened]: 'Sin abrir',
  [ReturnItemCondition.Good]: 'Buen estado',
  [ReturnItemCondition.Damaged]: 'Danado',
  [ReturnItemCondition.Defective]: 'Defectuoso',
  [ReturnItemCondition.MissingParts]: 'Partes faltantes',
};

export const RETURN_ITEM_RESOLUTION_LABELS: Record<ReturnItemResolution, string> = {
  [ReturnItemResolution.Pending]: 'Pendiente',
  [ReturnItemResolution.Restock]: 'Reingresar a stock',
  [ReturnItemResolution.Repair]: 'Enviar a reparacion',
  [ReturnItemResolution.Replace]: 'Reemplazar',
  [ReturnItemResolution.Refund]: 'Reembolsar',
  [ReturnItemResolution.Reject]: 'Rechazar',
  [ReturnItemResolution.Scrap]: 'Merma',
};

export const RETURN_REQUEST_STATUS_VARIANTS: Record<ReturnRequestStatus, BadgeVariant> = {
  [ReturnRequestStatus.PendingReview]: 'warning',
  [ReturnRequestStatus.Approved]: 'info',
  [ReturnRequestStatus.Rejected]: 'danger',
  [ReturnRequestStatus.ProductReceived]: 'primary',
  [ReturnRequestStatus.RefundProcessed]: 'success',
  [ReturnRequestStatus.ReplacementSent]: 'success',
  [ReturnRequestStatus.Closed]: 'neutral',
  [ReturnRequestStatus.Cancelled]: 'danger',
};
