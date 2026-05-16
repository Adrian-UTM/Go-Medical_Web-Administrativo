import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { OpportunitiesMockService } from '../../services/opportunities-mock.service';
import { Opportunity, OpportunityCartStatus, OpportunityStatus } from '../../models/opportunity.model';

@Component({
  selector: 'bc-opportunity-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CurrencyPipe,
    DatePipe,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoaderComponent,
    EmptyStateComponent,
    CustomSelectComponent,
  ],
  templateUrl: './opportunity-list.component.html',
  styleUrl: './opportunity-list.component.css',
})
export class OpportunityListComponent {
  private readonly opportunitiesService = inject(OpportunitiesMockService);

  readonly isLoading = signal(true);
  readonly opportunities = signal<Opportunity[]>([]);
  readonly searchQuery = signal('');
  readonly selectedCartStatus = signal<OpportunityCartStatus | ''>('');
  readonly selectedOpportunityStatus = signal<OpportunityStatus | ''>('');

  readonly cartStatusOptions = [
    { value: '', label: 'Todos los carritos' },
    { value: OpportunityCartStatus.Active, label: 'Activo' },
    { value: OpportunityCartStatus.Abandoned, label: 'Abandonado' },
    { value: OpportunityCartStatus.Recovered, label: 'Recuperado' },
    { value: OpportunityCartStatus.Converted, label: 'Convertido' },
    { value: OpportunityCartStatus.Closed, label: 'Cerrado' },
  ];

  readonly opportunityStatusOptions = [
    { value: '', label: 'Todos los estados' },
    { value: OpportunityStatus.New, label: 'Nueva' },
    { value: OpportunityStatus.Contacted, label: 'Contactado' },
    { value: OpportunityStatus.Interested, label: 'Interesado' },
    { value: OpportunityStatus.NoResponse, label: 'No respondio' },
    { value: OpportunityStatus.ConvertedToOrder, label: 'Convertida a pedido' },
    { value: OpportunityStatus.ConvertedToQuote, label: 'Convertida a cotizacion' },
    { value: OpportunityStatus.Closed, label: 'Cerrada' },
  ];

  readonly filteredOpportunities = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const cartStatus = this.selectedCartStatus();
    const opportunityStatus = this.selectedOpportunityStatus();

    return this.opportunities().filter(opportunity => {
      const matchesQuery = !query || [
        opportunity.folio,
        opportunity.contact.displayName,
        opportunity.contact.companyName,
        ...opportunity.items.map(item => item.productName),
      ].some(value => value.toLowerCase().includes(query));

      const matchesCartStatus = !cartStatus || opportunity.cartStatus === cartStatus;
      const matchesOpportunityStatus = !opportunityStatus || opportunity.opportunityStatus === opportunityStatus;
      return matchesQuery && matchesCartStatus && matchesOpportunityStatus;
    });
  });

  readonly hasActiveFilters = computed(() =>
    !!this.searchQuery().trim() || !!this.selectedCartStatus() || !!this.selectedOpportunityStatus()
  );

  constructor() {
    void this.loadOpportunities();
  }

  async loadOpportunities(): Promise<void> {
    this.isLoading.set(true);
    this.opportunities.set(await this.opportunitiesService.getOpportunities());
    this.isLoading.set(false);
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedCartStatus.set('');
    this.selectedOpportunityStatus.set('');
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
      [OpportunityStatus.NoResponse]: { label: 'No respondio', variant: 'danger' },
      [OpportunityStatus.ConvertedToOrder]: { label: 'Pedido', variant: 'primary' },
      [OpportunityStatus.ConvertedToQuote]: { label: 'Cotizacion', variant: 'primary' },
      [OpportunityStatus.Closed]: { label: 'Cerrada', variant: 'neutral' },
    };

    return map[status];
  }

  getItemsPreview(opportunity: Opportunity): string {
    const preview = opportunity.items.slice(0, 2).map(item => item.productName).join(', ');
    return opportunity.items.length > 2 ? `${preview}...` : preview;
  }

  getUnitsCount(opportunity: Opportunity): number {
    return opportunity.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  getTimeWithoutFinishing(opportunity: Opportunity): string {
    const diffMs = Math.max(0, Date.now() - new Date(opportunity.abandonedAt).getTime());
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} dia${days === 1 ? '' : 's'}`;
    }

    if (hours > 0) {
      return `${hours} h`;
    }

    return 'Menos de 1 h';
  }
}
