// app.config.ts — Configuración principal de la aplicación
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withViewTransitions()),
    provideHttpClient(),
    // TODO (Supabase): agregar aquí el provider del cliente Supabase
    // provideSupabaseClient(environment.supabaseUrl, environment.supabaseKey)
  ]
};
