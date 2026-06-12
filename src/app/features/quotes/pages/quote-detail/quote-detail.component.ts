import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { Client } from '../../../../core/models/client.model';
import { ProductDocument, Quote, QuoteStatus } from '../../models/quote.model';
import { QuotePdfService } from '../../services/quote-pdf.service';
import { QuoteSupabaseService } from '../../services/quote.supabase.service';

type SendChannel = 'email' | 'whatsapp';

interface ShareLink {
  label: string;
  url: string;
  type: string;
  productName?: string;
}

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
  private readonly quotesService = inject(QuoteSupabaseService);
  private readonly quotePdfService = inject(QuotePdfService);

  readonly isLoading = signal(true);
  readonly quote = signal<Quote | null>(null);
  readonly client = signal<Client | null>(null);
  readonly actionMessage = signal('');
  readonly isPreviewOpen = signal(false);
  readonly isSendModalOpen = signal(false);
  readonly sendModalOpen = this.isSendModalOpen.asReadonly();
  readonly sendChannel = signal<SendChannel>('email');
  readonly isGeneratingPdf = signal(false);
  readonly productDocuments = signal<ProductDocument[]>([]);
  readonly selectedDocumentIds = signal<Set<string>>(new Set());
  readonly includeQuotePdf = signal(true);

  readonly selectedProductDocuments = computed(() =>
    this.productDocuments().filter(doc => this.selectedDocumentIds().has(doc.id))
  );

  readonly selectedAttachmentCount = computed(() =>
    (this.includeQuotePdf() ? 1 : 0) + this.selectedProductDocuments().length
  );

  readonly missingProductDocumentCount = computed(() => {
    const currentQuote = this.quote();
    if (!currentQuote) return 0;

    const quotedProductIds = new Set(
      currentQuote.items.map(item => item.productId).filter(Boolean)
    );
    const productIdsWithDocuments = new Set(
      this.productDocuments().map(doc => doc.productId).filter(Boolean)
    );

    return [...quotedProductIds].filter(productId => !productIdsWithDocuments.has(productId)).length;
  });

  readonly hasMissingProductDocuments = computed(() => this.missingProductDocumentCount() > 0);

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

    try {
      const quote = await this.quotesService.getQuoteById(id);

      if (!quote) {
        this.quote.set(null);
        this.client.set(null);
        this.productDocuments.set([]);
        this.selectedDocumentIds.set(new Set());
        return;
      }

      this.quote.set(quote);
      this.client.set(await this.quotesService.getClientById(quote.clientId) ?? null);

      // Load product documents for all items
      const productIds = quote.items
        .map(item => item.productId)
        .filter(Boolean);
      if (productIds.length > 0) {
        const docs = await this.quotesService.getProductDocuments(productIds);
        this.productDocuments.set(docs);
        this.selectedDocumentIds.set(new Set(docs.map(doc => doc.id)));
      } else {
        this.productDocuments.set([]);
        this.selectedDocumentIds.set(new Set());
      }
    } catch (error) {
      this.quote.set(null);
      this.client.set(null);
      this.productDocuments.set([]);
      this.selectedDocumentIds.set(new Set());
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible cargar la cotización.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async markAsSent(): Promise<void> {
    await this.updateStatus(QuoteStatus.Sent, 'Cotizacion marcada como enviada.');
  }

  async approveQuote(): Promise<void> {
    await this.updateStatus(QuoteStatus.Approved, 'Cotizacion aprobada.');
  }

  async rejectQuote(): Promise<void> {
    await this.updateStatus(QuoteStatus.Rejected, 'Cotizacion marcada como rechazada.');
  }

  async convertToOrder(): Promise<void> {
    await this.updateStatus(QuoteStatus.Converted, 'Cotizacion marcada como convertida.');
  }

  openPdfPreview(): void {
    this.isPreviewOpen.set(true);
  }

  closePdfPreview(): void {
    this.isPreviewOpen.set(false);
  }

  async downloadPdf(): Promise<void> {
    const currentQuote = this.quote();
    if (!currentQuote) return;

    this.isGeneratingPdf.set(true);
    try {
      await this.quotePdfService.downloadQuotePdf(currentQuote, this.client());
      this.actionMessage.set('PDF generado y descargado correctamente.');
    } catch {
      this.actionMessage.set('No fue posible generar el PDF. Intenta nuevamente.');
    } finally {
      this.isGeneratingPdf.set(false);
    }
  }

  toggleDocument(docId: string): void {
    const current = new Set(this.selectedDocumentIds());
    if (current.has(docId)) {
      current.delete(docId);
    } else {
      current.add(docId);
    }
    this.selectedDocumentIds.set(current);
  }

  toggleQuotePdf(): void {
    this.includeQuotePdf.update(current => !current);
  }

  isDocumentSelected(docId: string): boolean {
    return this.selectedDocumentIds().has(docId);
  }

  downloadSelectedDocuments(): void {
    const docs = this.productDocuments().filter(doc =>
      this.selectedDocumentIds().has(doc.id)
    );
    if (!docs.length) return;

    docs.forEach(doc => {
      const url = this.quotesService.getPublicDocumentUrl(doc.filePath);
      if (url) {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.download = doc.fileName ?? doc.title;
        link.click();
      }
    });

    this.actionMessage.set(`Descargando ${docs.length} documento${docs.length !== 1 ? 's' : ''}.`);
  }

  openSendModal(channel: SendChannel): void {
    this.sendChannel.set(channel);
    this.isSendModalOpen.set(true);
  }

  closeSendModal(): void {
    this.isSendModalOpen.set(false);
  }

  confirmSendQuote(): void {
    this.openPreparedSend(false);
  }

  confirmSendQuoteWithDocuments(): void {
    this.openPreparedSend(true);
  }

  getDocumentTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      manual: 'Manual',
      ficha_tecnica: 'Ficha técnica',
      certificado: 'Certificado',
      cotizacion_pdf: 'Cotizacion PDF',
      reporte_servicio: 'Reporte de servicio',
      imagen: 'Imagen',
      otro: 'Documento',
    };
    return labels[type] ?? 'Documento';
  }

  getDocumentTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      manual: 'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
      ficha_tecnica: 'M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z',
      certificado: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 0 0 1.946-.806 3.42 3.42 0 0 1 4.438 0 3.42 3.42 0 0 0 1.946.806 3.42 3.42 0 0 1 3.138 3.138 3.42 3.42 0 0 0 .806 1.946 3.42 3.42 0 0 1 0 4.438 3.42 3.42 0 0 0-.806 1.946 3.42 3.42 0 0 1-3.138 3.138 3.42 3.42 0 0 0-1.946.806 3.42 3.42 0 0 1-4.438 0 3.42 3.42 0 0 0-1.946-.806 3.42 3.42 0 0 1-3.138-3.138 3.42 3.42 0 0 0-.806-1.946 3.42 3.42 0 0 1 0-4.438 3.42 3.42 0 0 0 .806-1.946 3.42 3.42 0 0 1 3.138-3.138z',
    };
    return icons[type] ?? 'M7 21h10a2 2 0 0 0 2-2V9.414a1 1 0 0 0-.293-.707l-5.414-5.414A1 1 0 0 0 12.586 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z';
  }

  getQuotePdfAttachmentHint(): string {
    const currentQuote = this.quote();
    if (!currentQuote?.pdfPath) {
      return 'Sin enlace publico guardado';
    }

    return this.quotesService.getPublicQuotePdfUrl(currentQuote.pdfPath)
      ? 'Enlace publico disponible'
      : 'Sin enlace publico guardado';
  }

  private openPreparedSend(includeProductDocuments: boolean): void {
    const currentQuote = this.quote();
    const currentClient = this.client();
    if (!currentQuote) return;

    if (this.sendChannel() === 'email') {
      this.openPreparedEmail(currentQuote, currentClient, includeProductDocuments);
      return;
    }

    this.openPreparedWhatsapp(currentQuote, currentClient, includeProductDocuments);
  }

  private openPreparedEmail(quote: Quote, client: Client | null, includeProductDocuments: boolean): void {
    const email = client?.billingEmail || client?.email;
    if (!email) {
      this.actionMessage.set(`No hay correo disponible para ${quote.clientNameSnapshot}.`);
      return;
    }

    const docs = includeProductDocuments ? this.selectedProductDocuments() : [];
    const subject = `Cotizacion ${quote.quoteNumber} - Go Medical`;
    const body = this.buildEmailBody(quote, client, docs);
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    this.closeSendModal();
    this.actionMessage.set(this.buildPreparedSendMessage('correo', quote, docs));
  }

  private openPreparedWhatsapp(quote: Quote, client: Client | null, includeProductDocuments: boolean): void {
    const phone = this.normalizePhone(client?.phone);
    if (!phone) {
      this.actionMessage.set(`No hay telefono disponible para ${quote.clientNameSnapshot}.`);
      return;
    }

    const docs = includeProductDocuments ? this.selectedProductDocuments() : [];
    const message = this.buildWhatsappMessage(quote, client, docs);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    this.closeSendModal();
    this.actionMessage.set(this.buildPreparedSendMessage('WhatsApp', quote, docs));
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
    if (!currentQuote) return 'Direccion no disponible';
    return this.quotePdfService.getClientAddress(currentQuote, this.client());
  }

  getClientRfc(): string {
    const currentQuote = this.quote();
    if (!currentQuote) return 'RFC no disponible';
    return this.quotePdfService.getClientRfc(currentQuote, this.client());
  }

  getClientContact(): string {
    return this.quotePdfService.getClientContact(this.client());
  }

  getCommercialTerms(): string[] {
    const currentQuote = this.quote();
    if (!currentQuote) return [];
    return this.quotePdfService.getCommercialTerms(currentQuote);
  }

  getCommercialContact(): string {
    return this.quotePdfService.getCommercialContact();
  }

  private async updateStatus(status: QuoteStatus, message: string): Promise<void> {
    const currentQuote = this.quote();
    if (!currentQuote) return;

    try {
      const updatedQuote = await this.quotesService.updateQuoteStatus(currentQuote.id, status);
      if (!updatedQuote) return;
      this.quote.set(updatedQuote);
      this.actionMessage.set(message);
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible actualizar la cotización.');
    }
  }

  private buildEmailBody(quote: Quote, client: Client | null, selectedDocs: ProductDocument[]): string {
    const contactName = client?.contactName || quote.clientNameSnapshot;
    const lines = [
      `Hola ${contactName},`,
      '',
      `Te compartimos la cotizacion ${quote.quoteNumber} de Go Medical.`,
      `Total estimado: ${this.formatCurrency(quote.total)} MXN.`,
      `Vigencia: ${this.formatDate(quote.validUntil)}.`,
    ];

    this.appendAttachmentLines(lines, quote, selectedDocs);

    lines.push(
      '',
      'Quedamos atentos para cualquier ajuste o confirmacion comercial.',
      '',
      this.quotePdfService.getCommercialContact(),
    );

    return lines.join('\n');
  }

  private buildWhatsappMessage(quote: Quote, client: Client | null, selectedDocs: ProductDocument[]): string {
    const contactName = client?.contactName || quote.clientNameSnapshot;
    const lines = [
      `Hola ${contactName},`,
      `te compartimos la cotizacion ${quote.quoteNumber} de Go Medical.`,
      `Total estimado: ${this.formatCurrency(quote.total)} MXN.`,
      `Vigencia: ${this.formatDate(quote.validUntil)}.`,
      'Quedamos atentos para cualquier comentario o confirmacion.',
    ];

    this.appendAttachmentLines(lines, quote, selectedDocs, true);

    return lines.join(' ');
  }

  private appendAttachmentLines(lines: string[], quote: Quote, selectedDocs: ProductDocument[], compact = false): void {
    const links = this.buildShareLinks(quote, selectedDocs);
    const quotePdfMissingLink = this.includeQuotePdf() && !this.quotesService.getPublicQuotePdfUrl(quote.pdfPath);

    if (links.length > 0) {
      lines.push(compact ? 'Documentos:' : '', compact ? '' : 'Documentos de descarga:');
      links.forEach(link => {
        const product = link.productName ? ` - ${link.productName}` : '';
        lines.push(`${link.label}${product}: ${link.url}`);
      });
    }

    if (quotePdfMissingLink) {
      lines.push(compact
        ? 'PDF de cotizacion: descargar desde Go Medical para adjuntar manualmente.'
        : 'PDF de cotizacion: descarga el archivo desde Go Medical y adjuntalo manualmente; no hay enlace publico guardado.');
    }
  }

  private buildShareLinks(quote: Quote, selectedDocs: ProductDocument[]): ShareLink[] {
    const links: ShareLink[] = [];
    const quoteUrl = this.includeQuotePdf()
      ? this.quotesService.getPublicQuotePdfUrl(quote.pdfPath)
      : '';

    if (quoteUrl) {
      links.push({
        label: `Cotizacion PDF ${quote.quoteNumber}`,
        type: 'PDF',
        url: quoteUrl,
      });
    }

    selectedDocs.forEach(doc => {
      const url = this.quotesService.getPublicDocumentUrl(doc.filePath);
      if (!url) return;

      links.push({
        label: doc.title,
        productName: doc.productName,
        type: this.getDocumentTypeLabel(doc.documentType),
        url,
      });
    });

    return links;
  }

  private buildPreparedSendMessage(channel: string, quote: Quote, selectedDocs: ProductDocument[]): string {
    const links = this.buildShareLinks(quote, selectedDocs);
    const hasMissingQuotePdfLink = this.includeQuotePdf() && !this.quotesService.getPublicQuotePdfUrl(quote.pdfPath);
    const docsText = selectedDocs.length
      ? ` con ${selectedDocs.length} documento${selectedDocs.length !== 1 ? 's' : ''}`
      : '';
    const missingPdfText = hasMissingQuotePdfLink
      ? ' El PDF no tiene enlace publico guardado; descargalo y adjuntalo manualmente.'
      : '';
    const missingDocsText = this.hasMissingProductDocuments()
      ? ' Algunos productos no tienen ficha tecnica adjunta.'
      : '';

    return `Se abrio ${channel} con la cotizacion ${quote.quoteNumber}${docsText} y ${links.length} enlace${links.length !== 1 ? 's' : ''} preparado${links.length !== 1 ? 's' : ''}.${missingPdfText}${missingDocsText}`;
  }

  private normalizePhone(phone?: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('52') ? digits : `52${digits}`;
  }

  private formatDate(value: string): string {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(new Date(value));
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', minimumFractionDigits: 2,
    }).format(value);
  }
}
