export enum DocumentType {
  UserManual = 'user_manual',
  TechnicalSheet = 'technical_sheet',
  Certificate = 'certificate',
  Warranty = 'warranty',
  MaintenanceGuide = 'maintenance_guide',
  ServiceReport = 'service_report',
  ProductImage = 'product_image',
  Other = 'other',
}

export enum DocumentStatus {
  Available = 'available',
  Pending = 'pending',
  Archived = 'archived',
}

export enum RelatedEntityType {
  Product = 'product',
  Equipment = 'equipment',
  Client = 'client',
  Ticket = 'ticket',
  General = 'general',
}

export interface SystemDocument {
  id: string;
  title: string;
  documentType: DocumentType;
  status: DocumentStatus;
  relatedEntityType: RelatedEntityType;
  relatedEntityId?: string;
  relatedEntityName?: string;
  productId?: string;
  productNameSnapshot?: string;
  equipmentSerialNumber?: string;
  fileName: string;
  fileExtension: string;
  fileSizeLabel: string;
  mockFileUrl?: string;
  uploadedBy: string;
  uploadedAt: string;
  updatedAt: string;
  notes?: string;
}

export interface DocumentFilters {
  search?: string;
  documentType?: DocumentType | '';
  status?: DocumentStatus | '';
  productId?: string;
}

export interface DocumentCreatePayload {
  title: string;
  documentType: DocumentType;
  relatedEntityType: RelatedEntityType;
  productId?: string;
  equipmentSerialNumber?: string;
  fileName: string;
  notes?: string;
  uploadedBy?: string;
  status?: DocumentStatus;
}
