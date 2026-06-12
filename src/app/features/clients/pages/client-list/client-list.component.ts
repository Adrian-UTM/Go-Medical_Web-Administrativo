import { Component, DestroyRef, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { ClientSupabaseService } from '../../services/client.supabase.service';
import { Client, ClientType } from '../../../../core/models/client.model';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { PageVisibilityService } from '../../../../core/services/page-visibility.service';
import { ActionMenuComponent } from '../../../../shared/components/action-menu/action-menu.component';

@Component({
  selector: 'bc-client-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    PageHeaderComponent,
    LoaderComponent,
    CustomSelectComponent,
    ActionMenuComponent
  ],
  templateUrl: './client-list.component.html',
  styleUrls: ['./client-list.component.css']
})
export class ClientListComponent implements OnInit {
  private clientService = inject(ClientSupabaseService);
  private readonly pageVisibility = inject(PageVisibilityService);
  private readonly destroyRef = inject(DestroyRef);

  private loadInFlight = false;

  isLoading = signal<boolean>(false);
  isDeletingId = signal<string | null>(null);
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

    this.pageVisibility.visible$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.loadClients();
      });
  }

  async loadClients() {
    if (this.loadInFlight) {
      return;
    }

    this.loadInFlight = true;
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const data = await firstValueFrom(this.clientService.getClients());
      this._clients.set(data);
    } catch (err) {
      this._clients.set([]);
      this.errorMessage.set(err instanceof Error ? err.message : 'No fue posible cargar los clientes.');
    } finally {
      this.loadInFlight = false;
      this.isLoading.set(false);
    }
  }

  async onDeleteClient(client: Client): Promise<void> {
    if (this.isDeletingId() || !window.confirm(`¿Deseas eliminar a ${client.businessName}? Esta acción no se puede deshacer.`)) {
      return;
    }

    this.isDeletingId.set(client.id);
    this.errorMessage.set('');

    try {
      await firstValueFrom(this.clientService.deleteClient(client.id));
      this._clients.update(items => items.filter(item => item.id !== client.id));
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible eliminar el cliente.');
    } finally {
      this.isDeletingId.set(null);
    }
  }

  onSearch(query: string) {
    this.searchQuery.set(query);
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedType.set('all');
  }

  onTypeChangeCustom(value: string | ClientType) {
    this.selectedType.set(value as string);
  }

  getTypeLabel(type: ClientType): string {
    switch (type) {
      case ClientType.Clinica: return 'Clínica';
      case ClientType.Hospital: return 'Hospital';
      case ClientType.Medico: return 'Médico';
      case ClientType.Veterinario: return 'Veterinaria';
      case ClientType.Institucion: return 'Institución';
      case ClientType.Distribuidor: return 'Distribuidor';
      case ClientType.Empresa: return 'Empresa';
      case ClientType.Otro: return 'Otro';
      default: return type;
    }
  }

}
