import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ClientMockService } from '../../clients/services/client.mock.service';
import { ProductsMockService } from '../../products/services/products.mock.service';
import { Client, ClientStatus } from '../../../core/models/client.model';
import { Product, ProductStatus } from '../../../models/product.model';
import {
  ServiceTicket,
  TicketFilters,
  TicketHistoryItem,
  TicketPriority,
  TicketStatus,
  TicketType,
  TicketUpsertPayload,
} from '../models/ticket.model';

const MOCK_TECHNICIANS: string[] = [];
const MOCK_TICKETS: ServiceTicket[] = [];

@Injectable({ providedIn: 'root' })
export class TicketsMockService {
  private readonly clientService = inject(ClientMockService);
  private readonly productsService = inject(ProductsMockService);

  private readonly _tickets = signal<ServiceTicket[]>([...MOCK_TICKETS]);
  private readonly _activeClients = signal<Client[]>([]);
  private readonly _availableProducts = signal<Product[]>([]);

  private catalogLoaded = false;
  private catalogPromise: Promise<void> | null = null;

  readonly tickets = this._tickets.asReadonly();
  readonly activeClients = computed(() => this._activeClients());
  readonly availableProducts = computed(() => this._availableProducts());
  readonly technicians = computed(() => [...MOCK_TECHNICIANS]);

  constructor() {
    void this.ensureCatalogLoaded();
  }

  async getTickets(filters?: TicketFilters): Promise<ServiceTicket[]> {
    await this.ensureCatalogLoaded();

    let result = [...this._tickets()];

    if (filters?.search?.trim()) {
      const query = filters.search.trim().toLowerCase();
      result = result.filter(ticket =>
        ticket.ticketNumber.toLowerCase().includes(query) ||
        ticket.clientNameSnapshot.toLowerCase().includes(query) ||
        ticket.title.toLowerCase().includes(query) ||
        ticket.description.toLowerCase().includes(query) ||
        (ticket.productNameSnapshot?.toLowerCase().includes(query) ?? false) ||
        (ticket.equipmentSerialNumber?.toLowerCase().includes(query) ?? false) ||
        (ticket.assignedTechnicianName?.toLowerCase().includes(query) ?? false)
      );
    }

    if (filters?.status) {
      result = result.filter(ticket => ticket.status === filters.status);
    }

    if (filters?.priority) {
      result = result.filter(ticket => ticket.priority === filters.priority);
    }

    if (filters?.type) {
      result = result.filter(ticket => ticket.type === filters.type);
    }

    result.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());

    return this.delay(result.map(ticket => this.cloneTicket(ticket)), 260);
  }

  async getTicketById(id: string): Promise<ServiceTicket | undefined> {
    await this.ensureCatalogLoaded();
    const ticket = this._tickets().find(item => item.id === id);
    return this.delay(ticket ? this.cloneTicket(ticket) : undefined, 180);
  }

  async getActiveClients(): Promise<Client[]> {
    await this.ensureCatalogLoaded();
    return this.delay([...this._activeClients()], 180);
  }

  async getAvailableProducts(): Promise<Product[]> {
    await this.ensureCatalogLoaded();
    return this.delay([...this._availableProducts()], 180);
  }

  async getClientById(id: string): Promise<Client | undefined> {
    await this.ensureCatalogLoaded();
    const client = this._activeClients().find(item => item.id === id);
    return this.delay(client ? { ...client } : undefined, 120);
  }

  async createTicket(payload: TicketUpsertPayload): Promise<ServiceTicket> {
    await this.ensureCatalogLoaded();

    const now = new Date().toISOString();
    const ticket = this.composeTicket({
      id: `tkt-${Date.now()}`,
      ticketNumber: this.generateTicketNumber(),
      requestedAt: now,
      updatedAt: now,
      history: [
        this.createHistoryItem({
          status: payload.status ?? TicketStatus.Open,
          comment: 'Ticket registrado en flujo mock por mesa administrativa.',
          authorName: 'Mesa de soporte',
          date: now,
        }),
      ],
      payload,
    });

    this._tickets.update(current => [ticket, ...current]);
    return this.delay(this.cloneTicket(ticket), 320);
  }

  async updateTicket(id: string, payload: TicketUpsertPayload): Promise<ServiceTicket | undefined> {
    await this.ensureCatalogLoaded();

    const current = this._tickets();
    const index = current.findIndex(ticket => ticket.id === id);
    if (index === -1) {
      return this.delay(undefined, 180);
    }

    const existing = current[index];
    const updatedAt = new Date().toISOString();
    const updatedTicket = this.composeTicket({
      id: existing.id,
      ticketNumber: existing.ticketNumber,
      requestedAt: existing.requestedAt,
      updatedAt,
      history: [
        ...existing.history,
        this.createHistoryItem({
          status: payload.status ?? existing.status,
          comment: 'Se actualizaron datos administrativos del ticket.',
          authorName: 'Mesa de soporte',
          date: updatedAt,
        }),
      ],
      payload,
    });

    const next = [...current];
    next[index] = updatedTicket;
    this._tickets.set(next);

    return this.delay(this.cloneTicket(updatedTicket), 280);
  }

  async updateTicketStatus(
    id: string,
    status: TicketStatus,
    comment: string,
    authorName = 'Coordinacion tecnica'
  ): Promise<ServiceTicket | undefined> {
    await this.ensureCatalogLoaded();

    const current = this._tickets();
    const index = current.findIndex(ticket => ticket.id === id);
    if (index === -1) {
      return this.delay(undefined, 180);
    }

    const ticket = current[index];
    const updated: ServiceTicket = {
      ...ticket,
      status,
      updatedAt: new Date().toISOString(),
      history: [
        ...ticket.history,
        this.createHistoryItem({
          status,
          comment,
          authorName,
        }),
      ],
    };

    const next = [...current];
    next[index] = updated;
    this._tickets.set(next);

    return this.delay(this.cloneTicket(updated), 220);
  }

  async assignTechnician(
    id: string,
    technicianName: string,
    authorName = 'Coordinacion tecnica'
  ): Promise<ServiceTicket | undefined> {
    await this.ensureCatalogLoaded();

    const current = this._tickets();
    const index = current.findIndex(ticket => ticket.id === id);
    if (index === -1) {
      return this.delay(undefined, 180);
    }

    const ticket = current[index];
    const nextStatus = ticket.status === TicketStatus.Open ? TicketStatus.Assigned : ticket.status;
    const updated: ServiceTicket = {
      ...ticket,
      assignedTechnicianName: technicianName,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
      history: [
        ...ticket.history,
        this.createHistoryItem({
          status: nextStatus,
          comment: `Ticket asignado a ${technicianName}.`,
          authorName,
        }),
      ],
    };

    const next = [...current];
    next[index] = updated;
    this._tickets.set(next);

    return this.delay(this.cloneTicket(updated), 220);
  }

  private async ensureCatalogLoaded(): Promise<void> {
    if (this.catalogLoaded) {
      return;
    }

    if (!this.catalogPromise) {
      this.catalogPromise = (async () => {
        const [clients, productResponse] = await Promise.all([
          this.clientService.getClients(),
          firstValueFrom(this.productsService.getProducts({ status: ProductStatus.Active })),
        ]);

        this._activeClients.set(clients.filter(client => client.status === ClientStatus.Active));
        this._availableProducts.set(productResponse.data.filter(product => product.status === ProductStatus.Active));
        this.catalogLoaded = true;
      })();
    }

    await this.catalogPromise;
  }

  private composeTicket(config: {
    id: string;
    ticketNumber: string;
    requestedAt: string;
    updatedAt: string;
    history: TicketHistoryItem[];
    payload: TicketUpsertPayload;
  }): ServiceTicket {
    const client = this._activeClients().find(item => item.id === config.payload.clientId);
    const product = config.payload.productId
      ? this._availableProducts().find(item => item.id === config.payload.productId)
      : undefined;

    return {
      id: config.id,
      ticketNumber: config.ticketNumber,
      clientId: config.payload.clientId,
      clientNameSnapshot: config.payload.clientNameSnapshot?.trim() || client?.businessName || 'Cliente no disponible',
      title: config.payload.title.trim(),
      description: config.payload.description.trim(),
      status: config.payload.status ?? TicketStatus.Open,
      priority: config.payload.priority,
      type: config.payload.type,
      productId: config.payload.productId || undefined,
      productNameSnapshot: config.payload.productNameSnapshot?.trim() || product?.name || undefined,
      equipmentSerialNumber: config.payload.equipmentSerialNumber?.trim() || undefined,
      assignedTechnicianName: config.payload.assignedTechnicianName?.trim() || undefined,
      requestedAt: config.requestedAt,
      scheduledAt: config.payload.scheduledAt || undefined,
      updatedAt: config.updatedAt,
      notes: config.payload.notes?.trim() || '',
      attachments: config.payload.attachments ?? [],
      history: config.history.map(item => ({ ...item })),
    };
  }

  private createHistoryItem(config: {
    status: TicketStatus;
    comment: string;
    authorName: string;
    date?: string;
  }): TicketHistoryItem {
    return {
      id: `hist-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      date: config.date ?? new Date().toISOString(),
      status: config.status,
      comment: config.comment,
      authorName: config.authorName,
    };
  }

  private generateTicketNumber(): string {
    const year = new Date().getFullYear();
    const sequence = this._tickets()
      .filter(ticket => ticket.ticketNumber.startsWith(`GST-${year}-`))
      .map(ticket => Number(ticket.ticketNumber.split('-').at(-1)))
      .filter(value => Number.isFinite(value))
      .reduce((max, value) => Math.max(max, value), 0);

    return `GST-${year}-${String(sequence + 1).padStart(4, '0')}`;
  }

  private cloneTicket(ticket: ServiceTicket): ServiceTicket {
    return {
      ...ticket,
      attachments: [...(ticket.attachments ?? [])],
      history: ticket.history.map(item => ({ ...item })),
    };
  }

  private delay<T>(data: T, ms = 240): Promise<T> {
    return new Promise(resolve => setTimeout(() => resolve(data), ms));
  }
}
