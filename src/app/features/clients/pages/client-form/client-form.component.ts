import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { ClientAddressDetails, ClientStatus, ClientType } from '../../../../core/models/client.model';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ClientSupabaseService } from '../../services/client.supabase.service';

@Component({
  selector: 'bc-client-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    LoaderComponent,
    CustomSelectComponent,
  ],
  templateUrl: './client-form.component.html',
  styleUrls: ['./client-form.component.css']
})
export class ClientFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly clientService = inject(ClientSupabaseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly isEditMode = signal(false);
  readonly clientId = signal<string | null>(null);
  readonly saveErrorMessage = signal('');

  readonly clientTypes = Object.values(ClientType);
  readonly clientStatuses = Object.values(ClientStatus);

  readonly typeOptions = this.clientTypes.map(type => ({ value: type, label: this.getTypeLabel(type) }));
  readonly statusOptions = [
    { value: ClientStatus.Active, label: 'Activo - Puede facturar' },
    { value: ClientStatus.Inactive, label: 'Inactivo - Bloqueado' },
  ];

  readonly clientForm: FormGroup = this.fb.group({
    clientType: [ClientType.Clinica, Validators.required],
    status: [ClientStatus.Active, Validators.required],
    businessName: ['', [Validators.required, Validators.maxLength(100)]],
    tradeName: ['', Validators.maxLength(100)],
    rfc: ['', [Validators.required, Validators.maxLength(13)]],
    contactName: ['', [Validators.required, Validators.maxLength(100)]],
    contactPosition: ['', Validators.maxLength(100)],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
    billingEmail: ['', [Validators.email, Validators.maxLength(100)]],
    phone: ['', [Validators.required, Validators.maxLength(20)]],
    billingAddress: this.createAddressGroup(),
    useSameShippingAddress: [true],
    shippingAddress: this.createAddressGroup(),
    notes: ['', Validators.maxLength(500)],
  });

  readonly shippingAddressEnabled = computed(() => !this.clientForm.get('useSameShippingAddress')?.value);

  get pageTitle(): string {
    return this.isEditMode() ? 'Editar cliente' : 'Nuevo cliente';
  }

  get breadcrumbs() {
    return [
      { label: 'Inicio', url: '/dashboard' },
      { label: 'Clientes', url: '/clientes' },
      { label: this.pageTitle },
    ];
  }

  get billingAddressGroup(): FormGroup {
    return this.clientForm.get('billingAddress') as FormGroup;
  }

  get shippingAddressGroup(): FormGroup {
    return this.clientForm.get('shippingAddress') as FormGroup;
  }

  constructor() {
    this.setupShippingAddressBehavior();
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode.set(true);
      this.clientId.set(id);
      await this.loadClient(id);
      return;
    }

    this.applyShippingAddressState(true);
  }

  async loadClient(id: string): Promise<void> {
    this.isLoading.set(true);
    this.saveErrorMessage.set('');

    try {
      const client = await firstValueFrom(this.clientService.getClientById(id));
      if (!client) {
        await this.router.navigate(['/clientes']);
        return;
      }

      const billingAddress = client.billingAddressDetails ?? this.emptyAddressDetails();
      const shippingAddress = client.shippingAddressDetails ?? billingAddress;
      const useSameShippingAddress = client.useBillingAddressForShipping !== false;

      this.clientForm.patchValue({
        clientType: client.clientType || client.client_type,
        status: client.status,
        businessName: client.businessName || client.business_name,
        tradeName: client.tradeName || client.trade_name,
        rfc: client.rfc,
        contactName: client.contactName || client.contact_name,
        contactPosition: client.contactPosition || client.contact_position,
        email: client.email,
        billingEmail: client.billingEmail || client.billing_email,
        phone: client.phone,
        billingAddress,
        useSameShippingAddress,
        shippingAddress,
        notes: client.notes,
      }, { emitEvent: false });

      this.applyShippingAddressState(useSameShippingAddress);
      if (useSameShippingAddress) {
        this.copyBillingAddressToShipping();
      }
    } catch (error) {
      this.saveErrorMessage.set(error instanceof Error ? error.message : 'No se pudo cargar la información del cliente.');
      await this.router.navigate(['/clientes']);
    } finally {
      this.isLoading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.saveErrorMessage.set('');

    let savedClientId: string | null = null;

    try {
      const payload = this.buildPayload();
      const savedClient = this.isEditMode() && this.clientId()
        ? await firstValueFrom(this.clientService.updateClient(this.clientId()!, payload))
        : await firstValueFrom(this.clientService.createClient(payload));

      savedClientId = savedClient.id;
    } catch (error) {
      console.error('[Clients] save failed', error);
      this.saveErrorMessage.set(error instanceof Error ? error.message : 'No fue posible guardar el cliente.');
    } finally {
      this.isSaving.set(false);
    }

    if (savedClientId) {
      await this.router.navigate(['/clientes', savedClientId]);
    }
  }

  isFieldInvalid(fieldPath: string): boolean {
    const field = this.clientForm.get(fieldPath);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  getTypeLabel(type: ClientType): string {
    switch (type) {
      case ClientType.Clinica:
        return 'Clínica';
      case ClientType.Hospital:
        return 'Hospital';
      case ClientType.Medico:
        return 'Médico';
      case ClientType.Veterinario:
        return 'Veterinaria';
      case ClientType.Institucion:
        return 'Institución';
      case ClientType.Distribuidor:
        return 'Distribuidor';
      case ClientType.Empresa:
        return 'Empresa';
      case ClientType.Otro:
        return 'Otro';
      default:
        return 'Otro';
    }
  }

  private createAddressGroup(): FormGroup {
    return this.fb.group({
      street: ['', [Validators.required, Validators.maxLength(120)]],
      exteriorNumber: ['', [Validators.required, Validators.maxLength(20)]],
      interiorNumber: ['', Validators.maxLength(20)],
      neighborhood: ['', [Validators.required, Validators.maxLength(100)]],
      postalCode: ['', [Validators.required, Validators.maxLength(10)]],
      city: ['', [Validators.required, Validators.maxLength(100)]],
      state: ['', [Validators.required, Validators.maxLength(100)]],
      country: ['México', [Validators.required, Validators.maxLength(100)]],
    });
  }

  private setupShippingAddressBehavior(): void {
    this.clientForm.get('useSameShippingAddress')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        const useSame = !!value;
        this.applyShippingAddressState(useSame);
        if (useSame) {
          this.copyBillingAddressToShipping();
        }
      });

    this.billingAddressGroup.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.clientForm.get('useSameShippingAddress')?.value) {
          this.copyBillingAddressToShipping();
        }
      });
  }

  private applyShippingAddressState(useSame: boolean): void {
    if (useSame) {
      this.shippingAddressGroup.disable({ emitEvent: false });
      return;
    }

    this.shippingAddressGroup.enable({ emitEvent: false });
  }

  private copyBillingAddressToShipping(): void {
    this.shippingAddressGroup.patchValue(this.billingAddressGroup.getRawValue(), { emitEvent: false });
  }

  private buildPayload() {
    const raw = this.clientForm.getRawValue();
    const billingAddressDetails = this.normalizeAddressDetails(raw.billingAddress);
    const useSameShippingAddress = !!raw.useSameShippingAddress;
    const shippingAddressDetails = useSameShippingAddress
      ? billingAddressDetails
      : this.normalizeAddressDetails(raw.shippingAddress);

    return {
      clientType: raw.clientType,
      status: raw.status,
      businessName: raw.businessName,
      tradeName: raw.tradeName,
      rfc: raw.rfc,
      contactName: raw.contactName,
      contactPosition: raw.contactPosition,
      email: raw.email,
      billingEmail: raw.billingEmail,
      phone: raw.phone,
      address: this.formatAddressLine(billingAddressDetails),
      shippingAddress: useSameShippingAddress ? this.formatAddressLine(billingAddressDetails) : this.formatAddressLine(shippingAddressDetails),
      city: billingAddressDetails.city,
      state: billingAddressDetails.state,
      country: billingAddressDetails.country,
      billingAddressDetails,
      shippingAddressDetails,
      useBillingAddressForShipping: useSameShippingAddress,
      notes: raw.notes,
    };
  }

  private normalizeAddressDetails(details: any): ClientAddressDetails {
    return {
      street: String(details?.street ?? '').trim(),
      exteriorNumber: String(details?.exteriorNumber ?? '').trim(),
      interiorNumber: String(details?.interiorNumber ?? '').trim(),
      neighborhood: String(details?.neighborhood ?? '').trim(),
      postalCode: String(details?.postalCode ?? '').trim(),
      city: String(details?.city ?? '').trim(),
      state: String(details?.state ?? '').trim(),
      country: String(details?.country ?? '').trim() || 'México',
    };
  }

  private formatAddressLine(details: ClientAddressDetails): string {
    return [
      [
        details.street,
        details.exteriorNumber ? `#${details.exteriorNumber}` : '',
        details.interiorNumber ? `Int. ${details.interiorNumber}` : '',
      ].filter(Boolean).join(' '),
      details.neighborhood ? `Col. ${details.neighborhood}` : '',
      details.postalCode ? `C.P. ${details.postalCode}` : '',
    ].filter(Boolean).join(', ');
  }

  private emptyAddressDetails(): ClientAddressDetails {
    return {
      street: '',
      exteriorNumber: '',
      interiorNumber: '',
      neighborhood: '',
      postalCode: '',
      city: '',
      state: '',
      country: 'México',
    };
  }
}

