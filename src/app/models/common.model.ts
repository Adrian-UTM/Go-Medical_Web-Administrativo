// models/common.model.ts
// Tipos comunes reutilizables en toda la aplicación

/** Respuesta paginada genérica — alineada a la estructura que retornará Supabase */
export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Respuesta de API genérica */
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

/** Opción para selects y filtros */
export interface SelectOption<T = string> {
  value: T;
  label: string;
}

/** Filtros de paginación comunes */
export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/** Rango de fechas para filtros */
export interface DateRange {
  from: string; // ISO 8601
  to: string;
}

/** Auditoría automática — columnas comunes en PostgreSQL */
export interface AuditFields {
  created_at: string;  // timestamptz
  updated_at: string;  // timestamptz
  created_by?: string; // uuid → users.id
}
