import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge/status-badge.component';
import { ClientSupabaseService } from '../../services/client.supabase.service';
import { Client, ClientStatus, ClientType } from '../../../../core/models/client.model';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'bc-client-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, LoaderComponent, StatusBadgeComponent],
  templateUrl: './client-detail.component.html',
  styleUrls: ['./client-detail.component.css']
})
export class ClientDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private clientService = inject(ClientSupabaseService);

  isLoading = signal<boolean>(true);
  isDeleting = signal<boolean>(false);
  actionError = signal<string>('');
  client = signal<Client | null>(null);

  activeTab = signal<'info' | 'history'>('info');
  tabs = [
    { id: 'info' as const, label: 'Informacion general' },
    { id: 'history' as const, label: 'Historial comercial' }
  ];

  get breadcrumbs() {
    return [
      { label: 'Inicio', url: '/dashboard' },
      { label: 'Clientes', url: '/clientes' },
      { label: this.client() ? (this.client()!.businessName || this.client()!.business_name || 'Sin nombre') : 'Detalle' }
    ];
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      await this.loadClient(id);
    } else {
      await this.router.navigate(['/clientes']);
    }
  }

  async loadClient(id: string) {
    this.isLoading.set(true);
    this.actionError.set('');

    try {
      const data = await firstValueFrom(this.clientService.getClientById(id));
      if (data) {
        this.client.set(data);
      } else {
        await this.router.navigate(['/clientes']);
      }
    } catch {
      await this.router.navigate(['/clientes']);
    } finally {
      this.isLoading.set(false);
    }
  }

  setTab(tabId: 'info' | 'history') {
    this.activeTab.set(tabId);
  }

  async onDeleteClient() {
    const currentClient = this.client();
    if (!currentClient || this.isDeleting()) {
      return;
    }

    const confirmed = window.confirm(`Se eliminara el cliente "${currentClient.businessName}". Esta accion no se puede deshacer.`);
    if (!confirmed) {
      return;
    }

    this.isDeleting.set(true);
    this.actionError.set('');

    try {
      await firstValueFrom(this.clientService.deleteClient(currentClient.id));
      await this.router.navigate(['/clientes']);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible eliminar el cliente.';
      this.actionError.set(message);
    } finally {
      this.isDeleting.set(false);
    }
  }

  getTypeLabel(type: ClientType | string): string {
    switch (type) {
      case ClientType.Clinica: return 'Clinica';
      case ClientType.Medico: return 'Medico';
      case ClientType.Veterinario: return 'Veterinario';
      case ClientType.Institucion: return 'Institucion';
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
