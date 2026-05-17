import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { ClientSupabaseService } from '../../services/client.supabase.service';
import { Client, ClientType, ClientStatus } from '../../../../core/models/client.model';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'bc-client-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoaderComponent,
    CustomSelectComponent
  ],
  templateUrl: './client-list.component.html',
  styleUrls: ['./client-list.component.css']
})
export class ClientListComponent implements OnInit {
  private clientService = inject(ClientSupabaseService);

  isLoading = signal<boolean>(true);
  errorMessage = signal<string>('');
  searchQuery = signal<string>('');
  selectedType = signal<string>('all');

  clientTypes = Object.values(ClientType);
  typeOptions = [
    { value: 'all', label: 'Todos los Tipos' },
    ...this.clientTypes.map(t => ({ value: t, label: this.getTypeLabel(t) }))
  ];

  pageTitle = 'Clientes';
  breadcrumbs = [
    { label: 'Inicio', url: '/dashboard' },
    { label: 'Clientes' }
  ];

  private _clients = signal<Client[]>([]);

  clients = computed(() => {
    let result = this._clients();

    if (this.selectedType() !== 'all') {
      result = result.filter(c => c.clientType === this.selectedType());
    }

    const search = this.searchQuery().toLowerCase().trim();
    if (search) {
      result = result.filter(c =>
        (c.businessName?.toLowerCase().includes(search)) ||
        (c.contactName?.toLowerCase().includes(search)) ||
        (c.tradeName && c.tradeName.toLowerCase().includes(search)) ||
        (c.email?.toLowerCase().includes(search))
      );
    }

    return result;
  });

  readonly hasActiveFilters = computed(() => !!this.searchQuery().trim() || this.selectedType() !== 'all');

  get emptyStateTitle(): string {
    if (this.errorMessage()) {
      return 'No se pudo cargar la información';
    }

    return this.hasActiveFilters() ? 'No se encontraron clientes' : 'No hay clientes registrados';
  }

  get emptyStateText(): string {
    if (this.errorMessage()) {
      return this.errorMessage();
    }

    return this.hasActiveFilters()
      ? 'Intenta ajustar los filtros o el término de búsqueda.'
      : 'No hay clientes comerciales disponibles en este momento.';
  }

  async ngOnInit() {
    await this.loadClients();
  }

  async loadClients() {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const data = await firstValueFrom(this.clientService.getClients());
      this._clients.set(data);
    } catch (err) {
      this._clients.set([]);
      this.errorMessage.set(err instanceof Error ? err.message : 'No fue posible cargar los clientes.');
    } finally {
      this.isLoading.set(false);
    }
  }

  onSearch(query: string) {
    this.searchQuery.set(query);
  }

  onTypeChangeCustom(value: string | ClientType) {
    this.selectedType.set(value as string);
  }

  onTypeChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedType.set(select.value);
  }

  getTypeLabel(type: ClientType): string {
    switch (type) {
      case ClientType.Clinica: return 'Clínica';
      case ClientType.Medico: return 'Médico';
      case ClientType.Veterinario: return 'Veterinario';
      case ClientType.Institucion: return 'Institución';
      default: return type;
    }
  }

  getStatusBadge(status: ClientStatus) {
    return {
      label: status === ClientStatus.Active ? 'Activo' : 'Inactivo',
      variant: status === ClientStatus.Active ? 'success' : 'neutral'
    } as const;
  }
}
