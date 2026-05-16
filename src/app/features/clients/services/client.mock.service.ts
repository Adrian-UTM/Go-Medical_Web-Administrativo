import { Injectable, signal, computed } from '@angular/core';
import { Client, ClientType, ClientStatus } from '../../../core/models/client.model';

const MOCK_CLIENTS: Client[] = [
  {
    id: 'cli-001',
    clientType: ClientType.Clinica,
    status: ClientStatus.Active,
    businessName: 'Unidad de Diagnóstico Avanzado S.A. de C.V.',
    tradeName: 'DiagnoMed',
    rfc: 'UDA901231MX5',
    contactName: 'Dra. María Fernández',
    contactPosition: 'Directora Médica',
    email: 'mfernandez@diagnomed.mx',
    billingEmail: 'facturacion@diagnomed.mx',
    phone: '9991234567',
    address: 'Calle 60 #123, Centro',
    city: 'Mérida',
    state: 'Yucatán',
    notes: 'Cliente preferencial para compra de consumibles.',
    createdAt: '2023-11-15T10:00:00Z',
    updatedAt: '2024-01-20T14:30:00Z'
  },
  {
    id: 'cli-002',
    clientType: ClientType.Medico,
    status: ClientStatus.Active,
    businessName: 'Carlos Ruiz Altaba',
    tradeName: 'Consultorio Dr. Ruiz',
    rfc: 'RUAC800412HDF',
    contactName: 'Dr. Carlos Ruiz',
    email: 'dr.ruiz@medicos.com',
    phone: '9999876543',
    address: 'Av. Colón 450, Consultorio 12',
    city: 'Mérida',
    state: 'Yucatán',
    notes: 'Interesado en renovación de equipo portátil el próximo año.',
    createdAt: '2024-02-10T09:15:00Z',
    updatedAt: '2024-02-10T09:15:00Z'
  },
  {
    id: 'cli-003',
    clientType: ClientType.Veterinario,
    status: ClientStatus.Active,
    businessName: 'Servicios Veterinarios Peninsulares SC',
    tradeName: 'VetCare Mérida',
    rfc: 'SVP100228K9A',
    contactName: 'MVZ. Luis Andrade',
    contactPosition: 'Dueño',
    email: 'contacto@vetcare.mx',
    billingEmail: 'admin@vetcare.mx',
    phone: '9995551234',
    address: 'Calle 32 #200 x 45, Col. San Ramón Norte',
    shippingAddress: 'Bodega 3, Av. Canek',
    city: 'Mérida',
    state: 'Yucatán',
    createdAt: '2024-01-05T11:20:00Z',
    updatedAt: '2024-03-01T08:45:00Z'
  },
  {
    id: 'cli-004',
    clientType: ClientType.Institucion,
    status: ClientStatus.Inactive,
    businessName: 'Hospital Civil de Yucatán',
    tradeName: 'HCY',
    rfc: 'HCY600101XYZ',
    contactName: 'Ing. Pedro Salas',
    contactPosition: 'Jefe de Biomédica',
    email: 'psalas@hcy.gob.mx',
    phone: '9998000000',
    address: 'Av. Itzáes S/N',
    city: 'Mérida',
    state: 'Yucatán',
    notes: 'Cuenta suspendida por cambio de administración.',
    createdAt: '2022-05-18T16:00:00Z',
    updatedAt: '2023-12-01T10:00:00Z'
  }
];

@Injectable({
  providedIn: 'root'
})
export class ClientMockService {
  private _clients = signal<Client[]>([...MOCK_CLIENTS]);
  
  // Señales públicas calculadas útiles (como totales)
  public readonly clients = this._clients.asReadonly();
  public readonly totalClients = computed(() => this._clients().length);
  public readonly activeClients = computed(() => this._clients().filter(c => c.status === ClientStatus.Active).length);

  constructor() { }

  // Simula un retardo de red
  private delay<T>(data: T, ms: number = 600): Promise<T> {
    return new Promise(resolve => setTimeout(() => resolve(data), ms));
  }

  async getClients(): Promise<Client[]> {
    return this.delay(this._clients());
  }

  async getClientById(id: string): Promise<Client | undefined> {
    const client = this._clients().find(c => c.id === id);
    return this.delay(client ? { ...client } : undefined);
  }

  async createClient(clientData: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Promise<Client> {
    const newClient: Client = {
      ...clientData,
      id: `cli-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this._clients.update(clients => [newClient, ...clients]);
    return this.delay(newClient);
  }

  async updateClient(id: string, clientData: Partial<Client>): Promise<Client | undefined> {
    const currentClients = this._clients();
    const index = currentClients.findIndex(c => c.id === id);
    
    if (index === -1) return this.delay(undefined);

    const updatedClient: Client = {
      ...currentClients[index],
      ...clientData,
      updatedAt: new Date().toISOString()
    };
    
    const newClients = [...currentClients];
    newClients[index] = updatedClient;
    this._clients.set(newClients);
    
    return this.delay(updatedClient);
  }

  async deleteClient(id: string): Promise<boolean> {
    const currentLength = this._clients().length;
    this._clients.update(clients => clients.filter(c => c.id !== id));
    
    const success = this._clients().length < currentLength;
    return this.delay(success);
  }
}
