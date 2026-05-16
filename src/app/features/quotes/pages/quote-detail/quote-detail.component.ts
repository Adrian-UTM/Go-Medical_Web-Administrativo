import { Component, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { Client } from '../../../../core/models/client.model';
import { Quote, QuoteStatus } from '../../models/quote.model';
import { QuotePdfService } from '../../services/quote-pdf.service';
import { QuotesMockService } from '../../services/quotes.mock.service';

@Component({
  selector: 'bc-quote-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoaderComponent,
    CurrencyPipe,
    DatePipe,
  ],
  templateUrl: './quote-detail.component.html',
  styleUrl: './quote-detail.component.css',
})
export class QuoteDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly quotesService = inject(QuotesMockService);
  private readonly quotePdfService = inject(QuotePdfService);

  readonly isLoading = signal(true);
  readonly quote = signal<Quote | null>(null);
  readonly client = signal<Client | null>(null);
  readonly actionMessage = signal('');
  readonly isPreviewOpen = signal(false);
  readonly isGeneratingPdf = signal(false);

  constructor() {
    void this.loadQuote();
  }

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Cotizaciones', routerLink: '/cotizaciones' },
      { label: this.quote()?.quoteNumber ?? 'Detalle' },
    ];
  }

  async loadQuote(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');

    if (!id) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    const quote = await this.quotesService.getQuoteById(id);

    if (!quote) {
      this.quote.set(null);
      this.client.set(null);
      this.isLoading.set(false);
      return;
    }

    this.quote.set(quote);
    this.client.set(await this.quotesService.getClientById(quote.clientId) ?? null);
    this.isLoading.set(false);
  }

  async markAsSent(): Promise<void> {
    await this.updateStatus(QuoteStatus.Sent, 'Cotizacion marcada como enviada en flujo mock.');
  }

  async approveQuote(): Promise<void> {
    await this.updateStatus(QuoteStatus.Approved, 'Cotizacion aprobada en flujo mock.');
  }

  async rejectQuote(): Promise<void> {
    await this.updateStatus(QuoteStatus.Rejected, 'Cotizacion marcada como rechazada en flujo mock.');
  }

  async convertToOrder(): Promise<void> {
    await this.updateStatus(QuoteStatus.Converted, 'La cotizacion se marco como convertida. La conversion real a pedido se conectara en una fase posterior.');
  }

  openPdfPreview(): void {
    this.isPreviewOpen.set(true);
  }

  closePdfPreview(): void {
    this.isPreviewOpen.set(false);
  }

  async downloadPdf(): Promise<void> {
    const currentQuote = this.quote();
    if (!currentQuote) {
      return;
    }

    this.isGeneratingPdf.set(true);

    try {
      await this.quotePdfService.downloadQuotePdf(currentQuote, this.client());
      this.actionMessage.set('PDF generado y descargado correctamente en flujo local.');
    } catch {
      this.actionMessage.set('No fue posible generar el PDF. Revisa la configuracion local del proyecto.');
    } finally {
      this.isGeneratingPdf.set(false);
    }
  }

  sendByEmailMock(): void {
    const currentQuote = this.quote();
    const currentClient = this.client();

    if (!currentQuote) {
      return;
    }

    const email = currentClient?.billingEmail || currentClient?.email;
    if (!email) {
      this.actionMessage.set(`No hay correo disponible para ${currentQuote.clientNameSnapshot}.`);
      return;
    }

    const subject = `Cotizacion ${currentQuote.quoteNumber} - Go Medical`;
    const body = this.buildEmailBody(currentQuote, currentClient);
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    this.actionMessage.set(`Se abrio tu cliente de correo con la cotizacion ${currentQuote.quoteNumber} preparada para ${currentQuote.clientNameSnapshot}.`);
  }

  sendByWhatsappMock(): void {
    const currentQuote = this.quote();
    const currentClient = this.client();

    if (!currentQuote) {
      return;
    }

    const phone = this.normalizePhone(currentClient?.phone);
    if (!phone) {
      this.actionMessage.set(`No hay telefono disponible para ${currentQuote.clientNameSnapshot}.`);
      return;
    }

    const message = this.buildWhatsappMessage(currentQuote, currentClient);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    this.actionMessage.set(`Se abrio WhatsApp Web con el mensaje preparado para ${currentQuote.clientNameSnapshot}.`);
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

  getClientAddress(): string {
    const currentQuote = this.quote();
    if (!currentQuote) {
      return 'Direccion no disponible';
    }

    return this.quotePdfService.getClientAddress(currentQuote, this.client());
  }

  getClientRfc(): string {
    const currentQuote = this.quote();
    if (!currentQuote) {
      return 'RFC no disponible';
    }

    return this.quotePdfService.getClientRfc(currentQuote, this.client());
  }

  getClientContact(): string {
    return this.quotePdfService.getClientContact(this.client());
  }

  getCommercialTerms(): string[] {
    const currentQuote = this.quote();
    if (!currentQuote) {
      return [];
    }

    return this.quotePdfService.getCommercialTerms(currentQuote);
  }

  getCommercialContact(): string {
    return this.quotePdfService.getCommercialContact();
  }

  private async updateStatus(status: QuoteStatus, message: string): Promise<void> {
    const currentQuote = this.quote();
    if (!currentQuote) {
      return;
    }

    const updatedQuote = await this.quotesService.updateQuoteStatus(currentQuote.id, status);
    if (!updatedQuote) {
      return;
    }

    this.quote.set(updatedQuote);
    this.actionMessage.set(message);
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
