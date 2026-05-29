import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ReturnRequestsSupabaseService } from '../../services/return-requests.supabase.service';
import {
  RETURN_ITEM_CONDITION_LABELS,
  RETURN_ITEM_RESOLUTION_LABELS,
  RETURN_REASON_LABELS,
  RETURN_REQUEST_STATUS_LABELS,
  RETURN_REQUEST_STATUS_VARIANTS,
  ReturnItemCondition,
  ReturnItemResolution,
  ReturnReasonType,
  ReturnRequest,
  ReturnRequestItem,
  ReturnRequestStatus,
  UpdateReturnRequestItemPayload,
} from '../../../../models/return-request.model';
import { OrderStatus } from '../../../../models/order.model';

interface EditableReturnItem extends UpdateReturnRequestItemPayload {
  skuSnapshot: string;
  productNameSnapshot: string;
  quantity: number;
  unitPriceMxn: number;
  subtotalMxn: number;
}

@Component({
  selector: 'bc-return-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CurrencyPipe,
    DatePipe,
    PageHeaderComponent,
    LoaderComponent,
    StatusBadgeComponent,
    CustomSelectComponent,
  ],
  templateUrl: './return-detail.component.html',
  styleUrl: './return-detail.component.css',
})
export class ReturnDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly returnRequestsService = inject(ReturnRequestsSupabaseService);

  readonly isLoading = signal(true);
  readonly isProcessing = signal(false);
  readonly isSavingNotes = signal(false);
  readonly isSavingItems = signal(false);
  readonly actionMessage = signal('');
  readonly request = signal<ReturnRequest | null>(null);
  readonly adminNotes = signal('');
  readonly resolutionNotes = signal('');
  readonly editableItems = signal<EditableReturnItem[]>([]);

  readonly conditionOptions = Object.values(ReturnItemCondition).map(value => ({
    value,
    label: RETURN_ITEM_CONDITION_LABELS[value],
  }));
  readonly resolutionOptions = Object.values(ReturnItemResolution).map(value => ({
    value,
    label: RETURN_ITEM_RESOLUTION_LABELS[value],
  }));

  readonly isTerminal = computed(() => {
    const status = this.request()?.status;
    return status === ReturnRequestStatus.Closed || status === ReturnRequestStatus.Cancelled;
  });

  constructor() {
    void this.loadReturnRequest();
  }

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Pedidos', routerLink: '/pedidos' },
      { label: 'Devoluciones', routerLink: '/pedidos' },
      { label: this.request()?.returnNumber ?? 'Detalle' },
    ];
  }

  async loadReturnRequest(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('returnId');
    if (!id) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.actionMessage.set('');

    try {
      const request = await this.returnRequestsService.getReturnRequestById(id);
      this.setRequest(request ?? null);
    } catch (error) {
      this.request.set(null);
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible cargar la devolucion.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async saveNotes(): Promise<void> {
    const current = this.request();
    if (!current || this.isSavingNotes()) {
      return;
    }

    this.isSavingNotes.set(true);
    this.actionMessage.set('');

    try {
      const updated = await this.returnRequestsService.updateReturnRequestNotes(current.id, {
        adminNotes: this.adminNotes(),
        resolutionNotes: this.resolutionNotes(),
      });
      this.setRequest(updated ?? current);
      this.actionMessage.set('Notas actualizadas correctamente.');
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible actualizar las notas.');
    } finally {
      this.isSavingNotes.set(false);
    }
  }

  async saveItems(): Promise<void> {
    const current = this.request();
    if (!current || this.isSavingItems()) {
      return;
    }

    const items = this.editableItems().map(item => ({
      id: item.id,
      receivedQuantity: Math.min(item.quantity, Math.max(0, Number(item.receivedQuantity) || 0)),
      conditionReceived: item.conditionReceived,
      resolution: item.resolution,
      notes: item.notes,
    }));

    this.isSavingItems.set(true);
    this.actionMessage.set('');

    try {
      const updated = await this.returnRequestsService.updateReturnRequestItems(current.id, items);
      this.setRequest(updated ?? current);
      this.actionMessage.set('Productos de la devolucion actualizados.');
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible actualizar los productos.');
    } finally {
      this.isSavingItems.set(false);
    }
  }

  async approve(): Promise<void> {
    await this.updateStatus(ReturnRequestStatus.Approved, 'Devolucion aprobada.');
  }

  async reject(): Promise<void> {
    await this.updateStatus(ReturnRequestStatus.Rejected, 'Devolucion rechazada.');
  }

  async markReceived(): Promise<void> {
    await this.updateStatus(ReturnRequestStatus.ProductReceived, 'Producto marcado como recibido.');
  }

  async processRefund(): Promise<void> {
    await this.updateStatus(ReturnRequestStatus.RefundProcessed, 'Reembolso procesado.');
  }

  async markReplacementSent(): Promise<void> {
    await this.updateStatus(ReturnRequestStatus.ReplacementSent, 'Cambio marcado como enviado.');
  }

  async closeRequest(): Promise<void> {
    await this.updateStatus(ReturnRequestStatus.Closed, 'Solicitud cerrada.');
  }

  async cancelRequest(): Promise<void> {
    await this.updateStatus(ReturnRequestStatus.Cancelled, 'Solicitud cancelada.');
  }

  canApprove(): boolean {
    return this.request()?.status === ReturnRequestStatus.PendingReview;
  }

  canReject(): boolean {
    return this.request()?.status === ReturnRequestStatus.PendingReview;
  }

  canMarkReceived(): boolean {
    return this.request()?.status === ReturnRequestStatus.Approved;
  }

  canProcessRefund(): boolean {
    return this.request()?.status === ReturnRequestStatus.ProductReceived;
  }

  canMarkReplacementSent(): boolean {
    return this.request()?.status === ReturnRequestStatus.ProductReceived;
  }

  canClose(): boolean {
    const status = this.request()?.status;
    return [
      ReturnRequestStatus.Approved,
      ReturnRequestStatus.ProductReceived,
      ReturnRequestStatus.RefundProcessed,
      ReturnRequestStatus.ReplacementSent,
      ReturnRequestStatus.Rejected,
    ].includes(status as ReturnRequestStatus);
  }

  canCancel(): boolean {
    const status = this.request()?.status;
    return status === ReturnRequestStatus.PendingReview || status === ReturnRequestStatus.Approved;
  }

  getStatusBadge(status: ReturnRequestStatus): { label: string; variant: BadgeVariant } {
    return {
      label: RETURN_REQUEST_STATUS_LABELS[status],
      variant: RETURN_REQUEST_STATUS_VARIANTS[status],
    };
  }

  getReasonLabel(reason: ReturnReasonType): string {
    return RETURN_REASON_LABELS[reason];
  }

  getConditionLabel(condition: ReturnItemCondition): string {
    return RETURN_ITEM_CONDITION_LABELS[condition];
  }

  getResolutionLabel(resolution: ReturnItemResolution): string {
    return RETURN_ITEM_RESOLUTION_LABELS[resolution];
  }

  getOrderStatusLabel(status?: OrderStatus): string {
    const map: Record<string, string> = {
      draft: 'Borrador',
      pending_review: 'Pendiente de revision',
      pending_payment: 'Pendiente de pago',
      paid: 'Pagado',
      processing: 'En proceso',
      shipped: 'Enviado',
      delivered: 'Entregado',
      completed: 'Entregado',
      canceled: 'Cancelado',
      cancelled: 'Cancelado',
    };
    return map[String(status ?? '').toLowerCase()] ?? 'Pedido';
  }

  clampReceivedQuantity(item: EditableReturnItem): void {
    item.receivedQuantity = Math.min(item.quantity, Math.max(0, Number(item.receivedQuantity) || 0));
  }

  private async updateStatus(status: ReturnRequestStatus, message: string): Promise<void> {
    const current = this.request();
    if (!current || this.isProcessing()) {
      return;
    }

    this.isProcessing.set(true);
    this.actionMessage.set('');

    try {
      const updated = await this.returnRequestsService.updateReturnRequestStatus(current.id, status);
      this.setRequest(updated ?? current);
      this.actionMessage.set(message);
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible actualizar la devolucion.');
    } finally {
      this.isProcessing.set(false);
    }
  }

  private setRequest(request: ReturnRequest | null): void {
    this.request.set(request);
    this.adminNotes.set(request?.adminNotes ?? '');
    this.resolutionNotes.set(request?.resolutionNotes ?? '');
    this.editableItems.set((request?.items ?? []).map(item => this.toEditableItem(item)));
  }

  private toEditableItem(item: ReturnRequestItem): EditableReturnItem {
    return {
      id: item.id,
      receivedQuantity: item.receivedQuantity,
      conditionReceived: item.conditionReceived,
      resolution: item.resolution,
      notes: item.notes,
      skuSnapshot: item.skuSnapshot,
      productNameSnapshot: item.productNameSnapshot,
      quantity: item.quantity,
      unitPriceMxn: item.unitPriceMxn,
      subtotalMxn: item.subtotalMxn,
    };
  }
}
