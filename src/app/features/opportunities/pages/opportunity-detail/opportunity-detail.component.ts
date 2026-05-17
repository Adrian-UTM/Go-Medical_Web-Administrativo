import { Component, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { OpportunitiesSupabaseService } from '../../services/opportunities.supabase.service';
import { Opportunity, OpportunityCartStatus, OpportunityStatus } from '../../models/opportunity.model';
import { ProductCategory } from '../../../../models/product.model';

@Component({
  selector: 'bc-opportunity-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    CurrencyPipe,
    DatePipe,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoaderComponent,
  ],
  templateUrl: './opportunity-detail.component.html',
  styleUrl: './opportunity-detail.component.css',
})
export class OpportunityDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly opportunitiesService = inject(OpportunitiesSupabaseService);

  readonly isLoading = signal(true);
  readonly opportunity = signal<Opportunity | null>(null);
  readonly actionMessage = signal('');
  readonly errorMessage = signal('');

  constructor() {
    void this.loadOpportunity();
  }

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Oportunidades', routerLink: '/oportunidades' },
      { label: this.opportunity()?.folio ?? 'Detalle' },
    ];
  }

  async loadOpportunity(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      this.opportunity.set(await this.opportunitiesService.getOpportunityById(id) ?? null);
    } catch (error) {
      this.opportunity.set(null);
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible cargar la oportunidad.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async markAsContacted(): Promise<void> {
    await this.runAction(() => this.opportunitiesService.markAsContacted(this.opportunity()!.id), 'Oportunidad marcada como contactada.');
  }

  async markAsInterested(): Promise<void> {
    await this.runAction(() => this.opportunitiesService.markAsInterested(this.opportunity()!.id), 'Oportunidad marcada como interesada.');
  }

  async markAsNoResponse(): Promise<void> {
    await this.runAction(() => this.opportunitiesService.markAsNoResponse(this.opportunity()!.id), 'Oportunidad marcada como sin respuesta.');
  }

  async convertToOrder(): Promise<void> {
    await this.runAction(() => this.opportunitiesService.convertToOrder(this.opportunity()!.id), 'Oportunidad convertida a pedido.');
  }

  async convertToQuote(): Promise<void> {
    await this.runAction(() => this.opportunitiesService.convertToQuote(this.opportunity()!.id), 'Oportunidad convertida a cotización.');
  }

  async closeOpportunity(): Promise<void> {
    await this.runAction(() => this.opportunitiesService.closeOpportunity(this.opportunity()!.id), 'Oportunidad cerrada correctamente.');
  }

  getCartStatusBadge(status: OpportunityCartStatus): { label: string; variant: BadgeVariant } {
    const map: Record<OpportunityCartStatus, { label: string; variant: BadgeVariant }> = {
      [OpportunityCartStatus.Active]: { label: 'Activo', variant: 'info' },
      [OpportunityCartStatus.Abandoned]: { label: 'Abandonado', variant: 'warning' },
      [OpportunityCartStatus.Recovered]: { label: 'Recuperado', variant: 'success' },
      [OpportunityCartStatus.Converted]: { label: 'Convertido', variant: 'primary' },
      [OpportunityCartStatus.Closed]: { label: 'Cerrado', variant: 'neutral' },
    };

    return map[status];
  }

  getOpportunityStatusBadge(status: OpportunityStatus): { label: string; variant: BadgeVariant } {
    const map: Record<OpportunityStatus, { label: string; variant: BadgeVariant }> = {
      [OpportunityStatus.New]: { label: 'Nueva', variant: 'warning' },
      [OpportunityStatus.Contacted]: { label: 'Contactado', variant: 'info' },
      [OpportunityStatus.Interested]: { label: 'Interesado', variant: 'success' },
      [OpportunityStatus.NoResponse]: { label: 'No respondió', variant: 'danger' },
      [OpportunityStatus.ConvertedToOrder]: { label: 'Pedido', variant: 'primary' },
      [OpportunityStatus.ConvertedToQuote]: { label: 'Cotización', variant: 'primary' },
      [OpportunityStatus.Closed]: { label: 'Cerrada', variant: 'neutral' },
    };

    return map[status];
  }

  getCategoryLabel(category: ProductCategory): string {
    const labels: Record<string, string> = {
      [ProductCategory.UltrasonidoVeterinario]: 'Ultrasonido veterinario',
      [ProductCategory.UltrasonidoHumano]: 'Ultrasonido humano',
      [ProductCategory.Consumible]: 'Consumibles',
      [ProductCategory.Refaccion]: 'Refacciones',
      [ProductCategory.Servicio]: 'Servicios',
      [ProductCategory.UltrasoundVet]: 'Ultrasonido veterinario',
      [ProductCategory.UltrasoundHuman]: 'Ultrasonido humano',
      [ProductCategory.Consumables]: 'Consumibles',
      [ProductCategory.SpareParts]: 'Refacciones',
      [ProductCategory.Services]: 'Servicios',
    };

    return labels[category] ?? 'Sin categoría';
  }

  private async runAction(operation: () => Promise<Opportunity | undefined>, successMessage: string): Promise<void> {
    if (!this.opportunity()) {
      return;
    }

    this.actionMessage.set('');
    this.errorMessage.set('');

    try {
      const updated = await operation();
      if (!updated) {
        this.errorMessage.set('No fue posible actualizar la oportunidad.');
        return;
      }

      this.opportunity.set(updated);
      this.actionMessage.set(successMessage);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible actualizar la oportunidad.');
    }
  }
}
