import { Injectable } from '@angular/core';
import { Client } from '../../../core/models/client.model';
import { Quote } from '../models/quote.model';

@Injectable({
  providedIn: 'root'
})
export class QuotePdfService {
  async downloadQuotePdf(
    quote: Quote,
    client?: Client | null,
  ): Promise<void> {
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
    const dangerColor = rgb(192 / 255, 57 / 255, 43 / 255);
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
      page.drawText(String(text ?? ''), {
        x,
        y: pageHeight - top - fontSize,
        size: fontSize,
        font,
        color,
      });
    };

    const wrapText = (text: string, maxWidth: number, font = regularFont, fontSize = 10): string[] => {
      const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
      if (!words.length) return [''];

      const lines: string[] = [];
      let currentLine = '';

      const pushWord = (word: string): void => {
        if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
          if (currentLine) { lines.push(currentLine); currentLine = ''; }
          let fragment = '';
          word.split('').forEach(char => {
            const nextFragment = `${fragment}${char}`;
            if (font.widthOfTextAtSize(nextFragment, fontSize) <= maxWidth) {
              fragment = nextFragment;
            } else {
              if (fragment) lines.push(fragment);
              fragment = char;
            }
          });
          if (fragment) currentLine = fragment;
          return;
        }
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
          currentLine = candidate;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      };

      words.forEach(pushWord);
      if (currentLine) lines.push(currentLine);
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
      if ((cursorY + requiredHeight) <= (pageHeight - bottomMargin)) return;
      page = pdfDoc.addPage(pageSize);
      cursorY = topMargin;
    };

    // ─── HEADER BLOCK ───────────────────────────────────────────────
    const headerBlockHeight = 126;
    const logoX = marginX + 20;
    const logoTop = cursorY + 24;
    const logoSize = 68;
    const headerCardWidth = 188;
    const headerCardX = pageWidth - marginX - headerCardWidth;
    const titleX = logoX + logoSize + 22;
    const titleWidth = Math.max(128, headerCardX - titleX - 24);
    const titleFontSize = titleWidth < 180 ? 18 : 21;
    const titleLines = wrapText('Cotizacion Comercial', titleWidth, boldFont, titleFontSize).slice(0, 2);

    page.drawRectangle({ x: marginX, y: pageHeight - cursorY - headerBlockHeight, width: contentWidth, height: headerBlockHeight, color: surface });
    page.drawRectangle({ x: logoX, y: pageHeight - logoTop - logoSize, width: logoSize, height: logoSize, color: accent });
    drawText('GM', logoX + 17, logoTop + 27, 24, rgb(1, 1, 1), boldFont);
    drawText('GO MEDICAL', titleX, cursorY + 24, 10, muted, boldFont);
    titleLines.forEach((lineText, index) => {
      drawText(lineText, titleX, cursorY + 44 + (index * (titleFontSize + 3)), titleFontSize, ink, boldFont);
    });
    drawWrappedText('Soluciones y productos medicos', titleX, cursorY + 94, titleWidth, 10.5, muted);

    page.drawRectangle({ x: headerCardX, y: pageHeight - cursorY - 102, width: headerCardWidth, height: 80, borderColor: line, borderWidth: 1, color: rgb(1, 1, 1) });
    drawText('FOLIO', headerCardX + 18, cursorY + 28, 9.5, muted, boldFont);
    drawText(quote.quoteNumber, headerCardX + 95, cursorY + 28, 9.5, ink);
    drawText('EMISION', headerCardX + 18, cursorY + 49, 9.5, muted, boldFont);
    drawText(this.formatDate(quote.createdAt, true), headerCardX + 82, cursorY + 49, 9.5, ink);
    drawText('VIGENCIA', headerCardX + 18, cursorY + 70, 9.5, muted, boldFont);
    drawText(this.formatDate(quote.validUntil), headerCardX + 90, cursorY + 70, 9.5, ink);

    cursorY += headerBlockHeight + 22;

    // ─── CLIENT BLOCK ───────────────────────────────────────────────
    const fieldHeight = (value: string, width: number): number =>
      18 + (wrapText(value, width, regularFont, 10.4).length * 14);
    const clientName = quote.clientNameSnapshot || 'Cliente no disponible';
    const clientRfc = this.getClientRfc(quote, client);
    const clientAddress = this.getClientAddress(quote, client);
    const clientContact = this.getClientContact(client);
    const leftColumnHeight = fieldHeight(clientName, 220) + 14 + fieldHeight(clientAddress, 220);
    const rightColumnHeight = fieldHeight(clientRfc, 200) + 14 + fieldHeight(clientContact, 200);
    const clientCardHeight = Math.max(132, 50 + Math.max(leftColumnHeight, rightColumnHeight));

    ensureSpace(clientCardHeight + 24);
    page.drawRectangle({ x: marginX, y: pageHeight - cursorY - clientCardHeight, width: contentWidth, height: clientCardHeight, color: accentSoft });
    drawText('DATOS DEL CLIENTE', marginX + 20, cursorY + 16, 10, muted, boldFont);

    const drawField = (label: string, value: string, x: number, top: number, width: number): number => {
      drawText(label, x, top, 9.5, muted, boldFont);
      return 17 + drawWrappedText(value, x, top + 14, width, 10.4, ink);
    };

    let leftTop = cursorY + 40;
    leftTop += drawField('RAZON SOCIAL / NOMBRE', clientName, marginX + 20, leftTop, 220) + 12;
    drawField('DIRECCION', clientAddress, marginX + 20, leftTop, 220);

    let rightTop = cursorY + 40;
    rightTop += drawField('RFC', clientRfc, marginX + 276, rightTop, 200) + 12;
    drawField('CONTACTO', clientContact, marginX + 276, rightTop, 200);

    cursorY += clientCardHeight + 24;

    // ─── ITEMS TABLE ────────────────────────────────────────────────
    const columnWidths = [68, 152, 40, 72, 62, 62, 55];
    const columnX = columnWidths.reduce<number[]>((acc, width, index) => {
      acc.push(index === 0 ? marginX : acc[index - 1] + columnWidths[index - 1]);
      return acc;
    }, []);
    const headerHeight = 30;

    const drawItemsHeader = (): void => {
      ensureSpace(headerHeight + 40);
      page.drawRectangle({
        x: marginX, y: pageHeight - cursorY - headerHeight,
        width: contentWidth, height: headerHeight,
        color: surface, borderColor: line, borderWidth: 1,
      });
      ['SKU', 'Producto / Servicio', 'Cant.', 'Precio unit.', 'Desc.', 'Bruto', 'Importe'].forEach((label, index) => {
        const alignRight = index >= 3;
        const centered = index === 2;
        const labelWidth = boldFont.widthOfTextAtSize(label, 8.5);
        const x = centered
          ? columnX[index] + ((columnWidths[index] - labelWidth) / 2)
          : alignRight
            ? columnX[index] + columnWidths[index] - labelWidth - 8
            : columnX[index] + 8;
        drawText(label, x, cursorY + 11, 8.5, muted, boldFont);
      });
      cursorY += headerHeight;
    };

    drawItemsHeader();

    if (!quote.items.length) {
      const emptyRowHeight = 34;
      ensureSpace(emptyRowHeight);
      page.drawRectangle({ x: marginX, y: pageHeight - cursorY - emptyRowHeight, width: contentWidth, height: emptyRowHeight, borderColor: line, borderWidth: 1, color: rgb(1, 1, 1) });
      drawText('Sin conceptos registrados', marginX + 10, cursorY + 12, 9.5, muted);
      cursorY += emptyRowHeight;
    }

    quote.items.forEach(item => {
      const cells = [
        wrapText(item.sku || '-', columnWidths[0] - 14, regularFont, 9),
        wrapText(item.productName || '—', columnWidths[1] - 14, regularFont, 9),
        [String(item.quantity)],
        [this.formatCurrency(item.unitPrice)],
        [item.discount > 0 ? this.formatCurrency(item.discount) : '—'],
        [this.formatCurrency(item.grossLinePrice)],
        [this.formatCurrency(item.totalLinePrice)],
      ];
      const rowHeight = Math.max(28, ...cells.map(lines => (lines.length * 12) + 14));

      ensureSpace(rowHeight + headerHeight);
      if (cursorY === topMargin) drawItemsHeader();

      page.drawRectangle({ x: marginX, y: pageHeight - cursorY - rowHeight, width: contentWidth, height: rowHeight, borderColor: line, borderWidth: 1, color: rgb(1, 1, 1) });

      cells.forEach((lines, index) => {
        const alignRight = index >= 3;
        const centered = index === 2;
        const isDiscount = index === 4 && item.discount > 0;
        const textColor = isDiscount ? dangerColor : ink;
        lines.forEach((lineText, lineIndex) => {
          const textWidth = regularFont.widthOfTextAtSize(lineText, 9);
          const x = centered
            ? columnX[index] + ((columnWidths[index] - textWidth) / 2)
            : alignRight
              ? columnX[index] + columnWidths[index] - textWidth - 8
              : columnX[index] + 8;
          drawText(lineText, x, cursorY + 10 + (lineIndex * 12), 9, textColor);
        });
      });

      cursorY += rowHeight;
    });

    cursorY += 20;

    // ─── TOTALS + TERMS ─────────────────────────────────────────────
    const hasDiscounts = quote.itemsDiscount > 0 || quote.discount > 0;
    const totalsRowCount = hasDiscounts ? (quote.itemsDiscount > 0 && quote.discount > 0 ? 6 : 5) : 4;
    const totalsHeight = 24 + (totalsRowCount * 22) + 28;
    const termsHeight = Math.max(120, (terms.length * 22) + 38);

    ensureSpace(Math.max(termsHeight, totalsHeight) + 20);

    // Terms
    page.drawRectangle({ x: marginX, y: pageHeight - cursorY - termsHeight, width: contentWidth - 220, height: termsHeight, color: accentSoft });
    drawText('CONDICIONES COMERCIALES', marginX + 18, cursorY + 16, 9.5, muted, boldFont);
    let termsTop = cursorY + 34;
    terms.forEach(term => {
      termsTop += drawWrappedText(`• ${term}`, marginX + 18, termsTop, contentWidth - 258, 9.5, ink) + 5;
    });

    // Totals box
    const totalsX = pageWidth - marginX - 198;
    page.drawRectangle({ x: totalsX, y: pageHeight - cursorY - totalsHeight, width: 198, height: totalsHeight, borderColor: line, borderWidth: 1, color: rgb(1, 1, 1) });

    let tRow = cursorY + 20;
    const rowSpacing = 22;

    const drawTotalRow = (label: string, value: string, isBold = false, color = ink, labelColor = muted): void => {
      drawText(label, totalsX + 14, tRow, 10, labelColor, isBold ? boldFont : regularFont);
      const valWidth = (isBold ? boldFont : regularFont).widthOfTextAtSize(value, isBold ? 11 : 10);
      drawText(value, totalsX + 198 - 14 - valWidth, tRow, isBold ? 11 : 10, color, isBold ? boldFont : regularFont);
      tRow += rowSpacing;
    };

    if (hasDiscounts) {
      drawTotalRow('Subtotal bruto', this.formatCurrency(quote.grossSubtotal));
      if (quote.itemsDiscount > 0) {
        drawTotalRow('Desc. por conceptos', `- ${this.formatCurrency(quote.itemsDiscount)}`, false, dangerColor, muted);
      }
      if (quote.discount > 0) {
        drawTotalRow('Desc. general', `- ${this.formatCurrency(quote.discount)}`, false, dangerColor, muted);
      }
      // separator line
      page.drawLine({ start: { x: totalsX + 14, y: pageHeight - tRow - 4 }, end: { x: totalsX + 184, y: pageHeight - tRow - 4 }, thickness: 0.5, color: line });
      tRow += 8;
    }

    drawTotalRow('Subtotal', this.formatCurrency(quote.subtotal));
    const ivaLabel = quote.taxExempt ? 'IVA (Exento)' : `IVA (${Math.round(quote.tax_pct * 100)}%)`;
    drawTotalRow(ivaLabel, this.formatCurrency(quote.tax));

    // Total separator
    page.drawLine({ start: { x: totalsX + 14, y: pageHeight - tRow - 4 }, end: { x: totalsX + 184, y: pageHeight - tRow - 4 }, thickness: 1, color: line });
    tRow += 10;
    drawTotalRow('Total', this.formatCurrency(quote.total), true, accent, accent);

    cursorY += Math.max(termsHeight, totalsHeight) + 18;

    // ─── NOTES ───────────────────────────────────────────────────────
    const noteText = quote.notes?.trim() ? `Nota: ${quote.notes.trim()}` : '';
    if (noteText) {
      const noteLines = wrapText(noteText, contentWidth - 36, regularFont, 10);
      const noteHeight = Math.max(54, (noteLines.length * 13) + 26);
      ensureSpace(noteHeight + 12);

      page.drawRectangle({ x: marginX, y: pageHeight - cursorY - noteHeight, width: contentWidth, height: noteHeight, color: surface });
      drawText('NOTA COMERCIAL', marginX + 18, cursorY + 14, 9.5, muted, boldFont);
      drawWrappedText(noteText, marginX + 18, cursorY + 30, contentWidth - 36, 10, ink);
      cursorY += noteHeight + 14;
    }

    // ─── CONDITIONS ──────────────────────────────────────────────────
    const conditionsText = quote.conditions?.trim();
    if (conditionsText) {
      const condLines = wrapText(conditionsText, contentWidth - 36, regularFont, 10);
      const condHeight = Math.max(54, (condLines.length * 13) + 26);
      ensureSpace(condHeight + 12);

      page.drawRectangle({ x: marginX, y: pageHeight - cursorY - condHeight, width: contentWidth, height: condHeight, color: accentSoft });
      drawText('CONDICIONES ADICIONALES', marginX + 18, cursorY + 14, 9.5, muted, boldFont);
      drawWrappedText(conditionsText, marginX + 18, cursorY + 30, contentWidth - 36, 10, ink);
      cursorY += condHeight + 14;
    }

    // ─── PAGE FOOTER ─────────────────────────────────────────────────
    pdfDoc.getPages().forEach((pdfPage, index) => {
      pdfPage.drawLine({ start: { x: marginX, y: bottomMargin }, end: { x: pageWidth - marginX, y: bottomMargin }, thickness: 1, color: line });
      pdfPage.drawText('Documento comercial emitido por Go Medical. Cotizacion sujeta a validacion administrativa y disponibilidad.', {
        x: marginX, y: bottomMargin - 16, size: 8, font: regularFont, color: muted,
      });
      pdfPage.drawText(`Pagina ${index + 1} de ${pdfDoc.getPageCount()}`, {
        x: pageWidth - marginX - 72, y: bottomMargin - 16, size: 8, font: regularFont, color: muted,
      });
    });

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
      return `${client.shippingAddress || client.address || ''}, ${client.city || ''}, ${client.state || ''}`.replace(/^,\s*|,\s*$/g, '');
    }
    return quote.clientAddressSnapshot || 'Direccion no disponible';
  }

  getClientRfc(quote: Quote, client?: Client | null): string {
    return client?.rfc ?? quote.clientRfcSnapshot ?? 'RFC no disponible';
  }

  getClientContact(client?: Client | null): string {
    if (!client) return 'Contacto no disponible';
    const parts = [
      client.contactName,
      client.contactPosition,
      client.email,
      client.phone,
    ].filter(Boolean);
    return parts.join(' · ') || 'Contacto no disponible';
  }

  getCommercialTerms(quote: Quote): string[] {
    const terms = [
      `Vigencia de la cotizacion hasta el ${this.formatDate(quote.validUntil)}.`,
      'Disponibilidad sujeta a inventario y confirmacion comercial al momento de cierre.',
      'Precios sujetos a cambios posteriores al vencimiento de la vigencia indicada.',
      'Instalacion y capacitacion se coordinan de acuerdo con el alcance comercial confirmado.',
    ];
    if (quote.notes?.trim()) {
      terms.push(`Nota: ${quote.notes.trim()}`);
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
    }).format(value || 0);
  }
}
