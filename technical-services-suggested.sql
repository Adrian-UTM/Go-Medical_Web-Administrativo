-- SQL sugerido para habilitar agenda y rutas de servicio técnico.
-- No fue ejecutado por Codex. Revisar, adaptar y ejecutar manualmente si el equipo decide habilitar esta estructura.

-- 1) Programación directa de tickets.
alter table public.service_tickets
  add column if not exists scheduled_at timestamp with time zone;

-- Evita asignar el mismo técnico a dos servicios en el mismo horario cuando exista fecha/hora.
create unique index if not exists service_tickets_technician_schedule_uq
  on public.service_tickets (assigned_technician_id, scheduled_at)
  where assigned_technician_id is not null
    and scheduled_at is not null
    and status not in ('closed', 'cancelled');

-- 2) Dirección específica de atención, si se requiere seleccionar una dirección distinta a la fiscal/envío del cliente.
alter table public.service_tickets
  add column if not exists service_address_id uuid references public.client_addresses(id);

-- 3) Rutas externas. Mantiene ciudad+estado como agrupación operativa predeterminada.
create table if not exists public.technical_service_routes (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  state text not null,
  status text not null default 'pending'
    check (status in ('pending', 'authorized', 'scheduled', 'completed', 'cancelled')),
  scheduled_at timestamp with time zone,
  assigned_technician_id uuid references public.profiles(id),
  authorized_by uuid references public.profiles(id),
  authorized_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.technical_service_route_items (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.technical_service_routes(id) on delete cascade,
  service_ticket_id uuid not null references public.service_tickets(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  unique (route_id, service_ticket_id)
);

create index if not exists technical_service_routes_location_idx
  on public.technical_service_routes (state, city, status);

create index if not exists technical_service_route_items_ticket_idx
  on public.technical_service_route_items (service_ticket_id);
