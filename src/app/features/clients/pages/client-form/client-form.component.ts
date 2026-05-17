import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import { ClientSupabaseService } from '../../services/client.supabase.service';
import { ClientType, ClientStatus } from '../../../../core/models/client.model';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'bc-client-form',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    RouterLink, 
    PageHeaderComponent, 
    LoaderComponent,
    CustomSelectComponent
  ],
  templateUrl: './client-form.component.html',
  styleUrls: ['./client-form.component.css']
})
export class ClientFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private clientService = inject(ClientSupabaseService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  // Estado
  isLoading = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  isEditMode = signal<boolean>(false);
  clientId = signal<string | null>(null);

  // Datos
  clientTypes = Object.values(ClientType);
  clientStatuses = Object.values(ClientStatus);
  
  typeOptions = this.clientTypes.map(t => ({ value: t, label: this.getTypeLabel(t) }));
  statusOptions = [
    { value: 'active', label: 'Activo - Puede facturar' },
    { value: 'inactive', label: 'Inactivo - Bloqueado' }
  ];

  // Formulario
  clientForm: FormGroup = this.fb.group({
    clientType: [ClientType.Clinica, [Validators.required]],
    status: [ClientStatus.Active, [Validators.required]],
    businessName: ['', [Validators.required, Validators.maxLength(100)]],
    tradeName: ['', [Validators.maxLength(100)]],
    rfc: ['', [Validators.required, Validators.maxLength(13)]],
    contactName: ['', [Validators.required, Validators.maxLength(100)]],
    contactPosition: ['', [Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
    billingEmail: ['', [Validators.email, Validators.maxLength(100)]],
    phone: ['', [Validators.required, Validators.maxLength(20)]],
    address: ['', [Validators.required, Validators.maxLength(200)]],
    shippingAddress: ['', [Validators.maxLength(200)]],
    city: ['', [Validators.required, Validators.maxLength(100)]],
    state: ['', [Validators.required, Validators.maxLength(100)]],
    notes: ['', [Validators.maxLength(500)]]
  });

  // Título dinámico
  get pageTitle(): string {
    return this.isEditMode() ? 'Editar Cliente' : 'Nuevo Cliente';
  }
  
  get breadcrumbs() {
    return [
      { label: 'Inicio', url: '/dashboard' },
      { label: 'Clientes', url: '/clientes' },
      { label: this.pageTitle }
    ];
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode.set(true);
      this.clientId.set(id);
      await this.loadClient(id);
    }
  }

  async loadClient(id: string) {
    this.isLoading.set(true);
    try {
      const client = await firstValueFrom(this.clientService.getClientById(id));
      if (client) {
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
          address: client.address,
          shippingAddress: client.shippingAddress || client.address,
          city: client.city,
          state: client.state,
          notes: client.notes
        });
      } else {
        this.router.navigate(['/clientes']);
      }
    } catch (err) {
      console.error('Error loading client:', err);
      this.router.navigate(['/clientes']);
    } finally {
      this.isLoading.set(false);
    }
  }

  async onSubmit() {
    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const formData = this.clientForm.value;

    try {
      if (this.isEditMode() && this.clientId()) {
        await firstValueFrom(this.clientService.updateClient(this.clientId()!, formData));
      } else {
        await firstValueFrom(this.clientService.createClient(formData));
      }
      this.router.navigate(['/clientes']);
    } catch (error) {
      console.error('Error al guardar cliente', error);
      // Aquí se podría mostrar un toast/notificación de error
    } finally {
      this.isSaving.set(false);
    }
  }

  // Helper para validación
  isFieldInvalid(fieldName: string): boolean {
    const field = this.clientForm.get(fieldName);
    return field ? field.invalid && (field.dirty || field.touched) : false;
  }
  
  getTypeLabel(type: ClientType): string {
    switch (type) {
      case ClientType.Clinica: return 'Clínica';
      case ClientType.Medico: return 'Médico';
      case ClientType.Veterinario: return 'Veterinario';
      case ClientType.Institucion: return 'Institución';
      default: return type;
    }
  }
}
