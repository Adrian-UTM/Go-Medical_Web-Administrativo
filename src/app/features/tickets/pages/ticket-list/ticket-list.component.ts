import { Component, DestroyRef, OnInit, computed, inject, signal, HostListener } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ServiceTicket, TechnicalRouteCandidate, TicketPriority, TicketStatus, TicketType } from '../../models/ticket.model';
import { TicketSupabaseService } from '../../services/ticket.supabase.service';
import { TicketReportPdfService } from '../../services/ticket-report-pdf.service';
import { PageVisibilityService } from '../../../../core/services/page-visibility.service';
import { SupabaseService } from '../../../../core/services/supabase.service';

type TicketQuickFilter = '' | 'today' | 'week' | 'merida' | 'outside_merida' | 'urgent' | 'pending';

interface SummaryCard {
  label: string;
  value: number;
  hint: string;
  tone: 'primary' | 'success' | 'warning' | 'danger';
}

interface ExternalRouteGroup {
  key: string;
  city: string;
  state: string;
  region?: string;
  count: number;
  highestPriority: TicketPriority;
  nearestDate: string;
  routeStatus: 'local' | 'pending' | 'available' | 'scheduled';
  technicians: string[];
}

@Component({
  selector: 'bc-ticket-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DatePipe,
    StatusBadgeComponent,
    LoaderComponent,
    EmptyStateComponent,
    CustomSelectComponent,
  ],
  templateUrl: './ticket-list.component.html',
  styleUrl: './ticket-list.component.css',
})
export class TicketListComponent implements OnInit {
  private readonly ticketsService = inject(TicketSupabaseService);
  private readonly pageVisibility = inject(PageVisibilityService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly ticketReportPdfService = inject(TicketReportPdfService);
  private readonly supabase = inject(SupabaseService);
  private readonly priorityRank: Record<TicketPriority, number> = {
    [TicketPriority.Low]: 1,
    [TicketPriority.Medium]: 2,
    [TicketPriority.High]: 3,
    [TicketPriority.Urgent]: 4,
  };

  private loadInFlight = false;

  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly tickets = signal<ServiceTicket[]>([]);
  readonly unreadCounts = signal<Record<string, number>>({});
  readonly routeCandidates = signal<TechnicalRouteCandidate[]>([]);
  readonly searchQuery = signal('');
  readonly selectedStatus = signal<TicketStatus | ''>('');
  readonly selectedPriority = signal<TicketPriority | ''>('');
  readonly selectedType = signal<TicketType | ''>('');
  readonly selectedQuickFilter = signal<TicketQuickFilter>('');
  readonly activeActionTicketId = signal<string | null>(null);
  readonly isReportMenuOpen = signal(false);

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.report-dropdown-wrapper')) {
      this.isReportMenuOpen.set(false);
    }
  }
  readonly quickFilterOptions: { value: TicketQuickFilter; label: string }[] = [
    { value: '', label: 'Todos' },
    { value: 'today', label: 'Hoy' },
    { value: 'week', label: 'Esta semana' },
    { value: 'merida', label: 'Mérida' },
    { value: 'outside_merida', label: 'Fuera de Mérida' },
    { value: 'urgent', label: 'Urgentes' },
    { value: 'pending', label: 'Pendientes' },
  ];

  readonly statusOptions = [
    { value: '', label: 'Todos los estados' },
    { value: TicketStatus.Open, label: 'Abierto' },
    { value: TicketStatus.Assigned, label: 'Asignado' },
    { value: TicketStatus.InProgress, label: 'En proceso' },
    { value: TicketStatus.WaitingParts, label: 'Esperando refaccion' },
    { value: TicketStatus.Resolved, label: 'Resuelto' },
    { value: TicketStatus.Closed, label: 'Cerrado' },
    { value: TicketStatus.Canceled, label: 'Cancelado' },
  ];

  readonly priorityOptions = [
    { value: '', label: 'Todas las prioridades' },
    { value: TicketPriority.Low, label: 'Baja' },
    { value: TicketPriority.Medium, label: 'Media' },
    { value: TicketPriority.High, label: 'Alta' },
    { value: TicketPriority.Urgent, label: 'Urgente' },
  ];

  readonly typeOptions = [
    { value: '', label: 'Todos los tipos' },
    { value: TicketType.Preventive, label: 'Preventivo' },
    { value: TicketType.Corrective, label: 'Correctivo' },
    { value: TicketType.Warranty, label: 'Garantia' },
    { value: TicketType.Installation, label: 'Instalacion' },
    { value: TicketType.Review, label: 'Revision' },
    { value: TicketType.Other, label: 'Otro' },
  ];

  readonly summaryCards = computed<SummaryCard[]>(() => {
    const tickets = this.tickets();
    const activeTickets = tickets.filter(ticket => !this.isTerminalStatus(ticket.status));
    const completedTickets = tickets.filter(ticket => this.isCompletedStatus(ticket.status));
    const urgentTickets = activeTickets.filter(ticket => ticket.priority === TicketPriority.Urgent);
    const todayTickets = activeTickets.filter(ticket => this.isToday(this.getOperationalDate(ticket)));
    const completionRate = tickets.length ? Math.round((completedTickets.length / tickets.length) * 100) : 0;

    return [
      { label: 'Servicios Totales', value: tickets.length, hint: `+${todayTickets.length} hoy`, tone: 'primary' },
      { label: 'Completados', value: completedTickets.length, hint: `${completionRate}% meta`, tone: 'success' },
      { label: 'Pendientes Urgentes', value: urgentTickets.length, hint: 'Crítico', tone: 'danger' },
      { label: 'Solicitudes de Hoy', value: todayTickets.length, hint: `${todayTickets.length} activas`, tone: 'warning' },
    ];
  });

  readonly todayServices = computed(() =>
    this.tickets()
      .filter(ticket => !this.isTerminalStatus(ticket.status))
      .filter(ticket => this.isToday(this.getOperationalDate(ticket)))
      .sort((a, b) => new Date(this.getOperationalDate(a)).getTime() - new Date(this.getOperationalDate(b)).getTime())
  );

  readonly cityRouteGroups = computed<ExternalRouteGroup[]>(() => {
    const groups = new Map<string, ExternalRouteGroup>();

    for (const ticket of this.tickets()) {
      if (this.isTerminalStatus(ticket.status) || !this.hasLocation(ticket)) {
        continue;
      }

      const city = this.cleanLabel(ticket.serviceCity ?? ticket.clientCity);
      const state = this.cleanLabel(ticket.serviceState ?? ticket.clientState);
      const key = `${this.normalizeLocationText(city)}|${this.normalizeLocationText(state)}`;
      const date = this.getOperationalDate(ticket);
      const technician = String(ticket.assignedTechnicianName ?? '').trim();
      const current = groups.get(key);

      if (!current) {
        groups.set(key, {
          key,
          city,
          state,
          region: this.cleanLabel(ticket.serviceRegion) || undefined,
          count: 1,
          highestPriority: ticket.priority,
          nearestDate: date,
          routeStatus: this.resolveRouteStatus(1, this.isMeridaService(ticket), ticket.routeAuthorized),
          technicians: technician ? [technician] : [],
        });
        continue;
      }

      current.count += 1;
      current.routeStatus = this.resolveRouteStatus(
        current.count,
        this.isMeridaService(ticket),
        ticket.routeAuthorized || current.routeStatus === 'scheduled'
      );
      if (this.priorityRank[ticket.priority] > this.priorityRank[current.highestPriority]) {
        current.highestPriority = ticket.priority;
      }
      if (new Date(date).getTime() < new Date(current.nearestDate).getTime()) {
        current.nearestDate = date;
      }
      if (technician && !current.technicians.includes(technician)) {
        current.technicians.push(technician);
      }
    }

    for (const candidate of this.routeCandidates()) {
      const group = this.buildRouteGroupFromCandidate(candidate);
      if (!group.city || !group.state || this.isMeridaLocation(group.city, group.state)) {
        continue;
      }

      const existing = groups.get(group.key);
      if (!existing || group.count > existing.count) {
        groups.set(group.key, group);
      }
    }

    const rank: Record<ExternalRouteGroup['routeStatus'], number> = {
      local: 1,
      scheduled: 2,
      available: 3,
      pending: 4,
    };

    return [...groups.values()].sort((a, b) => {
      if (rank[a.routeStatus] !== rank[b.routeStatus]) {
        return rank[a.routeStatus] - rank[b.routeStatus];
      }

      return `${a.state} ${a.city}`.localeCompare(`${b.state} ${b.city}`, 'es-MX');
    });
  });

  readonly filteredTickets = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const status = this.selectedStatus();
    const priority = this.selectedPriority();
    const type = this.selectedType();
    const quickFilter = this.selectedQuickFilter();

    return this.tickets().filter(ticket => {
      const matchesQuery = !query || [
        ticket.ticketNumber,
        ticket.clientNameSnapshot,
        ticket.title,
        ticket.productNameSnapshot || '',
        ticket.equipmentSerialNumber || '',
        ticket.assignedTechnicianName || '',
        this.getLocationLabel(ticket),
      ].some(value => value.toLowerCase().includes(query));

      const matchesStatus = !status || ticket.status === status;
      const matchesPriority = !priority || ticket.priority === priority;
      const matchesType = !type || ticket.type === type;
      const matchesQuickFilter = this.matchesQuickFilter(ticket, quickFilter);

      return matchesQuery && matchesStatus && matchesPriority && matchesType && matchesQuickFilter;
    });
  });

  readonly hasActiveFilters = computed(() =>
    !!this.searchQuery().trim() ||
    !!this.selectedStatus() ||
    !!this.selectedPriority() ||
    !!this.selectedType() ||
    !!this.selectedQuickFilter()
  );

  ngOnInit(): void {
    void this.loadTickets();

    this.pageVisibility.visible$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.loadTickets();
      });

    this.setupRealtimeRefresh();
  }

  private setupRealtimeRefresh(): void {
    const channel = this.supabase.client
      .channel('ticket-list-messages-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_tickets' }, () => {
        void this.loadTickets();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_ticket_messages' }, () => {
        void this.loadTickets();
      })
      .subscribe();

    this.destroyRef.onDestroy(() => {
      void this.supabase.client.removeChannel(channel);
    });
  }

  async loadTickets(): Promise<void> {
    if (this.loadInFlight) {
      return;
    }

    this.loadInFlight = true;
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const [tickets, routeCandidates, unreadCounts] = await Promise.all([
        this.ticketsService.getTickets(),
        this.ticketsService.getRouteCandidates(),
        this.ticketsService.getUnreadMessagesCountByTicket(),
      ]);
      this.tickets.set(tickets);
      this.routeCandidates.set(routeCandidates);
      this.unreadCounts.set(unreadCounts);
    } catch (error: any) {
      console.error('[Technical Services] Error loading data', {
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });
      this.tickets.set([]);
      this.routeCandidates.set([]);
      this.unreadCounts.set({});
      this.errorMessage.set('No fue posible cargar la información de servicios técnicos.');
    } finally {
      this.loadInFlight = false;
      this.isLoading.set(false);
    }
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedStatus.set('');
    this.selectedPriority.set('');
    this.selectedType.set('');
    this.selectedQuickFilter.set('');
  }

  setQuickFilter(filter: TicketQuickFilter): void {
    this.selectedQuickFilter.set(this.selectedQuickFilter() === filter ? '' : filter);
  }

  getStatusBadge(status: TicketStatus): { label: string; variant: BadgeVariant } {
    const map: Record<TicketStatus, { label: string; variant: BadgeVariant }> = {
      [TicketStatus.Open]: { label: 'Abierto', variant: 'danger' },
      [TicketStatus.Assigned]: { label: 'Asignado', variant: 'info' },
      [TicketStatus.InProgress]: { label: 'En proceso', variant: 'primary' },
      [TicketStatus.WaitingParts]: { label: 'Esperando refaccion', variant: 'warning' },
      [TicketStatus.Resolved]: { label: 'Resuelto', variant: 'success' },
      [TicketStatus.Closed]: { label: 'Cerrado', variant: 'neutral' },
      [TicketStatus.Canceled]: { label: 'Cancelado', variant: 'danger' },
    };

    return map[status] ?? { label: String(status || 'Sin estado'), variant: 'neutral' };
  }

  getPriorityBadge(priority: TicketPriority): { label: string; variant: BadgeVariant } {
    const map: Record<TicketPriority, { label: string; variant: BadgeVariant }> = {
      [TicketPriority.Low]: { label: 'Baja', variant: 'neutral' },
      [TicketPriority.Medium]: { label: 'Media', variant: 'info' },
      [TicketPriority.High]: { label: 'Alta', variant: 'warning' },
      [TicketPriority.Urgent]: { label: 'Urgente', variant: 'danger' },
    };

    return map[priority] ?? { label: String(priority || 'Sin prioridad'), variant: 'neutral' };
  }

  getRouteBadge(route: ExternalRouteGroup): { label: string; variant: BadgeVariant } {
    if (route.routeStatus === 'local') {
      return { label: 'Servicios pendientes', variant: 'success' };
    }

    if (route.routeStatus === 'scheduled') {
      return { label: 'Ruta programada', variant: 'primary' };
    }

    return route.routeStatus === 'available'
      ? { label: 'Ruta disponible', variant: 'success' }
      : { label: 'Ruta pendiente', variant: 'warning' };
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

    return labels[type] ?? 'Otro';
  }

  getRelatedAsset(ticket: ServiceTicket): string {
    if (ticket.productNameSnapshot && ticket.equipmentSerialNumber) {
      return `${ticket.productNameSnapshot} · ${ticket.equipmentSerialNumber}`;
    }

    return ticket.productNameSnapshot || ticket.equipmentSerialNumber || 'Sin asociar';
  }

  getOperationalDate(ticket: ServiceTicket): string {
    return ticket.scheduledStartAt || ticket.scheduledAt || ticket.requestedServiceDate || ticket.requestedAt || ticket.updatedAt || new Date().toISOString();
  }

  getLocationLabel(ticket: ServiceTicket): string {
    const city = this.cleanLabel(ticket.serviceCity ?? ticket.clientCity);
    const state = this.cleanLabel(ticket.serviceState ?? ticket.clientState);

    if (city && state) {
      return `${city}, ${state}`;
    }

    return city || state || 'Ubicación no registrada';
  }

  getLocationBadgeLabel(ticket: ServiceTicket): string {
    if (!this.hasLocation(ticket)) {
      return 'Ubicación pendiente';
    }

    return this.isMeridaService(ticket) ? 'Atención local' : 'Fuera de Mérida';
  }

  getLocationBadgeClass(ticket: ServiceTicket): string {
    if (!this.hasLocation(ticket)) {
      return 'location-badge--muted';
    }

    return this.isMeridaService(ticket) ? 'location-badge--local' : 'location-badge--external';
  }

  getRouteMessage(route: ExternalRouteGroup): string {
    if (route.routeStatus === 'local') {
      return 'Servicios locales pendientes de programación y agenda.';
    }

    if (route.routeStatus === 'scheduled') {
      return 'Ruta programada para atención externa.';
    }

    return route.count >= 3
      ? 'Ruta disponible para programación.'
      : 'Ruta pendiente: se requieren al menos 3 servicios en esta ubicación.';
  }

  getRouteCardClass(route: ExternalRouteGroup): string {
    return `route-card--${route.routeStatus}`;
  }

  getRouteProgress(route: ExternalRouteGroup): number {
    if (route.routeStatus === 'local') {
      return Math.min(100, Math.max(18, route.count * 7));
    }

    return Math.min(100, Math.round((route.count / 3) * 100));
  }

  getRouteActionLabel(route: ExternalRouteGroup): string {
    if (route.routeStatus === 'local') {
      return 'Programar local';
    }

    if (route.routeStatus === 'pending') {
      return route.count <= 1 ? 'Gestionar ruta' : 'Ver solicitudes';
    }

    return 'Programar ruta';
  }

  getClientInitials(ticket: ServiceTicket): string {
    const words = ticket.clientNameSnapshot
      .replace(/\([^)]*\)/g, '')
      .split(/\s+/)
      .map(word => word.trim())
      .filter(Boolean);

    return `${words[0]?.[0] ?? 'S'}${words[1]?.[0] ?? words[0]?.[1] ?? 'T'}`.toUpperCase();
  }

  getTechniciansLabel(route: ExternalRouteGroup): string {
    return route.technicians.length ? route.technicians.join(', ') : 'Sin ingenieros asignados';
  }

  isMeridaService(ticket: ServiceTicket): boolean {
    if (typeof ticket.isLocalService === 'boolean') {
      return ticket.isLocalService;
    }

    const city = this.normalizeLocationText(ticket.serviceCity ?? ticket.clientCity);
    const state = this.normalizeLocationText(ticket.serviceState ?? ticket.clientState);

    return city === 'merida' && (state === 'yucatan' || state === 'yuc');
  }

  isUrgent(ticket: ServiceTicket): boolean {
    return ticket.priority === TicketPriority.Urgent;
  }

  private matchesQuickFilter(ticket: ServiceTicket, filter: TicketQuickFilter): boolean {
    if (!filter) {
      return true;
    }

    if (filter === 'today') {
      return this.isToday(this.getOperationalDate(ticket));
    }

    if (filter === 'week') {
      return this.isCurrentWeek(this.getOperationalDate(ticket));
    }

    if (filter === 'merida') {
      return this.isMeridaService(ticket);
    }

    if (filter === 'outside_merida') {
      return this.hasLocation(ticket) && !this.isMeridaService(ticket);
    }

    if (filter === 'urgent') {
      return ticket.priority === TicketPriority.Urgent;
    }

    if (filter === 'pending') {
      return !this.isTerminalStatus(ticket.status) && !this.isCompletedStatus(ticket.status);
    }

    return true;
  }

  private isCompletedStatus(status: TicketStatus | string): boolean {
    const normalized = this.normalizeFilterValue(status);
    return normalized === TicketStatus.Resolved || normalized === TicketStatus.Closed || normalized === 'cerrado' || normalized === 'resuelto';
  }

  private isTerminalStatus(status: TicketStatus | string): boolean {
    const normalized = this.normalizeFilterValue(status);
    return normalized === TicketStatus.Closed || normalized === TicketStatus.Canceled || normalized === 'canceled' || normalized === 'cerrado' || normalized === 'cancelado';
  }

  private hasLocation(ticket: ServiceTicket): boolean {
    return !!this.cleanLabel(ticket.serviceCity ?? ticket.clientCity) && !!this.cleanLabel(ticket.serviceState ?? ticket.clientState);
  }

  private buildRouteGroupFromCandidate(candidate: TechnicalRouteCandidate): ExternalRouteGroup {
    const city = this.cleanLabel(candidate.serviceCity);
    const state = this.cleanLabel(candidate.serviceState);
    const matchingTickets = this.tickets()
      .filter(ticket => this.normalizeLocationText(ticket.serviceCity ?? ticket.clientCity) === this.normalizeLocationText(city))
      .filter(ticket => this.normalizeLocationText(ticket.serviceState ?? ticket.clientState) === this.normalizeLocationText(state))
      .filter(ticket => !this.isTerminalStatus(ticket.status));
    const count = Number(candidate.servicesCount || candidate.count || matchingTickets.length || 0);
    const highestPriority = matchingTickets.reduce(
      (current, ticket) => this.priorityRank[ticket.priority] > this.priorityRank[current] ? ticket.priority : current,
      TicketPriority.Medium
    );
    const nearestDate = matchingTickets
      .map(ticket => this.getOperationalDate(ticket))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? new Date().toISOString();
    const technicians = [...new Set(matchingTickets
      .map(ticket => String(ticket.assignedTechnicianName ?? '').trim())
      .filter(Boolean)
    )];

    return {
      key: `${this.normalizeLocationText(city)}|${this.normalizeLocationText(state)}`,
      city,
      state,
      region: this.cleanLabel(candidate.serviceRegion) || undefined,
      count,
      highestPriority,
      nearestDate,
      routeStatus: this.resolveRouteStatus(
        count,
        this.isMeridaLocation(city, state),
        matchingTickets.some(ticket => ticket.routeAuthorized)
      ),
      technicians,
    };
  }

  private resolveRouteStatus(count: number, isLocal: boolean, isAuthorized?: boolean): ExternalRouteGroup['routeStatus'] {
    if (isLocal) {
      return 'local';
    }

    if (isAuthorized) {
      return 'scheduled';
    }

    return count >= 3 ? 'available' : 'pending';
  }

  private isMeridaLocation(city?: string | null, state?: string | null): boolean {
    const normalizedCity = this.normalizeLocationText(city);
    const normalizedState = this.normalizeLocationText(state);

    return normalizedCity === 'merida' && (normalizedState === 'yucatan' || normalizedState === 'yuc');
  }

  private isToday(dateValue: string): boolean {
    const date = new Date(dateValue);
    const today = new Date();

    return date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();
  }

  private isCurrentWeek(dateValue: string): boolean {
    const date = new Date(dateValue);
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    start.setDate(today.getDate() - today.getDay());

    const end = new Date(start);
    end.setDate(start.getDate() + 7);

    return date >= start && date < end;
  }

  private cleanLabel(value: unknown): string {
    return String(value ?? '').trim();
  }

  private normalizeFilterValue(value: unknown): string {
    return this.normalizeLocationText(value);
  }

  private normalizeLocationText(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  openActionsMenu(ticket: ServiceTicket, event: MouseEvent): void {
    event.stopPropagation();
    this.activeActionTicketId.set(
      this.activeActionTicketId() === ticket.id ? null : ticket.id
    );
  }

  closeActionsMenu(): void {
    this.activeActionTicketId.set(null);
  }

  navigateToPanel(ticketId: string, panel: string): void {
    this.closeActionsMenu();
    void this.router.navigate(['/tickets', ticketId], { queryParams: { panel } });
  }

  getNotificationLabel(ticket: ServiceTicket): { text: string; cls: string; count: number } {
    const unread = this.unreadCounts()[ticket.id] ?? 0;
    if (unread > 0) {
      return { text: `${unread}`, cls: 'notif-badge notif-badge--new unread-bell', count: unread };
    }
    return { text: 'Sin notificaciones', cls: 'notif-badge notif-badge--none', count: 0 };
  }

  getGoogleMapsUrl(ticket: ServiceTicket): string {
    const address = [
      ticket.serviceAddress || ticket.clientAddress,
      ticket.serviceCity || ticket.clientCity,
      ticket.serviceState || ticket.clientState,
    ].filter(Boolean).join(', ');
    return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
  }

  getWhatsAppUrl(ticket: ServiceTicket): string {
    const phone = String(ticket.clientId || '').trim();
    const text = encodeURIComponent(`Hola, le contactamos sobre el ticket ${ticket.ticketNumber} - ${ticket.clientNameSnapshot}.`);
    return `https://wa.me/?text=${text}`;
  }

  getWhatsAppShareUrl(ticket: ServiceTicket): string {
    const address = [
      ticket.serviceAddress || ticket.clientAddress,
      ticket.serviceCity || ticket.clientCity,
      ticket.serviceState || ticket.clientState,
    ].filter(Boolean).join(', ');
    const text = `Dirección de servicio para ticket ${ticket.ticketNumber} (${ticket.clientNameSnapshot}): ${address}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  copyAddress(ticket: ServiceTicket): void {
    const address = [
      ticket.serviceAddress || ticket.clientAddress,
      ticket.serviceCity || ticket.clientCity,
      ticket.serviceState || ticket.clientState,
    ].filter(Boolean).join(', ');
    if (address) {
      void navigator.clipboard.writeText(address);
    }
  }

  isTerminalTicket(ticket: ServiceTicket): boolean {
    const s = this.normalizeFilterValue(ticket.status);
    return s === 'closed' || s === 'canceled' || s === 'cerrado' || s === 'cancelado';
  }

  viewTicketDetails(id: string): void {
    void this.router.navigate(['/tickets', id]);
  }

  shouldShowAction(route: ExternalRouteGroup): boolean {
    const label = this.getRouteActionLabel(route);
    return label !== 'Programar local' && label !== 'Gestionar ruta';
  }

  async generateReport(period: 'day' | 'week' | 'month'): Promise<void> {
    this.isReportMenuOpen.set(false);
    const data = this.tickets();
    if (!data || data.length === 0) {
      this.errorMessage.set('No hay datos suficientes para generar el reporte.');
      return;
    }
    this.isLoading.set(true);
    try {
      await this.ticketReportPdfService.downloadReport(period, data);
    } catch (err) {
      console.error(err);
      this.errorMessage.set('No fue posible generar el reporte en PDF.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
