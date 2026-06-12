import { Component, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent, BreadcrumbItem } from '../../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent, BadgeVariant } from '../../../../shared/components/status-badge/status-badge.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { OpportunitiesSupabaseService } from '../../services/opportunities.supabase.service';
import { Opportunity, OpportunityCartStatus, OpportunityStatus } from '../../models/opportunity.model';
import { ProductCategory } from '../../../../models/product.model';

@Component({
  selector: 'bc-opportunity-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    CurrencyPipe,
    DatePipe,
    PageHeaderComponent,
    StatusBadgeComponent,
    LoaderComponent,
  ],
  templateUrl: './opportunity-detail.component.html',
  styleUrl: './opportunity-detail.component.css',
})
export class OpportunityDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly opportunitiesService = inject(OpportunitiesSupabaseService);

  readonly isLoading = signal(true);
  readonly opportunity = signal<Opportunity | null>(null);
  readonly actionMessage = signal('');
  readonly errorMessage = signal('');

  // Form signals
  readonly followUpNote = signal('');
  readonly followUpChannel = signal<'whatsapp' | 'phone' | 'email' | 'in_person' | 'other'>('whatsapp');
  readonly followUpStatus = signal<OpportunityStatus>(OpportunityStatus.Contacted);
  readonly isSubmittingFollowUp = signal(false);

  readonly statusOptions = [
    { value: OpportunityStatus.Contacted, label: 'Contactado' },
    { value: OpportunityStatus.Interested, label: 'Interesado' },
    { value: OpportunityStatus.NoResponse, label: 'Sin respuesta' },
    { value: OpportunityStatus.Closed, label: 'Cerrado' }
  ];

  readonly channelOptions = [
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'phone', label: 'Llamada telefónica' },
    { value: 'email', label: 'Correo electrónico' },
    { value: 'in_person', label: 'En persona' },
    { value: 'other', label: 'Otro' }
  ];

  constructor() {
    void this.loadOpportunity();
  }

  get breadcrumbs(): BreadcrumbItem[] {
    return [
      { label: 'Inicio', routerLink: '/dashboard' },
      { label: 'Oportunidades', routerLink: '/oportunidades' },
      { label: this.opportunity()?.folio ?? 'Detalle' },
    ];
  }

  async loadOpportunity(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      this.opportunity.set(await this.opportunitiesService.getOpportunityById(id) ?? null);
    } catch (error) {
      this.opportunity.set(null);
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible cargar la oportunidad.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async markAsContacted(): Promise<void> {
    await this.runAction(() => this.opportunitiesService.markAsContacted(this.opportunity()!.id), 'Oportunidad marcada como contactada.');
  }

  async markAsInterested(): Promise<void> {
    await this.runAction(() => this.opportunitiesService.markAsInterested(this.opportunity()!.id), 'Oportunidad marcada como interesada.');
  }

  async markAsNoResponse(): Promise<void> {
    await this.runAction(() => this.opportunitiesService.markAsNoResponse(this.opportunity()!.id), 'Oportunidad marcada como sin respuesta.');
  }

  async convertToOrder(): Promise<void> {
    await this.runAction(() => this.opportunitiesService.convertToOrder(this.opportunity()!.id), 'Oportunidad convertida a pedido.');
  }

  async convertToQuote(): Promise<void> {
    await this.runAction(() => this.opportunitiesService.convertToQuote(this.opportunity()!.id), 'Oportunidad convertida a cotización.');
  }

  async closeOpportunity(): Promise<void> {
    await this.runAction(() => this.opportunitiesService.closeOpportunity(this.opportunity()!.id), 'Oportunidad cerrada correctamente.');
  }

  // Interactive link contacts
  contactByPhone(): void {
    if (!this.opportunity()?.contact.phone) return;
    window.open(`tel:${this.opportunity()!.contact.phone}`, '_self');
    void this.opportunitiesService.addCustomFollowUp(
      this.opportunity()!.id,
      OpportunityStatus.Contacted,
      'phone',
      'Intento de llamada telefónica comercial.'
    ).then(updated => {
      if (updated) {
        this.opportunity.set(updated);
        this.actionMessage.set('Llamada iniciada y registrada en el historial.');
      }
    });
  }

  contactByWhatsApp(): void {
    if (!this.opportunity()?.contact.phone) return;
    const formattedPhone = this.opportunity()!.contact.phone.replace(/\D/g, '');
    window.open(`https://wa.me/${formattedPhone}`, '_blank');
    void this.opportunitiesService.addCustomFollowUp(
      this.opportunity()!.id,
      OpportunityStatus.Contacted,
      'whatsapp',
      'Conversación de WhatsApp comercial abierta.'
    ).then(updated => {
      if (updated) {
        this.opportunity.set(updated);
        this.actionMessage.set('WhatsApp abierto y registrado en el historial.');
      }
    });
  }

  contactByEmail(): void {
    if (!this.opportunity()?.contact.email) return;
    window.open(`mailto:${this.opportunity()!.contact.email}`, '_blank');
    void this.opportunitiesService.addCustomFollowUp(
      this.opportunity()!.id,
      OpportunityStatus.Contacted,
      'email',
      'Intento de envío de correo electrónico comercial.'
    ).then(updated => {
      if (updated) {
        this.opportunity.set(updated);
        this.actionMessage.set('Cliente de correo abierto y registrado en el historial.');
      }
    });
  }

  async submitFollowUp(): Promise<void> {
    const note = this.followUpNote().trim();
    if (!note || !this.opportunity()) {
      return;
    }

    this.isSubmittingFollowUp.set(true);
    this.actionMessage.set('');
    this.errorMessage.set('');

    try {
      const updated = await this.opportunitiesService.addCustomFollowUp(
        this.opportunity()!.id,
        this.followUpStatus(),
        this.followUpChannel(),
        note
      );

      if (updated) {
        this.opportunity.set(updated);
        this.followUpNote.set('');
        this.actionMessage.set('Nota de seguimiento registrada con éxito.');
      } else {
        this.errorMessage.set('No fue posible guardar el seguimiento.');
      }
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Error al registrar el seguimiento.');
    } finally {
      this.isSubmittingFollowUp.set(false);
    }
  }

  getCartStatusBadge(status: OpportunityCartStatus): { label: string; variant: BadgeVariant } {
    const map: Record<OpportunityCartStatus, { label: string; variant: BadgeVariant }> = {
      [OpportunityCartStatus.Active]: { label: 'Activo', variant: 'info' },
      [OpportunityCartStatus.Abandoned]: { label: 'Abandonado', variant: 'warning' },
      [OpportunityCartStatus.Recovered]: { label: 'Recuperado', variant: 'success' },
      [OpportunityCartStatus.Converted]: { label: 'Convertido', variant: 'primary' },
      [OpportunityCartStatus.Closed]: { label: 'Cerrado', variant: 'neutral' },
    };

    return map[status];
  }

  getOpportunityStatusBadge(status: OpportunityStatus): { label: string; variant: BadgeVariant } {
    const map: Record<OpportunityStatus, { label: string; variant: BadgeVariant }> = {
      [OpportunityStatus.New]: { label: 'Nueva', variant: 'warning' },
      [OpportunityStatus.Contacted]: { label: 'Contactado', variant: 'info' },
      [OpportunityStatus.Interested]: { label: 'Interesado', variant: 'success' },
      [OpportunityStatus.NoResponse]: { label: 'No respondió', variant: 'danger' },
      [OpportunityStatus.ConvertedToOrder]: { label: 'Pedido', variant: 'primary' },
      [OpportunityStatus.ConvertedToQuote]: { label: 'Cotización', variant: 'primary' },
      [OpportunityStatus.Closed]: { label: 'Cerrada', variant: 'neutral' },
    };

    return map[status];
  }

  getCategoryLabel(category: ProductCategory): string {
    const labels: Record<string, string> = {
      [ProductCategory.UltrasonidoVeterinario]: 'Ultrasonido veterinario',
      [ProductCategory.UltrasonidoHumano]: 'Ultrasonido humano',
      [ProductCategory.Consumible]: 'Consumibles',
      [ProductCategory.Refaccion]: 'Refacciones',
      [ProductCategory.Servicio]: 'Servicios',
      [ProductCategory.UltrasoundVet]: 'Ultrasonido veterinario',
      [ProductCategory.UltrasoundHuman]: 'Ultrasonido humano',
      [ProductCategory.Consumables]: 'Consumibles',
      [ProductCategory.SpareParts]: 'Refacciones',
      [ProductCategory.Services]: 'Servicios',
    };

    return labels[category] ?? 'Sin categoría';
  }

  private async runAction(operation: () => Promise<Opportunity | undefined>, successMessage: string): Promise<void> {
    if (!this.opportunity()) {
      return;
    }

    this.actionMessage.set('');
    this.errorMessage.set('');

    try {
      const updated = await operation();
      if (!updated) {
        this.errorMessage.set('No fue posible actualizar la oportunidad.');
        return;
      }

      this.opportunity.set(updated);
      this.actionMessage.set(successMessage);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No fue posible actualizar la oportunidad.');
    }
  }
}
