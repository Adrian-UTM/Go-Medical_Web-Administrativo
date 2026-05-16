import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ClientMockService } from '../../clients/services/client.mock.service';
import { ProductsMockService } from '../../products/services/products.mock.service';
import { Client } from '../../../core/models/client.model';
import { Product, ProductCategory, ProductStatus } from '../../../models/product.model';
import {
  Opportunity,
  OpportunityActionType,
  OpportunityCartStatus,
  OpportunityContact,
  OpportunityFilters,
  OpportunityFollowUp,
  OpportunityItem,
  OpportunityStatus,
} from '../models/opportunity.model';

const ESTIMATED_TAX_PCT = 0.16;

interface OpportunitySeed {
  id: string;
  folio: string;
  cartStatus: OpportunityCartStatus;
  opportunityStatus: OpportunityStatus;
  clientId?: string;
  contact?: OpportunityContact;
  itemSeeds: Array<{ productId: string; quantity: number }>;
  lastActivityAt: string;
  abandonedAt: string;
  assignedTo: string;
  commercialNotes: string;
  followUps: OpportunityFollowUp[];
  createdAt: string;
  updatedAt: string;
}

const OPPORTUNITY_SEEDS: OpportunitySeed[] = [
  {
    id: 'opp-001',
    folio: 'BOP-2026-0001',
    cartStatus: OpportunityCartStatus.Abandoned,
    opportunityStatus: OpportunityStatus.New,
    clientId: 'cli-001',
    itemSeeds: [
      { productId: 'prod-002', quantity: 1 },
      { productId: 'prod-003', quantity: 8 },
    ],
    lastActivityAt: '2026-05-08T17:40:00Z',
    abandonedAt: '2026-05-08T17:40:00Z',
    assignedTo: 'Valeria Campos',
    commercialNotes: 'Cliente recurrente que dejo el carrito pendiente tras revisar opciones de financiamiento.',
    followUps: [
      {
        id: 'fup-001',
        actionType: OpportunityActionType.Note,
        title: 'Carrito detectado',
        note: 'Se detecto abandono de carrito despues de agregar equipo humano y consumibles.',
        createdAt: '2026-05-08T17:45:00Z',
        createdBy: 'Sistema Go Medical',
      },
    ],
    createdAt: '2026-05-08T16:10:00Z',
    updatedAt: '2026-05-08T17:45:00Z',
  },
  {
    id: 'opp-002',
    folio: 'BOP-2026-0002',
    cartStatus: OpportunityCartStatus.Recovered,
    opportunityStatus: OpportunityStatus.Contacted,
    clientId: 'cli-003',
    itemSeeds: [
      { productId: 'prod-001', quantity: 1 },
      { productId: 'prod-004', quantity: 1 },
    ],
    lastActivityAt: '2026-05-09T12:15:00Z',
    abandonedAt: '2026-05-07T10:30:00Z',
    assignedTo: 'Patricia Mena',
    commercialNotes: 'El cliente pidio llamada para revisar instalacion y entrenamiento posterior.',
    followUps: [
      {
        id: 'fup-002',
        actionType: OpportunityActionType.Note,
        title: 'Carrito detectado',
        note: 'Se agrego equipo veterinario con servicio anual.',
        createdAt: '2026-05-07T10:35:00Z',
        createdBy: 'Sistema Go Medical',
      },
      {
        id: 'fup-003',
        actionType: OpportunityActionType.Contacted,
        title: 'Cliente contactado',
        note: 'Se realizo llamada inicial y se solicito seguimiento comercial.',
        createdAt: '2026-05-09T12:15:00Z',
        createdBy: 'Patricia Mena',
      },
    ],
    createdAt: '2026-05-07T09:50:00Z',
    updatedAt: '2026-05-09T12:15:00Z',
  },
  {
    id: 'opp-003',
    folio: 'BOP-2026-0003',
    cartStatus: OpportunityCartStatus.Abandoned,
    opportunityStatus: OpportunityStatus.NoResponse,
    contact: {
      isProspect: true,
      displayName: 'Dr. Javier Rosado',
      companyName: 'Imagen Diagnostica del Sureste',
      email: 'jrosado@idsureste.mx',
      phone: '9992341102',
      city: 'Merida',
      state: 'Yucatan',
    },
    itemSeeds: [
      { productId: 'prod-005', quantity: 2 },
      { productId: 'prod-003', quantity: 10 },
    ],
    lastActivityAt: '2026-05-05T18:05:00Z',
    abandonedAt: '2026-05-05T18:05:00Z',
    assignedTo: 'Valeria Campos',
    commercialNotes: 'Prospecto nuevo interesado en refacciones y stock inmediato para mantenimiento interno.',
    followUps: [
      {
        id: 'fup-004',
        actionType: OpportunityActionType.Note,
        title: 'Carrito detectado',
        note: 'Prospecto sin cuenta finalizada abandono el checkout antes del pago.',
        createdAt: '2026-05-05T18:10:00Z',
        createdBy: 'Sistema Go Medical',
      },
      {
        id: 'fup-005',
        actionType: OpportunityActionType.NoResponse,
        title: 'Sin respuesta',
        note: 'Se envio correo de seguimiento y no hubo respuesta en 72 horas.',
        createdAt: '2026-05-10T09:00:00Z',
        createdBy: 'Valeria Campos',
      },
    ],
    createdAt: '2026-05-05T17:20:00Z',
    updatedAt: '2026-05-10T09:00:00Z',
  },
];

@Injectable({ providedIn: 'root' })
export class OpportunitiesMockService {
  private readonly clientService = inject(ClientMockService);
  private readonly productsService = inject(ProductsMockService);

  private readonly _opportunities = signal<Opportunity[]>([]);
  private readonly _clients = signal<Client[]>([]);
  private readonly _products = signal<Product[]>([]);

  private catalogLoaded = false;
  private catalogPromise: Promise<void> | null = null;

  async getOpportunities(filters?: OpportunityFilters): Promise<Opportunity[]> {
    await this.ensureCatalogLoaded();

    let result = [...this._opportunities()];

    if (filters?.search?.trim()) {
      const query = filters.search.trim().toLowerCase();
      result = result.filter(opportunity =>
        opportunity.folio.toLowerCase().includes(query) ||
        opportunity.contact.displayName.toLowerCase().includes(query) ||
        opportunity.contact.companyName.toLowerCase().includes(query) ||
        opportunity.items.some(item => item.productName.toLowerCase().includes(query) || item.sku.toLowerCase().includes(query))
      );
    }

    if (filters?.cartStatus) {
      result = result.filter(opportunity => opportunity.cartStatus === filters.cartStatus);
    }

    if (filters?.opportunityStatus) {
      result = result.filter(opportunity => opportunity.opportunityStatus === filters.opportunityStatus);
    }

    if (filters?.assignedTo?.trim()) {
      result = result.filter(opportunity => opportunity.assignedTo === filters.assignedTo);
    }

    result.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
    return this.delay(result.map(opportunity => this.cloneOpportunity(opportunity)), 260);
  }

  async getOpportunityById(id: string): Promise<Opportunity | undefined> {
    await this.ensureCatalogLoaded();
    const opportunity = this._opportunities().find(item => item.id === id);
    return this.delay(opportunity ? this.cloneOpportunity(opportunity) : undefined, 220);
  }

  async markAsContacted(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunity(id, {
      opportunityStatus: OpportunityStatus.Contacted,
      cartStatus: OpportunityCartStatus.Recovered,
      followUp: this.createFollowUp(OpportunityActionType.Contacted, 'Cliente contactado', 'Se realizo primer contacto comercial con el cliente o prospecto.', 'Equipo comercial'),
    });
  }

  async markAsInterested(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunity(id, {
      opportunityStatus: OpportunityStatus.Interested,
      cartStatus: OpportunityCartStatus.Recovered,
      followUp: this.createFollowUp(OpportunityActionType.Interested, 'Cliente interesado', 'La oportunidad continua activa y con interes confirmado.', 'Equipo comercial'),
    });
  }

  async markAsNoResponse(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunity(id, {
      opportunityStatus: OpportunityStatus.NoResponse,
      cartStatus: OpportunityCartStatus.Abandoned,
      followUp: this.createFollowUp(OpportunityActionType.NoResponse, 'Sin respuesta', 'Se intento seguimiento y no se obtuvo respuesta del cliente.', 'Equipo comercial'),
    });
  }

  async convertToOrder(id: string): Promise<Opportunity | undefined> {
    const orderRef = `BCO-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000)).padStart(4, '0')}`;
    return this.updateOpportunity(id, {
      opportunityStatus: OpportunityStatus.ConvertedToOrder,
      cartStatus: OpportunityCartStatus.Converted,
      followUp: this.createFollowUp(OpportunityActionType.ConvertedToOrder, 'Convertida a pedido', `Conversion mock realizada a pedido ${orderRef}.`, 'Equipo comercial'),
    });
  }

  async convertToQuote(id: string): Promise<Opportunity | undefined> {
    const quoteRef = `BCQ-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000)).padStart(4, '0')}`;
    return this.updateOpportunity(id, {
      opportunityStatus: OpportunityStatus.ConvertedToQuote,
      cartStatus: OpportunityCartStatus.Converted,
      followUp: this.createFollowUp(OpportunityActionType.ConvertedToQuote, 'Convertida a cotizacion', `Conversion mock realizada a cotizacion ${quoteRef}.`, 'Equipo comercial'),
    });
  }

  async closeOpportunity(id: string): Promise<Opportunity | undefined> {
    return this.updateOpportunity(id, {
      opportunityStatus: OpportunityStatus.Closed,
      cartStatus: OpportunityCartStatus.Closed,
      followUp: this.createFollowUp(OpportunityActionType.Closed, 'Oportunidad cerrada', 'La oportunidad se cerro sin conversion comercial adicional.', 'Equipo comercial'),
    });
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

        this._clients.set(clients);
        this._products.set(productResponse.data.filter(product => product.status === ProductStatus.Active));
        this._opportunities.set(this.buildMockOpportunities());
        this.catalogLoaded = true;
      })();
    }

    await this.catalogPromise;
  }

  private buildMockOpportunities(): Opportunity[] {
    return OPPORTUNITY_SEEDS.map(seed => {
      const contact = seed.clientId ? this.resolveClientContact(seed.clientId) : seed.contact!;
      const items = seed.itemSeeds.map(itemSeed => this.resolveOpportunityItem(itemSeed.productId, itemSeed.quantity));
      const estimatedSubtotal = this.roundCurrency(items.reduce((sum, item) => sum + item.estimatedLineTotal, 0));
      const estimatedTotal = this.roundCurrency(estimatedSubtotal * (1 + ESTIMATED_TAX_PCT));

      return {
        id: seed.id,
        folio: seed.folio,
        cartStatus: seed.cartStatus,
        opportunityStatus: seed.opportunityStatus,
        contact,
        items,
        estimatedSubtotal,
        estimatedTotal,
        lastActivityAt: seed.lastActivityAt,
        abandonedAt: seed.abandonedAt,
        assignedTo: seed.assignedTo,
        commercialNotes: seed.commercialNotes,
        followUps: seed.followUps.map(entry => ({ ...entry })),
        createdAt: seed.createdAt,
        updatedAt: seed.updatedAt,
      };
    });
  }

  private resolveClientContact(clientId: string): OpportunityContact {
    const client = this._clients().find(item => item.id === clientId);

    if (!client) {
      return {
        clientId,
        isProspect: false,
        displayName: 'Cliente no disponible',
        companyName: 'Cliente no disponible',
        email: 'sin-correo@gomedical.mx',
        phone: 'No disponible',
      };
    }

    return {
      clientId: client.id,
      isProspect: false,
      displayName: client.contactName,
      companyName: client.businessName,
      email: client.email,
      phone: client.phone,
      city: client.city,
      state: client.state,
    };
  }

  private resolveOpportunityItem(productId: string, quantity: number): OpportunityItem {
    const product = this._products().find(item => item.id === productId);

    if (!product) {
      return {
        productId,
        sku: 'SIN-SKU',
        productName: 'Producto no disponible',
        productCategory: ProductCategory.Consumables,
        quantity,
        unitPrice: 0,
        estimatedLineTotal: 0,
      };
    }

    const unitPrice = product.price_mxn ?? 0;
    return {
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      productCategory: product.category,
      quantity,
      unitPrice,
      estimatedLineTotal: this.roundCurrency(quantity * unitPrice),
    };
  }

  private async updateOpportunity(id: string, change: {
    opportunityStatus: OpportunityStatus;
    cartStatus: OpportunityCartStatus;
    followUp: OpportunityFollowUp;
  }): Promise<Opportunity | undefined> {
    await this.ensureCatalogLoaded();

    const current = this._opportunities();
    const index = current.findIndex(item => item.id === id);
    if (index === -1) {
      return this.delay(undefined, 200);
    }

    const updatedAt = new Date().toISOString();
    const updated: Opportunity = {
      ...current[index],
      opportunityStatus: change.opportunityStatus,
      cartStatus: change.cartStatus,
      lastActivityAt: updatedAt,
      updatedAt,
      followUps: [change.followUp, ...current[index].followUps],
    };

    const next = [...current];
    next[index] = updated;
    this._opportunities.set(next);

    return this.delay(this.cloneOpportunity(updated), 260);
  }

  private createFollowUp(actionType: OpportunityActionType, title: string, note: string, createdBy: string): OpportunityFollowUp {
    return {
      id: `fup-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      actionType,
      title,
      note,
      createdAt: new Date().toISOString(),
      createdBy,
    };
  }

  private cloneOpportunity(opportunity: Opportunity): Opportunity {
    return {
      ...opportunity,
      contact: { ...opportunity.contact },
      items: opportunity.items.map(item => ({ ...item })),
      followUps: opportunity.followUps.map(entry => ({ ...entry })),
    };
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private delay<T>(data: T, ms = 250): Promise<T> {
    return new Promise(resolve => setTimeout(() => resolve(data), ms));
  }
}

