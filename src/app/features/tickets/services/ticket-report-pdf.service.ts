import { Injectable } from '@angular/core';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ServiceTicket, TicketPriority, TicketStatus } from '../models/ticket.model';

@Injectable({ providedIn: 'root' })
export class TicketReportPdfService {
  private readonly pageWidth = 612;
  private readonly pageHeight = 792;
  private readonly marginX = 48;
  private readonly topY = 742;
  private readonly bottomY = 58;
  private readonly contentWidth = this.pageWidth - (this.marginX * 2);

  async downloadReport(period: 'day' | 'week' | 'month', tickets: ServiceTicket[]): Promise<void> {
    const now = new Date();
    let periodLabel = '';
    let reportTitle = '';
    let filteredTickets = tickets;

    if (period === 'month') {
      const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
      ];
      periodLabel = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
      reportTitle = 'Reporte Mensual de Soporte y Servicio Tecnico';
      filteredTickets = tickets.filter(ticket => {
        const d = this.getTicketDate(ticket);
        if (!d) return false;
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    } else if (period === 'week') {
      periodLabel = `Semana del ${this.formatDate(now)}`;
      reportTitle = 'Reporte Semanal de Soporte y Servicio Tecnico';
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filteredTickets = tickets.filter(ticket => {
        const d = this.getTicketDate(ticket);
        if (!d) return false;
        return d >= oneWeekAgo && d <= now;
      });
    } else {
      periodLabel = `${this.formatDate(now)}`;
      reportTitle = 'Reporte Diario de Soporte y Servicio Tecnico';
      filteredTickets = tickets.filter(ticket => {
        const d = this.getTicketDate(ticket);
        if (!d) return false;
        return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    }

    // Calculate stats
    const totalCount = filteredTickets.length;
    const completedCount = filteredTickets.filter(t =>
      t.status === TicketStatus.Resolved || t.status === TicketStatus.Closed
    ).length;
    const pendingCount = filteredTickets.filter(t =>
      t.status !== TicketStatus.Resolved &&
      t.status !== TicketStatus.Closed &&
      t.status !== TicketStatus.Canceled
    ).length;
    const urgentCount = filteredTickets.filter(t => t.priority === TicketPriority.Urgent).length;

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Color system matches styles.css --color-primary/secondary
    const teal = rgb(0.17, 0.41, 0.46);
    const tealLight = rgb(0.41, 0.70, 0.63);
    const mint = rgb(0.94, 0.98, 0.97);
    const dark = rgb(0.11, 0.18, 0.19);
    const muted = rgb(0.38, 0.50, 0.51);
    const border = rgb(0.82, 0.89, 0.88);

    let page = pdf.addPage([this.pageWidth, this.pageHeight]);
    let y = this.topY;

    const addPage = (): void => {
      page = pdf.addPage([this.pageWidth, this.pageHeight]);
      y = this.topY;
    };

    const ensureSpace = (height: number): void => {
      if (y - height < this.bottomY) {
        addPage();
      }
    };

    const sectionTitle = (title: string, contentReserve = 0): void => {
      ensureSpace(40 + contentReserve);
      page.drawText(this.clean(title), { x: this.marginX, y, size: 13, font: bold, color: teal });
      y -= 12;
      page.drawLine({
        start: { x: this.marginX, y },
        end: { x: this.pageWidth - this.marginX, y },
        thickness: 1,
        color: border
      });
      y -= 18;
    };

    const drawHeader = (): void => {
      page.drawRectangle({ x: 0, y: 704, width: this.pageWidth, height: 88, color: teal });
      page.drawText('Go Medical', { x: this.marginX, y: 748, size: 22, font: bold, color: rgb(1, 1, 1) });
      page.drawText(reportTitle, { x: this.marginX, y: 726, size: 12, font, color: rgb(0.85, 0.95, 0.93) });
      page.drawText(`Periodo: ${this.clean(periodLabel)}`, { x: 396, y: 748, size: 11, font: bold, color: rgb(1, 1, 1) });
      page.drawText(`Fecha: ${this.formatDate(now)}`, { x: 396, y: 729, size: 9, font, color: rgb(0.85, 0.95, 0.93) });
      y = 680;
      page.drawText(`Generado: ${this.formatDateTime(now)}`, { x: this.marginX, y, size: 9, font, color: muted });
      y -= 14;
      page.drawText('Listado de servicios programados y ejecutados en el periodo actual.', { x: this.marginX, y, size: 9, font, color: muted });
      y -= 28;
    };

    drawHeader();

    // KPI Cards Block
    sectionTitle('KPIs de Soporte', 60);
    ensureSpace(60);
    this.drawKpiGrid(page, [
      ['Servicios Totales', totalCount],
      ['Completados', completedCount],
      ['Pendientes', pendingCount],
      ['Urgentes', urgentCount],
    ], y, font, bold, mint, border, dark, muted);
    y -= 64;

    // Services Table
    sectionTitle('Detalle de Servicios Tecnicos', 64);
    const tableHeaders = ['Folio', 'Cliente / Ingeniero', 'Fecha', 'Equipo', 'Estado'];
    const colWidths = [125, 120, 70, 110, 91]; // sum = 516

    const rows = filteredTickets.map(ticket => {
      // Create a short date string
      const d = this.getTicketDate(ticket);
      const dateStr = d ? `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}` : '--';
      
      return [
        ticket.ticketNumber,
        `${ticket.clientNameSnapshot || 'Sin cliente'}\nIng: ${ticket.assignedTechnicianName || 'Sin asignar'}`,
        dateStr,
        ticket.productNameSnapshot || 'Sin asociar',
        this.getStatusLabel(ticket.status)
      ];
    });

    y = this.drawTable(
      () => page,
      value => { y = value; },
      () => y,
      ensureSpace,
      tableHeaders,
      rows,
      colWidths,
      font,
      bold,
      teal,
      dark,
      muted,
      border,
      mint
    );

    // Page decorations
    pdf.getPages().forEach((pdfPage, index) => {
      pdfPage.drawLine({
        start: { x: this.marginX, y: 38 },
        end: { x: this.pageWidth - this.marginX, y: 38 },
        thickness: 0.7,
        color: border
      });
      pdfPage.drawText(`Reporte de servicios tecnicos - Confidencial Go Medical`, { x: this.marginX, y: 22, size: 8, font, color: muted });
      pdfPage.drawText(`Pagina ${index + 1} de ${pdf.getPageCount()}`, { x: 512, y: 22, size: 8, font, color: muted });
    });

    const bytes = await pdf.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `go-medical-servicios-${period}-${now.getTime()}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private getTicketDate(ticket: ServiceTicket): Date | null {
    const dateStr = ticket.scheduledStartAt || ticket.scheduledAt || ticket.requestedServiceDate || ticket.requestedAt;
    return dateStr ? new Date(dateStr) : null;
  }

  private drawKpiGrid(page: any, rows: Array<[string, string | number]>, y: number, font: any, bold: any, fill: any, border: any, dark: any, muted: any): void {
    rows.forEach(([label, value], index) => {
      const col = index % 4;
      const x = this.marginX + col * 128;
      page.drawRectangle({
        x,
        y: y - 46,
        width: 116,
        height: 46,
        color: fill,
        borderColor: border,
        borderWidth: 0.7
      });
      page.drawText(this.clean(label), { x: x + 8, y: y - 12, size: 8, font, color: muted });
      page.drawText(this.clean(String(value)), { x: x + 8, y: y - 32, size: 14, font: bold, color: dark });
    });
  }

  private drawTable(
    getPage: () => any,
    setY: (value: number) => void,
    getY: () => number,
    ensureSpace: (height: number) => void,
    headers: string[],
    rows: string[][],
    widths: number[],
    font: any,
    bold: any,
    teal: any,
    dark: any,
    muted: any,
    border: any,
    headerFill: any
  ): number {
    const drawHeader = (): void => {
      ensureSpace(34);
      let y = getY();
      const page = getPage();
      page.drawRectangle({
        x: this.marginX,
        y: y - 18,
        width: this.contentWidth,
        height: 24,
        color: headerFill,
        borderColor: border,
        borderWidth: 0.7
      });
      let x = this.marginX;
      headers.forEach((header, index) => {
        page.drawText(this.clean(header), { x: x + 8, y: y - 8, size: 8, font: bold, color: teal });
        x += widths[index] ?? 100;
      });
      setY(y - 30);
    };

    drawHeader();

    if (!rows.length) {
      ensureSpace(28);
      const y = getY();
      getPage().drawText('Sin registros en este periodo', { x: this.marginX + 8, y, size: 9, font, color: muted });
      setY(y - 24);
      return getY();
    }

    rows.forEach(row => {
      const cells = row.map((cell, index) => this.wrapText(this.clean(cell), (widths[index] ?? 100) - 16, font, 8));
      const rowHeight = Math.max(24, Math.max(...cells.map(lines => lines.length)) * 10 + 14);
      ensureSpace(rowHeight + 8);
      if (getY() === this.topY) {
        drawHeader();
      }

      const y = getY();
      const page = getPage();
      page.drawRectangle({
        x: this.marginX,
        y: y - rowHeight + 6,
        width: this.contentWidth,
        height: rowHeight,
        borderColor: border,
        borderWidth: 0.5,
        color: rgb(1, 1, 1)
      });
      let x = this.marginX;
      cells.forEach((lines, index) => {
        lines.forEach((line, lineIndex) => {
          page.drawText(line, { x: x + 8, y: y - 8 - (lineIndex * 10), size: 8, font, color: dark });
        });
        x += widths[index] ?? 100;
      });
      setY(y - rowHeight);
    });

    return getY() - 6;
  }

  private wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
    const words = String(text || 'Sin registros').split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';

    words.forEach(word => {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
        current = next;
        return;
      }

      if (current) {
        lines.push(current);
      }
      current = word;
    });

    if (current) {
      lines.push(current);
    }

    return lines.length ? lines : ['--'];
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  private formatDateTime(date: Date): string {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  private getLocationLabel(ticket: ServiceTicket): string {
    const city = String(ticket.serviceCity ?? ticket.clientCity ?? '').trim();
    const state = String(ticket.serviceState ?? ticket.clientState ?? '').trim();
    if (city && state) return `${city}, ${state}`;
    return city || state || 'Sin ubicacion';
  }

  private getStatusLabel(status: TicketStatus): string {
    const map: Record<TicketStatus, string> = {
      [TicketStatus.Open]: 'Abierto',
      [TicketStatus.Assigned]: 'Asignado',
      [TicketStatus.InProgress]: 'En proceso',
      [TicketStatus.WaitingParts]: 'Esperando refaccion',
      [TicketStatus.Resolved]: 'Resuelto',
      [TicketStatus.Closed]: 'Cerrado',
      [TicketStatus.Canceled]: 'Cancelado',
    };
    return map[status] ?? String(status || 'Sin estado');
  }

  private clean(value: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x00-\x7F]/g, '');
  }
}
