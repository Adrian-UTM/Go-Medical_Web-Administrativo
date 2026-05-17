import { Injectable, signal, computed } from '@angular/core';
import { Client, ClientType, ClientStatus } from '../../../core/models/client.model';

const MOCK_CLIENTS: Client[] = [];

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
