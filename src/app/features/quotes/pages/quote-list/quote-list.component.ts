import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { Quote, QuoteStatus } from '../../models/quote.model';
import { QuoteSupabaseService } from '../../services/quote.supabase.service';

@Component({
  selector: 'bc-quote-list',
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
  templateUrl: './quote-list.component.html',
  styleUrl: './quote-list.component.css',
})
export class QuoteListComponent {
  private readonly quotesService = inject(QuoteSupabaseService);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly quotes = signal<Quote[]>([]);
  readonly searchQuery = signal('');
  readonly selectedStatus = signal<QuoteStatus | ''>('');

  readonly statusOptions: { value: QuoteStatus | ''; label: string }[] = [
    { value: '', label: 'Todos los estados' },
    { value: QuoteStatus.Draft, label: 'Borrador' },
    { value: QuoteStatus.Sent, label: 'Enviada' },
    { value: QuoteStatus.Approved, label: 'Aprobada' },
    { value: QuoteStatus.Rejected, label: 'Rechazada' },
    { value: QuoteStatus.Expired, label: 'Vencida' },
    { value: QuoteStatus.Converted, label: 'Convertida' },
  ];

  readonly filteredQuotes = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const status = this.selectedStatus();

    return this.quotes().filter(quote => {
      const displayStatus = this.getDisplayStatus(quote);
      const matchesQuery = !query || [
        quote.quoteNumber,
        quote.clientNameSnapshot,
        ...quote.items.map(item => item.productName),
      ].some(value => value.toLowerCase().includes(query));

      const matchesStatus = !status || displayStatus === status;
      return matchesQuery && matchesStatus;
    });
  });

  readonly hasActiveFilters = computed(() => !!this.searchQuery().trim() || !!this.selectedStatus());

  constructor() {
    void this.loadQuotes();
  }

  async loadQuotes(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      this.quotes.set(await this.quotesService.getQuotes());
    } catch (error) {
      this.quotes.set([]);
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible cargar las cotizaciones.');
    } finally {
      this.isLoading.set(false);
    }
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedStatus.set('');
  }

  getDisplayStatus(quote: Quote): QuoteStatus {
    if (
      [QuoteStatus.Draft, QuoteStatus.Sent].includes(quote.status) &&
      new Date(quote.validUntil).getTime() < Date.now()
    ) {
      return QuoteStatus.Expired;
    }

    return quote.status;
  }

  getStatusBadge(status: QuoteStatus): { label: string; variant: BadgeVariant } {
    const statusMap: Record<QuoteStatus, { label: string; variant: BadgeVariant }> = {
      [QuoteStatus.Draft]: { label: 'Borrador', variant: 'neutral' },
      [QuoteStatus.Sent]: { label: 'Enviada', variant: 'primary' },
      [QuoteStatus.Approved]: { label: 'Aprobada', variant: 'success' },
      [QuoteStatus.Rejected]: { label: 'Rechazada', variant: 'danger' },
      [QuoteStatus.Expired]: { label: 'Vencida', variant: 'warning' },
      [QuoteStatus.Converted]: { label: 'Convertida', variant: 'info' },
    };

    return statusMap[status];
  }
}
