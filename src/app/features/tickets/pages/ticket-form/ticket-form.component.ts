import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { Client } from '../../../../core/models/client.model';
import { Product, ProductCategory, ProductItemType } from '../../../../models/product.model';
import { ServiceTicket, TicketPriority, TicketStatus, TicketTechnician, TicketType, TicketUpsertPayload } from '../../models/ticket.model';
import { TicketSupabaseService } from '../../services/ticket.supabase.service';

@Component({
  selector: 'bc-ticket-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    LoaderComponent,
    CustomSelectComponent,
  ],
  templateUrl: './ticket-form.component.html',
  styleUrl: './ticket-form.component.css',
})
export class TicketFormComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ticketsService = inject(TicketSupabaseService);
  private readonly externalTechnicianValue = '__other__';

  readonly isEditMode = signal(false);
  readonly isLoadingData = signal(true);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly clients = signal<Client[]>([]);
  readonly products = signal<Product[]>([]);
  readonly technicians = signal<TicketTechnician[]>([]);
  readonly selectedClient = signal<Client | null>(null);
  readonly selectedProduct = signal<Product | null>(null);

  ticketId: string | null = null;

  readonly clientOptions = computed(() =>
    this.clients().map(client => ({
      value: client.id,
      label: client.tradeName ? `${client.businessName} (${client.tradeName})` : client.businessName,
    }))
  );

  readonly productOptions = computed(() => [
    { value: '', label: 'Sin producto asociado' },
    ...this.products().map(product => ({ value: product.id, label: `${product.sku} · ${product.name}` })),
  ]);

  readonly technicianOptions = computed(() => [
    { value: '', label: 'Sin asignar' },
    ...this.technicians().map(technician => ({ value: technician.id, label: technician.fullName })),
    { value: this.externalTechnicianValue, label: 'Otro' },
  ]);

  readonly typeOptions = [
    { value: TicketType.Preventive, label: 'Preventivo' },
    { value: TicketType.Corrective, label: 'Correctivo' },
    { value: TicketType.Warranty, label: 'Garantia' },
    { value: TicketType.Installation, label: 'Instalacion' },
    { value: TicketType.Review, label: 'Revision' },
    { value: TicketType.Other, label: 'Otro' },
  ];

  readonly priorityOptions = [
    { value: TicketPriority.Low, label: 'Baja' },
    { value: TicketPriority.Medium, label: 'Media' },
    { value: TicketPriority.High, label: 'Alta' },
    { value: TicketPriority.Urgent, label: 'Urgente' },
  ];

  readonly statusOptions = [
    { value: TicketStatus.Open, label: 'Abierto' },
    { value: TicketStatus.Assigned, label: 'Asignado' },
    { value: TicketStatus.InProgress, label: 'En proceso' },
    { value: TicketStatus.WaitingParts, label: 'Esperando refaccion' },
    { value: TicketStatus.Resolved, label: 'Resuelto' },
    { value: TicketStatus.Closed, label: 'Cerrado' },
    { value: TicketStatus.Canceled, label: 'Cancelado' },
  ];

  readonly form = this.fb.group({
    clientId: ['', Validators.required],
    clientNameSnapshot: [''],
    title: ['', [Validators.required, Validators.maxLength(180)]],
    description: ['', [Validators.required, Validators.maxLength(2000)]],
    type: [TicketType.Corrective, Validators.required],
    priority: [TicketPriority.Medium, Validators.required],
    status: [TicketStatus.Open, Validators.required],
    productId: [''],
    productNameSnapshot: [''],
    equipmentSerialNumber: ['', Validators.maxLength(100)],
    assignedTechnicianSelection: [''],
    assignedTechnicianCustomName: ['', Validators.maxLength(120)],
    scheduledAt: [''],
    notes: ['', Validators.maxLength(1000)],
  });

  constructor() {
    this.form.get('productId')?.valueChanges
      .pipe(
        startWith(this.form.get('productId')?.value),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(value => this.syncSelectedProduct(String(value ?? '')));

    this.form.get('assignedTechnicianSelection')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        if (value !== this.externalTechnicianValue) {
          this.form.patchValue({ assignedTechnicianCustomName: '' }, { emitEvent: false });
        }
      });

    void this.initialize();
  }

  get pageTitle(): string {
    return this.isEditMode() ? 'Editar ticket' : 'Nuevo ticket';
  }

  get isExternalTechnicianSelected(): boolean {
    return this.form.get('assignedTechnicianSelection')?.value === this.externalTechnicianValue;
  }

  get isSelectedProductService(): boolean {
    return (this.selectedProduct()?.item_type ?? ProductItemType.Product) === ProductItemType.Service;
  }

  get relatedProductLabel(): string {
    return this.isSelectedProductService ? 'Servicio relacionado' : 'Producto relacionado';
  }

  get selectedProductTypeLabel(): string {
    return this.isSelectedProductService ? 'Servicio' : 'Producto';
  }

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Tickets', routerLink: '/tickets' },
      { label: this.pageTitle },
    ];
  }

  async initialize(): Promise<void> {
    this.ticketId = this.route.snapshot.paramMap.get('id');
    const isEditing = !!this.ticketId;
    this.isEditMode.set(isEditing);
    this.isLoadingData.set(true);

    try {
      const [clients, products, technicians] = await Promise.all([
        this.ticketsService.getActiveClients(),
        this.ticketsService.getAvailableProducts(),
        this.ticketsService.getTechnicianProfiles(),
      ]);

      this.clients.set(clients);
      this.products.set(products);
      this.technicians.set(technicians);

      if (isEditing && this.ticketId) {
        await this.loadTicket(this.ticketId);
      }
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible preparar el formulario del ticket.');
    } finally {
      this.isLoadingData.set(false);
    }
  }

  async loadTicket(id: string): Promise<void> {
    const ticket = await this.ticketsService.getTicketById(id);

    if (!ticket) {
      await this.router.navigate(['/tickets']);
      return;
    }

    this.form.patchValue({
      clientId: ticket.clientId,
      clientNameSnapshot: ticket.clientNameSnapshot,
      title: ticket.title,
      description: ticket.description,
      type: ticket.type,
      priority: ticket.priority,
      status: ticket.status,
      productId: ticket.productId ?? '',
      productNameSnapshot: ticket.productNameSnapshot ?? '',
      equipmentSerialNumber: ticket.equipmentSerialNumber ?? '',
      assignedTechnicianSelection: ticket.assignedTechnicianCustomName ? this.externalTechnicianValue : ticket.assignedTechnicianId ?? '',
      assignedTechnicianCustomName: ticket.assignedTechnicianCustomName ?? '',
      scheduledAt: this.toDateTimeInputValue(ticket.scheduledAt),
      notes: ticket.notes,
    }, { emitEvent: false });

    // Bloquear técnico si el estado es Resuelto, Cerrado o Cancelado
    const statusLower = String(ticket.status).toLowerCase();
    const isTerminal = statusLower === 'resolved' || statusLower === 'resuelto' ||
                       statusLower === 'closed' || statusLower === 'cerrado' ||
                       statusLower === 'cancelled' || statusLower === 'canceled' || statusLower === 'cancelado';

    if (isTerminal) {
      this.form.get('assignedTechnicianSelection')?.disable({ emitEvent: false });
      this.form.get('assignedTechnicianCustomName')?.disable({ emitEvent: false });
      this.form.get('scheduledAt')?.disable({ emitEvent: false });
    } else {
      this.form.get('assignedTechnicianSelection')?.enable({ emitEvent: false });
      this.form.get('assignedTechnicianCustomName')?.enable({ emitEvent: false });
      this.form.get('scheduledAt')?.enable({ emitEvent: false });
    }

    this.syncSelectedClient(ticket.clientId, ticket);
    this.syncSelectedProduct(ticket.productId ?? '', ticket);
  }

  onClientSelected(clientId: string): void {
    this.syncSelectedClient(clientId);
  }

  onProductSelected(productId: string): void {
    this.syncSelectedProduct(productId);
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Completa los campos obligatorios antes de guardar el ticket.');
      return;
    }

    if (this.isExternalTechnicianSelected) {
      const customName = this.form.get('assignedTechnicianCustomName')?.value?.trim();
      if (!customName) {
        this.errorMessage.set('Ingresa el nombre del tecnico externo.');
        return;
      }
    }

    this.isSaving.set(true);
    this.errorMessage.set('');

    try {
      const payload = this.buildPayload();
      const savedTicket = this.isEditMode() && this.ticketId
        ? await this.ticketsService.updateTicket(this.ticketId, payload)
        : await this.ticketsService.createTicket(payload);

      if (!savedTicket) {
        this.errorMessage.set('No fue posible guardar el ticket.');
        return;
      }

      await this.router.navigate(['/tickets', savedTicket.id]);
    } catch (error) {
      console.error('[Tickets] save failed', error);
      this.errorMessage.set(error instanceof Error ? error.message : 'Ocurrio un error al guardar el ticket. Intenta nuevamente.');
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

  getCategoryLabel(category: ProductCategory): string {
    const labels: Record<string, string> = {
      [ProductCategory.EquipoMedico]: 'Equipo medico',
      [ProductCategory.UltrasonidoHumano]: 'Ultrasonido humano',
      [ProductCategory.UltrasonidoVeterinario]: 'Ultrasonido veterinario',
      [ProductCategory.Consumible]: 'Consumibles',
      [ProductCategory.Refaccion]: 'Refacciones',
      [ProductCategory.Accesorio]: 'Accesorios',
      [ProductCategory.Servicio]: 'Servicios',
      [ProductCategory.UltrasoundVet]: 'Ultrasonido veterinario',
      [ProductCategory.UltrasoundHuman]: 'Ultrasonido humano',
      [ProductCategory.Consumables]: 'Consumibles',
      [ProductCategory.SpareParts]: 'Refacciones',
      [ProductCategory.Services]: 'Servicios',
    };

    return labels[category] ?? 'Sin categoria';
  }

  private syncSelectedClient(clientId: string, ticket?: ServiceTicket): void {
    const client = this.clients().find(item => item.id === clientId) ?? null;
    this.selectedClient.set(client);

    this.form.patchValue({
      clientNameSnapshot: ticket?.clientNameSnapshot ?? client?.businessName ?? '',
    }, { emitEvent: false });
  }

  private syncSelectedProduct(productId: string, ticket?: ServiceTicket): void {
    const product = this.products().find(item => item.id === productId) ?? null;
    this.selectedProduct.set(product);

    this.form.patchValue({
      productNameSnapshot: ticket?.productNameSnapshot ?? product?.name ?? '',
      equipmentSerialNumber: product && (product.item_type ?? ProductItemType.Product) === ProductItemType.Service
        ? ''
        : this.form.get('equipmentSerialNumber')?.value ?? '',
    }, { emitEvent: false });
  }

  getStatusLabel(status: TicketStatus | string | null | undefined): string {
    if (!status) return 'Abierto';
    const normalized = String(status).trim().toLowerCase();
    switch (normalized) {
      case 'open':
      case 'abierto':
        return 'Abierto';
      case 'assigned':
      case 'asignado':
        return 'Asignado';
      case 'in_progress':
      case 'en proceso':
      case 'en_proceso':
        return 'En proceso';
      case 'waiting_parts':
      case 'esperando refaccion':
      case 'esperando_refaccion':
        return 'Esperando refacción';
      case 'resolved':
      case 'resuelto':
        return 'Resuelto';
      case 'closed':
      case 'cerrado':
        return 'Cerrado';
      case 'cancelled':
      case 'canceled':
      case 'cancelado':
        return 'Cancelado';
      default:
        return String(status);
    }
  }

  private buildPayload(): TicketUpsertPayload {
    const raw = this.form.getRawValue();

    let calculatedStatus = raw.status;
    if (!this.isEditMode()) {
      calculatedStatus = raw.assignedTechnicianSelection ? TicketStatus.Assigned : TicketStatus.Open;
    }

    return {
      clientId: raw.clientId ?? '',
      clientNameSnapshot: raw.clientNameSnapshot ?? '',
      title: raw.title ?? '',
      description: raw.description ?? '',
      priority: raw.priority ?? TicketPriority.Medium,
      type: raw.type ?? TicketType.Corrective,
      status: calculatedStatus ?? TicketStatus.Open,
      productId: raw.productId || undefined,
      productNameSnapshot: raw.productNameSnapshot || undefined,
      equipmentSerialNumber: this.isSelectedProductService ? undefined : raw.equipmentSerialNumber || undefined,
      assignedTechnicianId: raw.assignedTechnicianSelection && raw.assignedTechnicianSelection !== this.externalTechnicianValue
        ? raw.assignedTechnicianSelection
        : null,
      assignedTechnicianCustomName: raw.assignedTechnicianSelection === this.externalTechnicianValue
        ? raw.assignedTechnicianCustomName?.trim() || null
        : null,
      scheduledAt: this.toIsoFromDateTimeInput(raw.scheduledAt || ''),
      notes: raw.notes ?? '',
    };
  }

  private toDateTimeInputValue(isoDate?: string): string {
    if (!isoDate) {
      return '';
    }

    return new Date(isoDate).toISOString().slice(0, 16);
  }

  private toIsoFromDateTimeInput(value: string): string | undefined {
    if (!value) {
      return undefined;
    }

    return new Date(value).toISOString();
  }
}


