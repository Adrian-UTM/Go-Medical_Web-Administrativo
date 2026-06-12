import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { Client } from '../../../../core/models/client.model';
import { Product, ProductCategory, ProductItemType } from '../../../../models/product.model';
import { ServiceTicket, TechnicalRouteCandidate, TicketHistoryItem, TicketPriority, TicketStatus, TicketType, ServiceTicketMessage, ParsedTicketDescription } from '../../models/ticket.model';
import { TicketSupabaseService } from '../../services/ticket.supabase.service';

@Component({
  selector: 'bc-ticket-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DatePipe,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoaderComponent,
    CustomSelectComponent,
  ],
  templateUrl: './ticket-detail.component.html',
  styleUrl: './ticket-detail.component.css',
})
export class TicketDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ticketsService = inject(TicketSupabaseService);

  readonly isLoading = signal(true);
  readonly isProcessing = signal(false);
  readonly ticket = signal<ServiceTicket | null>(null);
  readonly client = signal<Client | null>(null);
  readonly product = signal<Product | null>(null);
  readonly routeCandidate = signal<TechnicalRouteCandidate | null>(null);
  readonly isProductService = computed(() => this.product()?.item_type === 'service');
  readonly productCategoryLabel = signal('');
  readonly actionMessage = signal('');
  // ── Chat / Mensajes ──
  readonly messages = signal<ServiceTicketMessage[]>([]);
  readonly isSendingMessage = signal(false);
  readonly newMessage = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly selectedFilePreview = signal<string | null>(null);

  readonly parsedDescription = computed(() => this.parseDescription(this.ticket()?.description));
  readonly selectedTechnician = signal('');
  readonly externalTechnicianName = signal('');

  // ── Drawer / Panel ──
  readonly activePanel = signal<'messages' | 'schedule' | 'status' | 'location' | 'actions' | null>(null);

  // ── Schedule Panel ──
  readonly scheduleDate = signal('');
  readonly scheduleTimeStr = signal('09:00');
  readonly scheduleDuration = signal('2');
  readonly scheduleNotes = signal('');
  readonly scheduleType = signal<TicketType | ''>('');
  readonly isSavingSchedule = signal(false);
  readonly scheduleError = signal('');

  // ── Status Panel ──
  readonly statusChangeNote = signal('');
  readonly pendingNewStatus = signal<TicketStatus | ''>('');
  readonly isChangingStatus = signal(false);
  readonly technicianOptions = computed(() => [
    { value: '', label: 'Sin asignar' },
    ...this.ticketsService.technicians().map(technician => ({ value: technician.id, label: technician.fullName })),
  ]);
  readonly hasAssignedTechnician = computed(() => !!this.ticket()?.assignedTechnicianId || !!this.ticket()?.assignedTechnicianName);
  readonly assignedTechnicianLabel = computed(() => this.ticket()?.assignedTechnicianName || 'Sin ingeniero asignado');
  readonly assignedTechnicianKindLabel = computed(() => {
    const currentTicket = this.ticket();
    if (!currentTicket?.assignedTechnicianName) {
      return '';
    }

    return currentTicket.assignedTechnicianCustomName ? 'Manual' : 'Perfil';
  });
  readonly technicianActionLabel = computed(() => this.hasAssignedTechnician() ? 'Reasignar ingeniero de servicio' : 'Asignar ingeniero de servicio');
  readonly hasTerminalStatus = computed(() => this.isClosedTicket() || this.isCancelledTicket());
  readonly isExternalRouteTicket = computed(() => this.ticket()?.routeRequired === true && !this.ticket()?.isLocalService);
  readonly externalRouteServiceCount = computed(() => this.routeCandidate()?.servicesCount ?? this.routeCandidate()?.count ?? 0);
  readonly canAuthorizeExternalRoute = computed(() =>
    !!this.ticket() &&
    !this.hasTerminalStatus() &&
    this.isExternalRouteTicket() &&
    this.ticket()?.routeAuthorized !== true &&
    this.externalRouteServiceCount() >= 3
  );

  readonly sortedHistory = computed(() => {
    const currentTicket = this.ticket();
    if (!currentTicket) {
      return [] as TicketHistoryItem[];
    }

    return [...currentTicket.history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  constructor() {
    void this.loadTicket();
    // open drawer from query param (e.g. ?panel=schedule)
    const panel = this.route.snapshot.queryParamMap.get('panel');
    if (panel) {
      this.activePanel.set(panel as any);
    }
  }

  openPanel(name: 'messages' | 'schedule' | 'status' | 'location' | 'actions'): void {
    this.activePanel.set(name);
    document.body.style.overflow = 'hidden';
    if (name === 'schedule') { this.initSchedulePanel(); }
    if (name === 'status') { this.pendingNewStatus.set(''); this.statusChangeNote.set(''); }
  }

  closePanel(): void {
    this.activePanel.set(null);
    document.body.style.overflow = '';
    this.scheduleError.set('');
    // clear query params
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true,
    });
  }

  private initSchedulePanel(): void {
    const ticket = this.ticket();
    if (ticket?.scheduledStartAt) {
      const d = new Date(ticket.scheduledStartAt);
      this.scheduleDate.set(d.toISOString().split('T')[0]);
      this.scheduleTimeStr.set(d.toTimeString().substring(0, 5));
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      this.scheduleDate.set(tomorrow.toISOString().split('T')[0]);
      this.scheduleTimeStr.set('09:00');
    }
    this.scheduleNotes.set(this.ticket()?.notes || '');
    this.scheduleType.set(this.ticket()?.type || '');
    this.selectedTechnician.set(this.ticket()?.assignedTechnicianId || '');
    this.externalTechnicianName.set(this.ticket()?.assignedTechnicianCustomName || '');
  }

  async saveSchedule(): Promise<void> {
    const ticketId = this.ticket()?.id;
    if (!ticketId || this.isSavingSchedule()) return;

    const dateStr = this.scheduleDate().trim();
    const timeStr = this.scheduleTimeStr().trim();
    if (!dateStr || !timeStr) {
      this.scheduleError.set('Ingresa la fecha y hora del servicio.');
      return;
    }

    const startIso = `${dateStr}T${timeStr}:00`;
    const durationH = parseFloat(this.scheduleDuration()) || 2;
    const endDate = new Date(startIso);
    endDate.setHours(endDate.getHours() + Math.floor(durationH));
    endDate.setMinutes(endDate.getMinutes() + Math.round((durationH % 1) * 60));
    const endIso = endDate.toISOString();

    this.isSavingSchedule.set(true);
    this.scheduleError.set('');
    try {
      const updated = await this.ticketsService.scheduleService(
        ticketId,
        startIso,
        endIso,
        this.scheduleNotes(),
        this.selectedTechnician() || null,
        this.externalTechnicianName() || null,
        (this.scheduleType() as TicketType) || undefined
      );
      if (updated) {
        this.ticket.set(updated);
        this.actionMessage.set('Servicio programado correctamente.');
        this.closePanel();
      }
    } catch (err) {
      this.scheduleError.set(err instanceof Error ? err.message : 'No fue posible programar el servicio.');
    } finally {
      this.isSavingSchedule.set(false);
    }
  }

  async applyStatusChange(): Promise<void> {
    const ticketId = this.ticket()?.id;
    const newStatus = this.pendingNewStatus();
    if (!ticketId || !newStatus || this.isChangingStatus()) return;

    this.isChangingStatus.set(true);
    try {
      const customNote = this.statusChangeNote().trim();
      const comment = customNote || `Estado cambiado a ${this.getStatusBadge(newStatus).label}.`;
      const updated = await this.ticketsService.updateTicketStatus(ticketId, newStatus, comment);
      
      if (updated) {
        if (customNote) {
          // Enviar la nota como mensaje para que quede guardada y visible en el chat
          await this.ticketsService.sendMessage(ticketId, `Actualización de estado (${this.getStatusBadge(newStatus).label}): ${customNote}`);
          await this.loadMessages(ticketId);
        }
        this.ticket.set(updated);
        this.actionMessage.set(`Estado actualizado a ${this.getStatusBadge(newStatus).label}.`);
        this.pendingNewStatus.set('');
        this.statusChangeNote.set('');
      }
    } catch (err) {
      this.actionMessage.set(err instanceof Error ? err.message : 'Error al cambiar estado.');
    } finally {
      this.isChangingStatus.set(false);
    }
  }

  getAllowedTransitions(): TicketStatus[] {
    const current = this.normalizeStatus(this.ticket()?.status);
    const allOptions = [
      TicketStatus.Open,
      TicketStatus.Assigned,
      TicketStatus.InProgress,
      TicketStatus.WaitingParts,
      TicketStatus.Resolved,
      TicketStatus.Closed,
      TicketStatus.Canceled
    ];
    return allOptions.filter(s => s !== current && this.normalizeStatus(s) !== current);
  }

  readonly statusTransitionOptions = computed(() => {
    return this.getAllowedTransitions().map(st => ({
      value: st,
      label: this.getStatusBadge(st).label
    }));
  });

  getGoogleMapsUrl(): string {
    const t = this.ticket();
    if (!t) return '';
    const parts = [t.serviceAddress || t.clientAddress, t.serviceCity || t.clientCity, t.serviceState || t.clientState].filter(Boolean).join(', ');
    return parts ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts)}` : '';
  }

  getWhatsAppShareUrl(): string {
    const t = this.ticket();
    if (!t) return '';
    const address = [t.serviceAddress || t.clientAddress, t.serviceCity || t.clientCity, t.serviceState || t.clientState].filter(Boolean).join(', ');
    const msg = `Dirección de servicio para ticket ${t.ticketNumber} (${t.clientNameSnapshot}): ${address || 'Pendiente'}`;
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }

  copyAddressToClipboard(): void {
    const t = this.ticket();
    if (!t) return;
    const address = [t.serviceAddress || t.clientAddress, t.serviceCity || t.clientCity, t.serviceState || t.clientState].filter(Boolean).join(', ');
    if (address) { void navigator.clipboard.writeText(address); this.actionMessage.set('Dirección copiada.'); }
  }

  getFlowStep(): number {
    const s = this.normalizeStatus(this.ticket()?.status);
    if (s === 'open' || s === 'abierto') return 0;
    if (s === 'assigned' || s === 'asignado') return 1;
    if (s === 'in_progress' || s === 'en proceso' || s === 'en_proceso') return 2;
    if (s === 'waiting_parts' || s === 'esperando refaccion' || s === 'esperando_refaccion') return 2;
    if (s === 'resolved' || s === 'resuelto') return 3;
    if (s === 'closed' || s === 'cerrado') return 4;
    if (s === 'canceled' || s === 'cancelado') return 5;
    return 0;
  }

  getNextActionHint(): string {
    const s = this.normalizeStatus(this.ticket()?.status);
    if (s === 'open' || s === 'abierto') return 'Abrir caso técnico y programar servicio.';
    if (s === 'assigned' || s === 'asignado') return 'Iniciar la atención técnica.';
    if (s === 'in_progress' || s === 'en proceso' || s === 'en_proceso') return 'Resolver el caso o poner en espera de refacción.';
    if (s === 'waiting_parts' || s === 'esperando refaccion') return 'Continuar atención cuando llegue la refacción.';
    if (s === 'resolved' || s === 'resuelto') return 'Cerrar el ticket para finalizar el servicio.';
    return 'Sin acciones adicionales disponibles.';
  }


  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Tickets', routerLink: '/tickets' },
      { label: this.ticket()?.ticketNumber ?? 'Detalle' },
    ];
  }

  async loadTicket(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');

    if (!id) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);

    try {
      const currentTicket = await this.ticketsService.getTicketById(id);

      if (!currentTicket) {
        this.ticket.set(null);
        this.client.set(null);
        return;
      }

      this.ticket.set(currentTicket);
      this.client.set(await this.ticketsService.getClientById(currentTicket.clientId) ?? null);
      await this.loadRouteCandidate(currentTicket);
      await this.loadMessages(currentTicket.id);
      this.selectedTechnician.set(currentTicket.assignedTechnicianId ?? '');
      this.externalTechnicianName.set(currentTicket.assignedTechnicianCustomName ?? '');

      if (currentTicket.productId) {
        let product = await this.ticketsService.getAvailableProducts().then(products => products.find(item => item.id === currentTicket.productId));
        if (!product) {
          product = await this.ticketsService.getProductById(currentTicket.productId);
        }
        this.product.set(product ?? null);
        this.productCategoryLabel.set(product ? this.getCategoryLabel(product.category) : '');
      } else {
        this.product.set(null);
        this.productCategoryLabel.set('');
      }
    } catch (error) {
      this.ticket.set(null);
      this.client.set(null);
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible cargar el ticket.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async authorizeExternalRoute(): Promise<void> {
    const currentTicket = this.ticket();
    if (!currentTicket || !this.canAuthorizeExternalRoute()) {
      return;
    }

    await this.applyUpdate(
      () => this.ticketsService.authorizeExternalRouteForTicket(currentTicket.id, currentTicket.routeNotes || 'Ruta externa autorizada administrativamente.'),
      'Ruta externa autorizada correctamente.'
    );

    const updated = this.ticket();
    if (updated) {
      await this.loadRouteCandidate(updated);
    }
  }

  async loadMessages(ticketId: string): Promise<void> {
    try {
      await this.ticketsService.markMessagesAsRead(ticketId);
      const msgs = await this.ticketsService.getMessages(ticketId);
      this.messages.set(msgs);
    } catch (e) {
      console.error('Error cargando mensajes', e);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.selectedFile.set(file);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        this.selectedFilePreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  clearSelectedFile(): void {
    this.selectedFile.set(null);
    this.selectedFilePreview.set(null);
  }

  async sendMessage(): Promise<void> {
    const ticketId = this.ticket()?.id;
    const msg = this.newMessage().trim();
    const file = this.selectedFile();
    
    if (!ticketId || (!msg && !file) || this.isSendingMessage()) return;

    this.isSendingMessage.set(true);
    try {
      let attachmentUrl: string | undefined;
      
      if (file) {
        attachmentUrl = await this.ticketsService.uploadMessageAttachment(file, ticketId);
      }
      
      const sent = await this.ticketsService.sendMessage(ticketId, msg, attachmentUrl);
      if (sent) {
        this.messages.update(msgs => [...msgs, sent]);
        this.newMessage.set('');
        this.clearSelectedFile();
      }
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'Error al enviar mensaje');
    } finally {
      this.isSendingMessage.set(false);
    }
  }

  onKeydownEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return;
    }
    keyboardEvent.preventDefault();
    void this.sendMessage();
  }

  parseDescription(desc: string | undefined): ParsedTicketDescription | null {
    if (!desc || !desc.includes('=== DETALLES DE LA SOLICITUD ===')) return null;

    const result: ParsedTicketDescription = {
      rawDescription: desc,
      equipment: '',
      responsible: '',
      phone: '',
      area: '',
      dateStr: '',
      issueDescription: ''
    };

    const eqMatch = desc.match(/Equipo:\s*(.*?)\s*Responsable:/i);
    const resMatch = desc.match(/Responsable:\s*(.*?)\s*Tel(?:e|é)fono:/i);
    const phoneMatch = desc.match(/Tel(?:e|é)fono:\s*(.*?)\s*(?:Á|A)rea\/Depto:/i);
    const areaMatch = desc.match(/(?:Á|A)rea\/Depto:\s*(.*?)\s*Fecha\/Hora:/i);
    const dateMatch = desc.match(/Fecha\/Hora:\s*(.*?)\s*===\s*DESCRIPCI(?:O|Ó)N DE LA FALLA\s*===/i);
    const issueMatch = desc.split(/===\s*DESCRIPCI(?:O|Ó)N DE LA FALLA\s*===/i);

    if (eqMatch) result.equipment = eqMatch[1].trim();
    if (resMatch) result.responsible = resMatch[1].trim();
    if (phoneMatch) result.phone = phoneMatch[1].trim();
    if (areaMatch) result.area = areaMatch[1].trim();
    if (dateMatch) result.dateStr = dateMatch[1].trim();
    if (issueMatch && issueMatch.length > 1) result.issueDescription = issueMatch[1].trim();

    return result;
  }

  async assignTechnician(): Promise<void> {
    const currentTicket = this.ticket();
    const technicianId = this.selectedTechnician();

    if (this.hasTerminalStatus() || this.isResolvedTicket() || !this.canAssignTechnician()) {
      return;
    }

    if (!currentTicket) {
      return;
    }

    const customName = this.externalTechnicianName().trim();
    if (!technicianId && !customName) {
      this.actionMessage.set('Selecciona un ingeniero registrado o escribe el nombre del ingeniero.');
      return;
    }

    if (!technicianId && customName) {
      await this.applyUpdate(
        () => this.ticketsService.assignExternalTechnician(currentTicket.id, customName),
        this.hasAssignedTechnician() ? 'Ingeniero reasignado correctamente.' : 'Ticket asignado correctamente.'
      );
      return;
    }

    await this.applyUpdate(
      () => this.ticketsService.assignTechnician(currentTicket.id, technicianId),
      this.hasAssignedTechnician() ? 'Ingeniero reasignado correctamente.' : 'Ticket asignado correctamente.'
    );
  }

  async markInProgress(): Promise<void> {
    if (this.hasTerminalStatus() || !this.canMarkInProgress()) {
      return;
    }

    await this.changeStatus(TicketStatus.InProgress, 'Ticket marcado como en proceso por seguimiento tecnico.');
  }

  async markWaitingParts(): Promise<void> {
    if (this.hasTerminalStatus() || !this.canMarkWaitingParts()) {
      return;
    }

    await this.changeStatus(TicketStatus.WaitingParts, 'Ticket marcado como esperando refaccion o confirmacion de componente.');
  }

  async markResolved(): Promise<void> {
    if (this.hasTerminalStatus() || !this.canMarkResolved()) {
      return;
    }

    await this.changeStatus(TicketStatus.Resolved, 'Ticket marcado como resuelto tras la intervencion tecnica.');
  }

  async closeTicket(): Promise<void> {
    if (this.hasTerminalStatus() || !this.canCloseTicket()) {
      return;
    }

    await this.changeStatus(TicketStatus.Closed, 'Ticket cerrado administrativamente despues de validar el seguimiento.');
  }

  async cancelTicket(): Promise<void> {
    if (this.hasTerminalStatus() || !this.canCancelTicket()) {
      return;
    }

    await this.changeStatus(TicketStatus.Canceled, 'Ticket cancelado por cierre administrativo.');
  }

  async reopenTicket(): Promise<void> {
    const currentTicket = this.ticket();
    if (!currentTicket || !this.hasTerminalStatus()) {
      return;
    }

    await this.applyUpdate(
      () => this.ticketsService.updateTicketStatus(currentTicket.id, TicketStatus.Assigned, 'Ticket reabierto tras revisión administrativa.'),
      'Ticket reabierto tras revisión administrativa.'
    );
  }

  isClosedTicket(): boolean {
    return this.normalizeStatus(this.ticket()?.status) === TicketStatus.Closed || this.normalizeStatus(this.ticket()?.status) === 'cerrado';
  }

  isCancelledTicket(): boolean {
    const status = this.normalizeStatus(this.ticket()?.status);
    return status === TicketStatus.Canceled || status === 'canceled' || status === 'cancelado';
  }

  isResolvedTicket(): boolean {
    const status = this.normalizeStatus(this.ticket()?.status);
    return status === TicketStatus.Resolved || status === 'resolved' || status === 'resuelto';
  }

  scrollToChat(): void {
    const el = document.getElementById('chat-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }

  terminalStatusMessage(): string {
    if (this.isClosedTicket()) {
      return 'Ticket cerrado. No hay acciones operativas disponibles.';
    }

    if (this.isCancelledTicket()) {
      return 'Ticket cancelado. No hay acciones operativas disponibles.';
    }

    return '';
  }

  canMarkInProgress(): boolean {
    const status = this.normalizeStatus(this.ticket()?.status);
    return !this.hasTerminalStatus() && (status === TicketStatus.Assigned || status === 'assigned' || status === TicketStatus.WaitingParts || status === 'waiting_parts');
  }

  canMarkWaitingParts(): boolean {
    const status = this.normalizeStatus(this.ticket()?.status);
    return !this.hasTerminalStatus() && (status === TicketStatus.InProgress || status === 'in_progress');
  }

  canMarkResolved(): boolean {
    const status = this.normalizeStatus(this.ticket()?.status);
    return !this.hasTerminalStatus() && (status === TicketStatus.InProgress || status === 'in_progress' || status === TicketStatus.WaitingParts || status === 'waiting_parts');
  }

  canCloseTicket(): boolean {
    const status = this.normalizeStatus(this.ticket()?.status);
    return !this.hasTerminalStatus() && (status === TicketStatus.Resolved || status === 'resolved' || status === 'resuelto');
  }

  canCancelTicket(): boolean {
    const status = this.normalizeStatus(this.ticket()?.status);
    return status === TicketStatus.Open || status === 'open' ||
           status === TicketStatus.Assigned || status === 'assigned' ||
           status === TicketStatus.InProgress || status === 'in_progress' ||
           status === TicketStatus.WaitingParts || status === 'waiting_parts';
  }

  canAssignTechnician(): boolean {
    const status = this.normalizeStatus(this.ticket()?.status);
    return status === TicketStatus.Open || status === 'open' ||
           status === TicketStatus.Assigned || status === 'assigned' ||
           status === TicketStatus.InProgress || status === 'in_progress' ||
           status === TicketStatus.WaitingParts || status === 'waiting_parts';
  }

  getStatusBadge(status: TicketStatus | string): { label: string; variant: BadgeVariant } {
    const map: Record<string, { label: string; variant: BadgeVariant }> = {
      [TicketStatus.Open]: { label: 'Abierto', variant: 'danger' },
      [TicketStatus.Assigned]: { label: 'Asignado', variant: 'info' },
      [TicketStatus.InProgress]: { label: 'En proceso', variant: 'primary' },
      [TicketStatus.WaitingParts]: { label: 'Esperando refaccion', variant: 'warning' },
      [TicketStatus.Resolved]: { label: 'Resuelto', variant: 'success' },
      [TicketStatus.Closed]: { label: 'Cerrado', variant: 'neutral' },
      [TicketStatus.Canceled]: { label: 'Cancelado', variant: 'danger' },
      cerrado: { label: 'Cerrado', variant: 'neutral' },
      cancelado: { label: 'Cancelado', variant: 'danger' },
      canceled: { label: 'Cancelado', variant: 'danger' },
    };

    return map[this.normalizeStatus(status)] ?? { label: String(status || 'Sin estado'), variant: 'neutral' };
  }

  getPriorityBadge(priority: TicketPriority): { label: string; variant: BadgeVariant } {
    const map: Record<TicketPriority, { label: string; variant: BadgeVariant }> = {
      [TicketPriority.Low]: { label: 'Baja', variant: 'neutral' },
      [TicketPriority.Medium]: { label: 'Media', variant: 'info' },
      [TicketPriority.High]: { label: 'Alta', variant: 'warning' },
      [TicketPriority.Urgent]: { label: 'Urgente', variant: 'danger' },
    };

    return map[priority];
  }

  getTypeLabel(type: TicketType): string {
    const labels: Record<TicketType, string> = {
      [TicketType.Preventive]: 'Preventivo',
      [TicketType.Corrective]: 'Correctivo',
      [TicketType.Warranty]: 'Garantia',
      [TicketType.Installation]: 'Instalacion',
      [TicketType.Review]: 'Revision',
      [TicketType.Other]: 'Otro',
    };

    return labels[type];
  }

  getClientContact(): string {
    const currentClient = this.client();
    if (!currentClient) {
      return 'Contacto no disponible';
    }

    const parts = [currentClient.contactName, currentClient.email, currentClient.phone].filter(Boolean);
    return parts.join(' · ');
  }

  getRelatedAsset(): string {
    const currentTicket = this.ticket();
    if (!currentTicket) {
      return 'Sin asociar';
    }

    if (currentTicket.productNameSnapshot && currentTicket.equipmentSerialNumber) {
      return `${currentTicket.productNameSnapshot} · ${currentTicket.equipmentSerialNumber}`;
    }

    return currentTicket.productNameSnapshot || currentTicket.equipmentSerialNumber || 'Sin asociar';
  }

  getServiceLocationLabel(): string {
    const currentTicket = this.ticket();
    if (!currentTicket) {
      return 'Ubicación no registrada';
    }

    const city = String(currentTicket.serviceCity ?? currentTicket.clientCity ?? '').trim();
    const state = String(currentTicket.serviceState ?? currentTicket.clientState ?? '').trim();

    return [city, state].filter(Boolean).join(', ') || 'Ubicación no registrada';
  }

  getServiceAddressLabel(): string {
    const currentTicket = this.ticket();
    return currentTicket?.serviceAddress || currentTicket?.clientAddress || 'Dirección no registrada';
  }

  getRouteStatusMessage(): string {
    const currentTicket = this.ticket();
    if (!currentTicket?.routeRequired) {
      return 'No requiere ruta externa.';
    }

    if (currentTicket.routeAuthorized) {
      return 'Ruta externa autorizada.';
    }

    if (this.externalRouteServiceCount() >= 3) {
      return 'Ruta disponible para programación.';
    }

    return 'Ruta pendiente: se requieren al menos 3 servicios en esta ubicación.';
  }

  private async changeStatus(status: TicketStatus, comment: string): Promise<void> {
    const currentTicket = this.ticket();
    if (!currentTicket || this.hasTerminalStatus()) {
      return;
    }

    await this.applyUpdate(
      () => this.ticketsService.updateTicketStatus(currentTicket.id, status, comment),
      `Ticket actualizado a estado ${this.getStatusBadge(status).label.toLowerCase()}.`
    );
  }

  private async loadRouteCandidate(ticket: ServiceTicket): Promise<void> {
    if (!ticket.routeRequired || !ticket.serviceCity || !ticket.serviceState) {
      this.routeCandidate.set(null);
      return;
    }

    const candidates = await this.ticketsService.getRouteCandidates();
    const normalizedCity = this.normalizeLocation(ticket.serviceCity);
    const normalizedState = this.normalizeLocation(ticket.serviceState);
    this.routeCandidate.set(candidates.find(candidate =>
      this.normalizeLocation(candidate.serviceCity) === normalizedCity &&
      this.normalizeLocation(candidate.serviceState) === normalizedState
    ) ?? null);
  }

  private async applyUpdate(
    operation: () => Promise<ServiceTicket | undefined>,
    successMessage: string,
  ): Promise<void> {
    this.isProcessing.set(true);

    try {
      const updated = await operation();
      if (!updated) {
        return;
      }

      this.ticket.set(updated);
      this.actionMessage.set(successMessage);
      if (updated.assignedTechnicianId) {
        this.selectedTechnician.set(updated.assignedTechnicianId ?? '');
        this.externalTechnicianName.set('');
      } else if (updated.assignedTechnicianCustomName) {
        this.selectedTechnician.set('');
        this.externalTechnicianName.set(updated.assignedTechnicianCustomName);
      } else {
        this.selectedTechnician.set('');
        this.externalTechnicianName.set('');
      }
    } catch (error) {
      this.actionMessage.set(error instanceof Error ? error.message : 'No fue posible actualizar el ticket.');
    } finally {
      this.isProcessing.set(false);
    }
  }

  private getCategoryLabel(category: ProductCategory): string {
    const labels: Record<string, string> = {
      [ProductCategory.EquipoMedico]: 'Equipo medico',
      [ProductCategory.UltrasonidoHumano]: 'Ultrasonido humano',
      [ProductCategory.UltrasonidoVeterinario]: 'Ultrasonido veterinario',
      [ProductCategory.Consumible]: 'Consumibles',
      [ProductCategory.Refaccion]: 'Refacciones',
      [ProductCategory.Accesorio]: 'Accesorios',
      [ProductCategory.Servicio]: 'Servicios',
      [ProductCategory.UltrasoundVet]: 'Ultrasonido veterinario',
      [ProductCategory.UltrasoundHuman]: 'Ultrasonido humano',
      [ProductCategory.Consumables]: 'Consumibles',
      [ProductCategory.SpareParts]: 'Refacciones',
      [ProductCategory.Services]: 'Servicios',
    };

    return labels[category] ?? 'Sin categoria';
  }

  normalizeStatus(status: unknown): string {
    return String(status ?? '').trim().toLowerCase();
  }

  private normalizeLocation(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
}
