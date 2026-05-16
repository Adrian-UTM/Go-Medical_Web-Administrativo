// models/auth.model.ts
// Modelos de autenticación y roles

export enum UserRole {
  Admin    = 'admin',
  Manager  = 'manager',
  Sales    = 'sales',
  Tech     = 'tech',
  Viewer   = 'viewer',
}

export interface User {
  id: string;           // uuid → auth.users.id
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthSession {
  user: User;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}
