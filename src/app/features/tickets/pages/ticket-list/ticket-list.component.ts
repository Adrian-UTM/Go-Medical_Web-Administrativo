import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ServiceTicket, TicketPriority, TicketStatus, TicketType } from '../../models/ticket.model';
import { TicketsMockService } from '../../services/tickets.mock.service';

@Component({
  selector: 'bc-ticket-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DatePipe,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoaderComponent,
    EmptyStateComponent,
    CustomSelectComponent,
  ],
  templateUrl: './ticket-list.component.html',
  styleUrl: './ticket-list.component.css',
})
export class TicketListComponent {
  private readonly ticketsService = inject(TicketsMockService);

  readonly isLoading = signal(true);
  readonly tickets = signal<ServiceTicket[]>([]);
  readonly searchQuery = signal('');
  readonly selectedStatus = signal<TicketStatus | ''>('');
  readonly selectedPriority = signal<TicketPriority | ''>('');
  readonly selectedType = signal<TicketType | ''>('');

  readonly statusOptions = [
    { value: '', label: 'Todos los estados' },
    { value: TicketStatus.Open, label: 'Abierto' },
    { value: TicketStatus.Assigned, label: 'Asignado' },
    { value: TicketStatus.InProgress, label: 'En proceso' },
    { value: TicketStatus.WaitingParts, label: 'Esperando refaccion' },
    { value: TicketStatus.Resolved, label: 'Resuelto' },
    { value: TicketStatus.Closed, label: 'Cerrado' },
    { value: TicketStatus.Canceled, label: 'Cancelado' },
  ];

  readonly priorityOptions = [
    { value: '', label: 'Todas las prioridades' },
    { value: TicketPriority.Low, label: 'Baja' },
    { value: TicketPriority.Medium, label: 'Media' },
    { value: TicketPriority.High, label: 'Alta' },
    { value: TicketPriority.Urgent, label: 'Urgente' },
  ];

  readonly typeOptions = [
    { value: '', label: 'Todos los tipos' },
    { value: TicketType.Preventive, label: 'Preventivo' },
    { value: TicketType.Corrective, label: 'Correctivo' },
    { value: TicketType.Warranty, label: 'Garantia' },
    { value: TicketType.Installation, label: 'Instalacion' },
    { value: TicketType.Review, label: 'Revision' },
    { value: TicketType.Other, label: 'Otro' },
  ];

  readonly filteredTickets = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const status = this.selectedStatus();
    const priority = this.selectedPriority();
    const type = this.selectedType();

    return this.tickets().filter(ticket => {
      const matchesQuery = !query || [
        ticket.ticketNumber,
        ticket.clientNameSnapshot,
        ticket.title,
        ticket.productNameSnapshot || '',
        ticket.equipmentSerialNumber || '',
        ticket.assignedTechnicianName || '',
      ].some(value => value.toLowerCase().includes(query));

      const matchesStatus = !status || ticket.status === status;
      const matchesPriority = !priority || ticket.priority === priority;
      const matchesType = !type || ticket.type === type;

      return matchesQuery && matchesStatus && matchesPriority && matchesType;
    });
  });

  readonly hasActiveFilters = computed(() =>
    !!this.searchQuery().trim() || !!this.selectedStatus() || !!this.selectedPriority() || !!this.selectedType()
  );

  constructor() {
    void this.loadTickets();
  }

  async loadTickets(): Promise<void> {
    this.isLoading.set(true);
    this.tickets.set(await this.ticketsService.getTickets());
    this.isLoading.set(false);
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedStatus.set('');
    this.selectedPriority.set('');
    this.selectedType.set('');
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

  getRelatedAsset(ticket: ServiceTicket): string {
    if (ticket.productNameSnapshot && ticket.equipmentSerialNumber) {
      return `${ticket.productNameSnapshot} · ${ticket.equipmentSerialNumber}`;
    }

    return ticket.productNameSnapshot || ticket.equipmentSerialNumber || 'Sin asociar';
  }
}
