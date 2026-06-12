import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { Client } from '../../../../core/models/client.model';
import { Quote, QuoteStatus } from '../../models/quote.model';
import { QuotePdfService } from '../../services/quote-pdf.service';
import { QuoteSupabaseService } from '../../services/quote.supabase.service';

@Component({
  selector: 'bc-quote-pdf-list',
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
  templateUrl: './quote-pdf-list.component.html',
  styleUrl: './quote-pdf-list.component.css',
})
export class QuotePdfListComponent {
  private readonly quotesService = inject(QuoteSupabaseService);
  private readonly quotePdfService = inject(QuotePdfService);

  readonly isLoading = signal(true);
  readonly isGeneratingPdf = signal<string | null>(null);
  readonly quotes = signal<Quote[]>([]);
  readonly searchQuery = signal('');
  readonly selectedStatus = signal<QuoteStatus | ''>('');
  readonly actionMessage = signal('');

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

    try {
      this.quotes.set(await this.quotesService.getQuotes());
    } catch (error) {
      this.quotes.set([]);
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible cargar los PDFs generados.');
    } finally {
      this.isLoading.set(false);
    }
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedStatus.set('');
  }

  async downloadPdf(quote: Quote): Promise<void> {
    this.isGeneratingPdf.set(quote.id);

    try {
      const client = await this.quotesService.getClientById(quote.clientId) ?? null;
      await this.quotePdfService.downloadQuotePdf(quote, client);
      this.actionMessage.set(`PDF regenerado y descargado para ${quote.quoteNumber}.`);
    } catch {
      this.actionMessage.set(`No fue posible generar el PDF de ${quote.quoteNumber}.`);
    } finally {
      this.isGeneratingPdf.set(null);
    }
  }

  async shareByEmail(quote: Quote): Promise<void> {
    if (!this.confirmShare(quote, 'correo')) return;

    const client = await this.quotesService.getClientById(quote.clientId) ?? null;
    const email = client?.billingEmail || client?.email;

    if (!email) {
      this.actionMessage.set(`No hay correo disponible para ${quote.clientNameSnapshot}.`);
      return;
    }

    const subject = `Cotizacion ${quote.quoteNumber} - Go Medical`;
    const body = this.buildEmailBody(quote, client);
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    this.actionMessage.set(`Se abrio tu cliente de correo con la cotizacion ${quote.quoteNumber} preparada para ${quote.clientNameSnapshot}.`);
  }

  async shareByWhatsapp(quote: Quote): Promise<void> {
    if (!this.confirmShare(quote, 'WhatsApp')) return;

    const client = await this.quotesService.getClientById(quote.clientId) ?? null;
    const phone = this.normalizePhone(client?.phone);

    if (!phone) {
      this.actionMessage.set(`No hay telefono disponible para ${quote.clientNameSnapshot}.`);
      return;
    }

    const message = this.buildWhatsappMessage(quote, client);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    this.actionMessage.set(`Se abrio WhatsApp Web con el mensaje preparado para ${quote.clientNameSnapshot}.`);
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

  private buildEmailBody(quote: Quote, client: Client | null): string {
    const contactName = client?.contactName || quote.clientNameSnapshot;
    return [
      `Hola ${contactName},`,
      '',
      `Te compartimos la cotizacion ${quote.quoteNumber} de Go Medical.`,
      `Total estimado: ${this.formatCurrency(quote.total)} MXN.`,
      `Vigencia: ${this.formatDate(quote.validUntil)}.`,
      '',
      'Quedamos atentos para cualquier ajuste o confirmacion comercial.',
      '',
      this.quotePdfService.getCommercialContact(),
    ].join('\n');
  }

  private buildWhatsappMessage(quote: Quote, client: Client | null): string {
    const contactName = client?.contactName || quote.clientNameSnapshot;
    return [
      `Hola ${contactName},`,
      `te compartimos la cotizacion ${quote.quoteNumber} de Go Medical.`,
      `Total estimado: ${this.formatCurrency(quote.total)} MXN.`,
      `Vigencia: ${this.formatDate(quote.validUntil)}.`,
      'Quedamos atentos para cualquier comentario o confirmacion.',
    ].join(' ');
  }

  private confirmShare(quote: Quote, channel: string): boolean {
    return window.confirm(`Preparar ${channel} para la cotizacion ${quote.quoteNumber}?`);
  }

  private normalizePhone(phone?: string): string {
    if (!phone) {
      return '';
    }

    const digits = phone.replace(/\D/g, '');
    if (!digits) {
      return '';
    }

    return digits.startsWith('52') ? digits : `52${digits}`;
  }

  private formatDate(value: string): string {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(value));
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
    }).format(value);
  }
}
