import { Injectable } from '@angular/core';
import { Client } from '../../../core/models/client.model';
import { Quote } from '../models/quote.model';

@Injectable({
  providedIn: 'root'
})
export class QuotePdfService {
  async downloadQuotePdf(quote: Quote, client?: Client | null): Promise<void> {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pageSize: [number, number] = [595.28, 841.89];
    const accent = rgb(15 / 255, 76 / 255, 129 / 255);
    const accentSoft = rgb(248 / 255, 251 / 255, 253 / 255);
    const ink = rgb(18 / 255, 39 / 255, 62 / 255);
    const muted = rgb(92 / 255, 108 / 255, 125 / 255);
    const line = rgb(223 / 255, 230 / 255, 237 / 255);
    const surface = rgb(244 / 255, 247 / 255, 250 / 255);
    const terms = this.getCommercialTerms(quote);
    let page = pdfDoc.addPage(pageSize);
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const marginX = 42;
    const topMargin = 42;
    const bottomMargin = 52;
    const contentWidth = pageWidth - (marginX * 2);
    let cursorY = topMargin;

    const drawText = (
      text: string,
      x: number,
      top: number,
      fontSize: number,
      color: ReturnType<typeof rgb>,
      font = regularFont,
    ): void => {
      page.drawText(text, {
        x,
        y: pageHeight - top - fontSize,
        size: fontSize,
        font,
        color,
      });
    };

    const wrapText = (text: string, maxWidth: number, font = regularFont, fontSize = 10): string[] => {
      const words = text.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        return [''];
      }

      const lines: string[] = [];
      let currentLine = words[0];

      for (const word of words.slice(1)) {
        const candidate = `${currentLine} ${word}`;
        if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
          currentLine = candidate;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }

      lines.push(currentLine);
      return lines;
    };

    const drawWrappedText = (
      text: string,
      x: number,
      top: number,
      maxWidth: number,
      fontSize: number,
      color: ReturnType<typeof rgb>,
      font = regularFont,
      lineHeight = fontSize * 1.35,
    ): number => {
      const lines = wrapText(text, maxWidth, font, fontSize);
      lines.forEach((lineText, index) => {
        drawText(lineText, x, top + (index * lineHeight), fontSize, color, font);
      });

      return lines.length * lineHeight;
    };

    const ensureSpace = (requiredHeight: number): void => {
      if ((cursorY + requiredHeight) <= (pageHeight - bottomMargin)) {
        return;
      }

      page = pdfDoc.addPage(pageSize);
      cursorY = topMargin;
    };

    page.drawRectangle({
      x: marginX,
      y: pageHeight - cursorY - 116,
      width: contentWidth,
      height: 116,
      color: surface,
    });
    page.drawRectangle({
      x: marginX + 20,
      y: pageHeight - cursorY - 88,
      width: 68,
      height: 68,
      color: accent,
    });
    drawText('GM', marginX + 37, cursorY + 35, 24, rgb(1, 1, 1), boldFont);
    drawText('GO MEDICAL', marginX + 110, cursorY + 22, 10, muted, boldFont);
    drawText('Cotizacion comercial', marginX + 110, cursorY + 42, 22, ink, boldFont);
    drawText('Soluciones y productos medicos', marginX + 110, cursorY + 68, 11, muted);

    const headerCardX = pageWidth - marginX - 208;
    page.drawRectangle({
      x: headerCardX,
      y: pageHeight - cursorY - 98,
      width: 188,
      height: 80,
      borderColor: line,
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });
    drawText('FOLIO', headerCardX + 18, cursorY + 28, 9.5, muted, boldFont);
    drawText(quote.quoteNumber, headerCardX + 95, cursorY + 28, 9.5, ink);
    drawText('EMISION', headerCardX + 18, cursorY + 49, 9.5, muted, boldFont);
    drawText(this.formatDate(quote.createdAt, true), headerCardX + 82, cursorY + 49, 9.5, ink);
    drawText('VIGENCIA', headerCardX + 18, cursorY + 70, 9.5, muted, boldFont);
    drawText(this.formatDate(quote.validUntil), headerCardX + 90, cursorY + 70, 9.5, ink);

    cursorY += 138;

    page.drawRectangle({
      x: marginX,
      y: pageHeight - cursorY - 126,
      width: contentWidth,
      height: 126,
      color: accentSoft,
    });
    drawText('DATOS DEL CLIENTE', marginX + 20, cursorY + 16, 10, muted, boldFont);
    drawText('RAZON SOCIAL / NOMBRE', marginX + 20, cursorY + 36, 9.5, muted, boldFont);
    drawWrappedText(quote.clientNameSnapshot, marginX + 20, cursorY + 50, 220, 10.4, ink);
    drawText('RFC', marginX + 276, cursorY + 36, 9.5, muted, boldFont);
    drawWrappedText(this.getClientRfc(quote, client), marginX + 276, cursorY + 50, 200, 10.4, ink);
    drawText('DIRECCION', marginX + 20, cursorY + 84, 9.5, muted, boldFont);
    drawWrappedText(this.getClientAddress(quote, client), marginX + 20, cursorY + 98, 220, 10.4, ink);
    drawText('CONTACTO', marginX + 276, cursorY + 84, 9.5, muted, boldFont);
    drawWrappedText(this.getClientContact(client), marginX + 276, cursorY + 98, 200, 10.4, ink);

    cursorY += 150;

    const columnWidths = [72, 169, 46, 78, 64, 82];
    const columnX = columnWidths.reduce<number[]>((acc, width, index) => {
      acc.push(index === 0 ? marginX : acc[index - 1] + columnWidths[index - 1]);
      return acc;
    }, []);
    const headerHeight = 30;

    ensureSpace(headerHeight + 40);
    page.drawRectangle({
      x: marginX,
      y: pageHeight - cursorY - headerHeight,
      width: contentWidth,
      height: headerHeight,
      color: surface,
      borderColor: line,
      borderWidth: 1,
    });

    ['SKU', 'Producto', 'Cant.', 'Precio unitario', 'Desc.', 'Importe'].forEach((label, index) => {
      const alignRight = index >= 3;
      const centered = index === 2;
      const labelWidth = boldFont.widthOfTextAtSize(label, 9);
      const x = centered
        ? columnX[index] + ((columnWidths[index] - labelWidth) / 2)
        : alignRight
          ? columnX[index] + columnWidths[index] - labelWidth - 10
          : columnX[index] + 10;
      drawText(label, x, cursorY + 10, 9, muted, boldFont);
    });

    cursorY += headerHeight;

    quote.items.forEach(item => {
      const cells = [
        wrapText(item.sku || '—', columnWidths[0] - 16, regularFont, 9.5),
        wrapText(item.productName, columnWidths[1] - 16, regularFont, 9.5),
        [String(item.quantity)],
        [this.formatCurrency(item.unitPrice)],
        [item.discount ? this.formatCurrency(item.discount) : '—'],
        [this.formatCurrency(item.totalLinePrice)],
      ];
      const rowHeight = Math.max(28, ...cells.map(lines => (lines.length * 12) + 16));

      ensureSpace(rowHeight);
      page.drawRectangle({
        x: marginX,
        y: pageHeight - cursorY - rowHeight,
        width: contentWidth,
        height: rowHeight,
        borderColor: line,
        borderWidth: 1,
        color: rgb(1, 1, 1),
      });

      cells.forEach((lines, index) => {
        const alignRight = index >= 3;
        const centered = index === 2;
        lines.forEach((lineText, lineIndex) => {
          const textWidth = regularFont.widthOfTextAtSize(lineText, 9.5);
          const x = centered
            ? columnX[index] + ((columnWidths[index] - textWidth) / 2)
            : alignRight
              ? columnX[index] + columnWidths[index] - textWidth - 10
              : columnX[index] + 10;
          drawText(lineText, x, cursorY + 10 + (lineIndex * 12), 9.5, ink);
        });
      });

      cursorY += rowHeight;
    });

    cursorY += 20;

    const termsHeight = Math.max(144, (terms.length * 26) + 38);
    const totalsHeight = 122;

    ensureSpace(Math.max(termsHeight, totalsHeight) + 20);
    page.drawRectangle({
      x: marginX,
      y: pageHeight - cursorY - termsHeight,
      width: contentWidth - 220,
      height: termsHeight,
      color: accentSoft,
    });
    drawText('CONDICIONES COMERCIALES', marginX + 18, cursorY + 16, 10, muted, boldFont);
    let termsTop = cursorY + 36;
    terms.forEach(term => {
      termsTop += drawWrappedText(`• ${term}`, marginX + 18, termsTop, contentWidth - 256, 10, ink) + 6;
    });

    const totalsX = pageWidth - marginX - 198;
    page.drawRectangle({
      x: totalsX,
      y: pageHeight - cursorY - totalsHeight,
      width: 198,
      height: totalsHeight,
      borderColor: line,
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });
    drawText('Subtotal', totalsX + 18, cursorY + 20, 10.8, muted);
    drawText(this.formatCurrency(quote.subtotal), totalsX + 104, cursorY + 20, 10.8, ink);
    drawText(`IVA (${Math.round(quote.tax_pct * 100)}%)`, totalsX + 18, cursorY + 44, 10.8, muted);
    drawText(this.formatCurrency(quote.tax), totalsX + 112, cursorY + 44, 10.8, ink);
    page.drawLine({
      start: { x: totalsX + 18, y: pageHeight - cursorY - 72 },
      end: { x: totalsX + 180, y: pageHeight - cursorY - 72 },
      thickness: 1,
      color: line,
    });
    drawText('Total', totalsX + 18, cursorY + 88, 14, accent, boldFont);
    drawText(this.formatCurrency(quote.total), totalsX + 98, cursorY + 88, 14, accent, boldFont);

    cursorY += Math.max(termsHeight, totalsHeight) + 18;

    const noteText = quote.notes?.trim() ? `Nota comercial: ${quote.notes.trim()}` : '';
    if (noteText) {
      const noteLines = wrapText(noteText, contentWidth - 36, regularFont, 10.2);
      const noteHeight = Math.max(64, (noteLines.length * 13) + 28);
      ensureSpace(noteHeight + 16);

      page.drawRectangle({
        x: marginX,
        y: pageHeight - cursorY - noteHeight,
        width: contentWidth,
        height: noteHeight,
        color: surface,
      });
      drawText('NOTA COMERCIAL', marginX + 18, cursorY + 16, 10, muted, boldFont);
      drawWrappedText(noteText, marginX + 18, cursorY + 34, contentWidth - 36, 10.2, ink);
      cursorY += noteHeight + 16;
    }

    page.drawLine({
      start: { x: marginX, y: bottomMargin },
      end: { x: pageWidth - marginX, y: bottomMargin },
      thickness: 1,
      color: line,
    });
    drawText(
      'Documento comercial emitido por Go Medical. Cotizacion sujeta a validacion administrativa y disponibilidad.',
      marginX,
      pageHeight - bottomMargin + 12,
      9.5,
      muted,
    );
    drawText(this.getCommercialContact(), pageWidth - marginX - 180, pageHeight - bottomMargin + 12, 9.5, muted);

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const fileUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = `${quote.quoteNumber}.pdf`;
    link.click();
    URL.revokeObjectURL(fileUrl);
  }

  getClientAddress(quote: Quote, client?: Client | null): string {
    if (client) {
      return `${client.shippingAddress || client.address}, ${client.city}, ${client.state}`;
    }

    return quote.clientAddressSnapshot || 'Direccion no disponible';
  }

  getClientRfc(quote: Quote, client?: Client | null): string {
    return client?.rfc ?? quote.clientRfcSnapshot ?? 'RFC no disponible';
  }

  getClientContact(client?: Client | null): string {
    if (!client) {
      return 'Contacto no disponible';
    }

    const parts = [
      client.contactName,
      client.contactPosition,
      client.email,
      client.phone,
    ].filter(Boolean);

    return parts.join(' · ');
  }

  getCommercialTerms(quote: Quote): string[] {
    const terms = [
      `Vigencia de la cotizacion hasta el ${this.formatDate(quote.validUntil)}.`,
      'Disponibilidad sujeta a inventario y confirmacion comercial al momento de cierre.',
      'Precios sujetos a cambios posteriores al vencimiento de la vigencia indicada.',
      'Instalacion y capacitacion se coordinan de acuerdo con el alcance comercial confirmado.',
    ];

    if (quote.notes?.trim()) {
      terms.push(`Nota comercial relevante: ${quote.notes.trim()}`);
    }

    return terms;
  }

  getCommercialContact(): string {
    return 'Comercial Go Medical · comercial@gomedical.mx · +52 999 000 0000';
  }

  private formatDate(value: string, withTime = false): string {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
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
