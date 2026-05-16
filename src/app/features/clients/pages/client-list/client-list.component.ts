import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { ClientMockService } from '../../services/client.mock.service';
import { Client, ClientType, ClientStatus } from '../../../../core/models/client.model';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';

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
  private clientService = inject(ClientMockService);

  // Estado
  isLoading = signal<boolean>(true);
  searchQuery = signal<string>('');
  selectedType = signal<string>('all');
  
  // Opciones de filtro
  clientTypes = Object.values(ClientType);
  typeOptions = [
    { value: 'all', label: 'Todos los Tipos' },
    ...this.clientTypes.map(t => ({ value: t, label: this.getTypeLabel(t) }))
  ];
  
  // Título y Breadcrumbs
  pageTitle = 'Clientes';
  breadcrumbs = [
    { label: 'Inicio', url: '/dashboard' },
    { label: 'Clientes' }
  ];

  // Datos
  clients = computed(() => {
    let result = this.clientService.clients();
    
    // Filtrar por tipo
    if (this.selectedType() !== 'all') {
      result = result.filter(c => c.clientType === this.selectedType());
    }
    
    // Búsqueda
    const search = this.searchQuery().toLowerCase().trim();
    if (search) {
      result = result.filter(c => 
        c.businessName.toLowerCase().includes(search) || 
        c.contactName.toLowerCase().includes(search) ||
        (c.tradeName && c.tradeName.toLowerCase().includes(search)) ||
        c.email.toLowerCase().includes(search)
      );
    }
    
    return result;
  });

  async ngOnInit() {
    await this.loadClients();
  }

  async loadClients() {
    this.isLoading.set(true);
    await this.clientService.getClients();
    this.isLoading.set(false);
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
