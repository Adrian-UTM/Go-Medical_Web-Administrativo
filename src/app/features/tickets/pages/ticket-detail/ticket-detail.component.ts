import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { Client } from '../../../../core/models/client.model';
import { Product, ProductCategory, ProductItemType } from '../../../../models/product.model';
import { ServiceTicket, TicketHistoryItem, TicketPriority, TicketStatus, TicketType } from '../../models/ticket.model';
import { TicketSupabaseService } from '../../services/ticket.supabase.service';

@Component({
  selector: 'bc-ticket-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DatePipe,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoaderComponent,
    CustomSelectComponent,
  ],
  templateUrl: './ticket-detail.component.html',
  styleUrl: './ticket-detail.component.css',
})
export class TicketDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly ticketsService = inject(TicketSupabaseService);

  readonly isLoading = signal(true);
  readonly isProcessing = signal(false);
  readonly ticket = signal<ServiceTicket | null>(null);
  readonly client = signal<Client | null>(null);
  readonly product = signal<Product | null>(null);
  readonly isProductService = computed(() => this.product()?.item_type === 'service');
  readonly productCategoryLabel = signal('');
  readonly actionMessage = signal('');
  readonly selectedTechnician = signal('');
  readonly technicianOptions = computed(() => this.ticketsService.technicians().map(technician => ({ value: technician.id, label: technician.fullName })));

  readonly sortedHistory = computed(() => {
    const currentTicket = this.ticket();
    if (!currentTicket) {
      return [] as TicketHistoryItem[];
    }

    return [...currentTicket.history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  constructor() {
    void this.loadTicket();
  }

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Tickets', routerLink: '/tickets' },
      { label: this.ticket()?.ticketNumber ?? 'Detalle' },
    ];
  }

  async loadTicket(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');

    if (!id) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);

    try {
      const currentTicket = await this.ticketsService.getTicketById(id);

      if (!currentTicket) {
        this.ticket.set(null);
        this.client.set(null);
        return;
      }

      this.ticket.set(currentTicket);
      this.client.set(await this.ticketsService.getClientById(currentTicket.clientId) ?? null);
      this.selectedTechnician.set(currentTicket.assignedTechnicianId ?? '');

      if (currentTicket.productId) {
        let product = await this.ticketsService.getAvailableProducts().then(products => products.find(item => item.id === currentTicket.productId));
        if (!product) {
          product = await this.ticketsService.getProductById(currentTicket.productId);
        }
        this.product.set(product ?? null);
        this.productCategoryLabel.set(product ? this.getCategoryLabel(product.category) : '');
      } else {
        this.product.set(null);
        this.productCategoryLabel.set('');
      }
    } catch (error) {
      this.ticket.set(null);
      this.client.set(null);
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible cargar el ticket.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async assignTechnician(): Promise<void> {
    const currentTicket = this.ticket();
    const technicianId = this.selectedTechnician();

    if (!currentTicket || !technicianId) {
      this.actionMessage.set('Selecciona un tecnico para asignar el ticket.');
      return;
    }

    await this.applyUpdate(
      () => this.ticketsService.assignTechnician(currentTicket.id, technicianId),
      `Ticket asignado correctamente.`
    );
  }

  async markInProgress(): Promise<void> {
    await this.changeStatus(TicketStatus.InProgress, 'Ticket marcado como en proceso por seguimiento tecnico.');
  }

  async markWaitingParts(): Promise<void> {
    await this.changeStatus(TicketStatus.WaitingParts, 'Ticket marcado como esperando refaccion o confirmacion de componente.');
  }

  async markResolved(): Promise<void> {
    await this.changeStatus(TicketStatus.Resolved, 'Ticket marcado como resuelto tras la intervencion tecnica.');
  }

  async closeTicket(): Promise<void> {
    await this.changeStatus(TicketStatus.Closed, 'Ticket cerrado administrativamente despues de validar el seguimiento.');
  }

  async cancelTicket(): Promise<void> {
    await this.changeStatus(TicketStatus.Canceled, 'Ticket cancelado por cierre administrativo.');
  }

  getStatusBadge(status: TicketStatus): { label: string; variant: BadgeVariant } {
    const map: Record<TicketStatus, { label: string; variant: BadgeVariant }> = {
      [TicketStatus.Open]: { label: 'Abierto', variant: 'danger' },
      [TicketStatus.Assigned]: { label: 'Asignado', variant: 'info' },
      [TicketStatus.InProgress]: { label: 'En proceso', variant: 'primary' },
      [TicketStatus.WaitingParts]: { label: 'Esperando refaccion', variant: 'warning' },
      [TicketStatus.Resolved]: { label: 'Resuelto', variant: 'success' },
      [TicketStatus.Closed]: { label: 'Cerrado', variant: 'neutral' },
      [TicketStatus.Canceled]: { label: 'Cancelado', variant: 'danger' },
    };

    return map[status];
  }

  getPriorityBadge(priority: TicketPriority): { label: string; variant: BadgeVariant } {
    const map: Record<TicketPriority, { label: string; variant: BadgeVariant }> = {
      [TicketPriority.Low]: { label: 'Baja', variant: 'neutral' },
      [TicketPriority.Medium]: { label: 'Media', variant: 'info' },
      [TicketPriority.High]: { label: 'Alta', variant: 'warning' },
      [TicketPriority.Urgent]: { label: 'Urgente', variant: 'danger' },
    };

    return map[priority];
  }

  getTypeLabel(type: TicketType): string {
    const labels: Record<TicketType, string> = {
      [TicketType.Preventive]: 'Preventivo',
      [TicketType.Corrective]: 'Correctivo',
      [TicketType.Warranty]: 'Garantia',
      [TicketType.Installation]: 'Instalacion',
      [TicketType.Review]: 'Revision',
      [TicketType.Other]: 'Otro',
    };

    return labels[type];
  }

  getClientContact(): string {
    const currentClient = this.client();
    if (!currentClient) {
      return 'Contacto no disponible';
    }

    const parts = [currentClient.contactName, currentClient.email, currentClient.phone].filter(Boolean);
    return parts.join(' · ');
  }

  getRelatedAsset(): string {
    const currentTicket = this.ticket();
    if (!currentTicket) {
      return 'Sin asociar';
    }

    if (currentTicket.productNameSnapshot && currentTicket.equipmentSerialNumber) {
      return `${currentTicket.productNameSnapshot} · ${currentTicket.equipmentSerialNumber}`;
    }

    return currentTicket.productNameSnapshot || currentTicket.equipmentSerialNumber || 'Sin asociar';
  }

  private async changeStatus(status: TicketStatus, comment: string): Promise<void> {
    const currentTicket = this.ticket();
    if (!currentTicket) {
      return;
    }

    await this.applyUpdate(
      () => this.ticketsService.updateTicketStatus(currentTicket.id, status, comment),
      `Ticket actualizado a estado ${this.getStatusBadge(status).label.toLowerCase()}.`
    );
  }

  private async applyUpdate(
    operation: () => Promise<ServiceTicket | undefined>,
    successMessage: string,
  ): Promise<void> {
    this.isProcessing.set(true);

    try {
      const updated = await operation();
      if (!updated) {
        return;
      }

      this.ticket.set(updated);
      this.actionMessage.set(successMessage);
      if (updated.assignedTechnicianId) {
        this.selectedTechnician.set(updated.assignedTechnicianId ?? '');
      }
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible actualizar el ticket.');
    } finally {
      this.isProcessing.set(false);
    }
  }

  private getCategoryLabel(category: ProductCategory): string {
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
}
