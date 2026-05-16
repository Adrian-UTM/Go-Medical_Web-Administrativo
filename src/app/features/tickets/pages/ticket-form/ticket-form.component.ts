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
import { Product, ProductCategory } from '../../../../models/product.model';
import { ServiceTicket, TicketPriority, TicketStatus, TicketType, TicketUpsertPayload } from '../../models/ticket.model';
import { TicketsMockService } from '../../services/tickets.mock.service';

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
  private readonly ticketsService = inject(TicketsMockService);

  readonly isEditMode = signal(false);
  readonly isLoadingData = signal(true);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly clients = signal<Client[]>([]);
  readonly products = signal<Product[]>([]);
  readonly technicians = signal<string[]>([]);
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
    ...this.technicians().map(name => ({ value: name, label: name })),
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
    assignedTechnicianName: [''],
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

    void this.initialize();
  }

  get pageTitle(): string {
    return this.isEditMode() ? 'Editar ticket' : 'Nuevo ticket';
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
    const isEditing = !!this.ticketId && this.route.snapshot.url.some(segment => segment.path === 'editar');
    this.isEditMode.set(isEditing);
    this.isLoadingData.set(true);

    const [clients, products] = await Promise.all([
      this.ticketsService.getActiveClients(),
      this.ticketsService.getAvailableProducts(),
    ]);

    this.clients.set(clients);
    this.products.set(products);
    this.technicians.set(this.ticketsService.technicians());

    if (isEditing && this.ticketId) {
      await this.loadTicket(this.ticketId);
    }

    this.isLoadingData.set(false);
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
      assignedTechnicianName: ticket.assignedTechnicianName ?? '',
      scheduledAt: this.toDateTimeInputValue(ticket.scheduledAt),
      notes: ticket.notes,
    }, { emitEvent: false });

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
    } catch {
      this.errorMessage.set('Ocurrio un error al guardar el ticket. Intenta nuevamente.');
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
    const labels: Record<ProductCategory, string> = {
      [ProductCategory.UltrasoundVet]: 'Ultrasonido veterinario',
      [ProductCategory.UltrasoundHuman]: 'Ultrasonido humano',
      [ProductCategory.Consumables]: 'Consumibles',
      [ProductCategory.SpareParts]: 'Refacciones',
      [ProductCategory.Services]: 'Servicios',
    };

    return labels[category];
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
    }, { emitEvent: false });
  }

  private buildPayload(): TicketUpsertPayload {
    const raw = this.form.getRawValue();

    return {
      clientId: raw.clientId ?? '',
      clientNameSnapshot: raw.clientNameSnapshot ?? '',
      title: raw.title ?? '',
      description: raw.description ?? '',
      priority: raw.priority ?? TicketPriority.Medium,
      type: raw.type ?? TicketType.Corrective,
      status: raw.status ?? TicketStatus.Open,
      productId: raw.productId || undefined,
      productNameSnapshot: raw.productNameSnapshot || undefined,
      equipmentSerialNumber: raw.equipmentSerialNumber || undefined,
      assignedTechnicianName: raw.assignedTechnicianName || undefined,
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
