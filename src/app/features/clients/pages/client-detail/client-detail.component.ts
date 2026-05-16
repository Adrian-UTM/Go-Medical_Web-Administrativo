import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { ClientMockService } from '../../services/client.mock.service';
import { Client, ClientType, ClientStatus } from '../../../../core/models/client.model';

@Component({
  selector: 'bc-client-detail',
  standalone: true,
  imports: [
    CommonModule, 
    RouterLink, 
    PageHeaderComponent, 
    StatusBadgeComponent, 
    LoaderComponent
  ],
  templateUrl: './client-detail.component.html',
  styleUrls: ['./client-detail.component.css']
})
export class ClientDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private clientService = inject(ClientMockService);

  isLoading = signal<boolean>(true);
  client = signal<Client | null>(null);
  
  // Tabs for the detail view
  activeTab = signal<'info' | 'history'>('info');
  tabs = [
    { id: 'info' as const, label: 'Información General' },
    { id: 'history' as const, label: 'Historial Comercial' }
  ];

  get breadcrumbs() {
    return [
      { label: 'Inicio', url: '/dashboard' },
      { label: 'Clientes', url: '/clientes' },
      { label: this.client() ? this.client()!.businessName : 'Detalle' }
    ];
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      await this.loadClient(id);
    }
  }

  async loadClient(id: string) {
    this.isLoading.set(true);
    const client = await this.clientService.getClientById(id);
    if (client) {
      this.client.set(client);
    } else {
      this.router.navigate(['/clientes']);
    }
    this.isLoading.set(false);
  }

  setTab(tabId: 'info' | 'history') {
    this.activeTab.set(tabId);
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
