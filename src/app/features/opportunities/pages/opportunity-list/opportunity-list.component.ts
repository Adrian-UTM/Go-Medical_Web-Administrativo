import { Component, DestroyRef, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { OpportunitiesSupabaseService } from '../../services/opportunities.supabase.service';
import { Opportunity, OpportunityCartStatus, OpportunityStatus } from '../../models/opportunity.model';
import { PageVisibilityService } from '../../../../core/services/page-visibility.service';

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
export class OpportunityListComponent implements OnInit, OnDestroy {
  private readonly opportunitiesService = inject(OpportunitiesSupabaseService);
  private readonly pageVisibility = inject(PageVisibilityService);
  private readonly destroyRef = inject(DestroyRef);

  private loadInFlight = false;
  private pollingIntervalId: any;

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
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
    { value: OpportunityStatus.NoResponse, label: 'No respondió' },
    { value: OpportunityStatus.ConvertedToOrder, label: 'Convertida a pedido' },
    { value: OpportunityStatus.ConvertedToQuote, label: 'Convertida a cotización' },
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

  get emptyStateTitle(): string {
    if (this.errorMessage()) {
      return 'No se pudo cargar la información';
    }

    return this.hasActiveFilters() ? 'Sin oportunidades' : 'No hay oportunidades comerciales registradas';
  }

  get emptyStateDescription(): string {
    if (this.errorMessage()) {
      return this.errorMessage();
    }

    return this.hasActiveFilters()
      ? 'No se encontraron oportunidades con los filtros aplicados.'
      : 'No hay oportunidades comerciales registradas.';
  }

  ngOnInit(): void {
    void this.loadOpportunities();

    this.pageVisibility.visible$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.loadOpportunities();
      });

    this.startPolling();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollingIntervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void this.loadOpportunities();
      }
    }, 60000);
  }

  private stopPolling(): void {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = undefined;
    }
  }

  async loadOpportunities(): Promise<void> {
    if (this.loadInFlight) {
      return;
    }

    this.loadInFlight = true;
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      this.opportunities.set(await this.opportunitiesService.getOpportunities());
    } catch (error) {
      this.opportunities.set([]);
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible cargar las oportunidades comerciales.');
    } finally {
      this.loadInFlight = false;
      this.isLoading.set(false);
    }
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
      [OpportunityStatus.NoResponse]: { label: 'No respondió', variant: 'danger' },
      [OpportunityStatus.ConvertedToOrder]: { label: 'Pedido', variant: 'primary' },
      [OpportunityStatus.ConvertedToQuote]: { label: 'Cotización', variant: 'primary' },
      [OpportunityStatus.Closed]: { label: 'Cerrada', variant: 'neutral' },
    };

    return map[status];
  }

  getItemsPreview(opportunity: Opportunity): string {
    if (!opportunity.items.length) {
      return 'Sin productos asociados';
    }

    const preview = opportunity.items.slice(0, 2).map(item => item.productName).join(', ');
    return opportunity.items.length > 2 ? `${preview}...` : preview;
  }

  getUnitsCount(opportunity: Opportunity): number {
    return opportunity.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  getTimeWithoutFinishing(opportunity: Opportunity): string {
    const diffMs = Math.max(0, Date.now() - new Date(opportunity.abandonedAt).getTime());
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `Hace ${days} día${days === 1 ? '' : 's'}`;
    }

    if (hours > 0) {
      return `Hace ${hours} hora${hours === 1 ? '' : 's'}`;
    }

    if (minutes > 0) {
      return `Hace ${minutes} minuto${minutes === 1 ? '' : 's'}`;
    }

    return 'Hace unos instantes';
  }
}
