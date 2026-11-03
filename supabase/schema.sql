-- ============================================================================
-- ArqStudio 3D — esquema de Supabase (tabla `proyectos` + seguridad por fila)
--
-- CÓMO USARLO
--   1. Panel de Supabase → SQL Editor → New query.
--   2. Pega todo este archivo y pulsa Run.
--   3. En la app: Dashboard → «Reintentar» (o reinicia la app).
--
-- Es idempotente: puedes ejecutarlo varias veces sin romper nada.
-- No toca ninguna otra tabla de tu proyecto.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabla de proyectos
-- ---------------------------------------------------------------------------
create table if not exists public.proyectos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  nombre       text not null,
  modo         text not null default '3D' check (modo in ('2D', '3D')),
  -- Índice del diseño base que carga el editor (ver models/ProjectDesign.ts)
  diseno_index smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Por si la tabla ya existía sin la restricción de `modo`.
alter table public.proyectos
  drop constraint if exists proyectos_modo_check;
alter table public.proyectos
  add constraint proyectos_modo_check check (modo in ('2D', '3D'));

create index if not exists proyectos_user_id_updated_at_idx
  on public.proyectos (user_id, updated_at desc);

-- --------------------------------------------------------------------------- 
-- 2. Seguridad por fila (RLS): cada usuario solo ve y toca lo suyo.
--    Sin esto, Supabase bloquea todas las consultas del rol `anon`.
-- --------------------------------------------------------------------------- 
alter table public.proyectos enable row level security;

-- Fase 1 (refuerzo): el rol `anon` (sin sesión) NO tiene ningún permiso sobre
-- la tabla; las políticas de abajo solo dejan pasar a `authenticated`, y además
-- exigen que auth.uid() = user_id. Verifica el comportamiento con
-- `supabase/rls-tests.sql` (ejecutar en el SQL Editor tras este archivo).
revoke all on public.proyectos from anon;
grant select, insert, update, delete on public.proyectos to authenticated;

drop policy if exists "proyectos: ver los propios" on public.proyectos;
create policy "proyectos: ver los propios"
  on public.proyectos for select
  using (auth.uid() = user_id);

drop policy if exists "proyectos: crear los propios" on public.proyectos;
create policy "proyectos: crear los propios"
  on public.proyectos for insert
  with check (auth.uid() = user_id);

drop policy if exists "proyectos: actualizar los propios" on public.proyectos;
create policy "proyectos: actualizar los propios"
  on public.proyectos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "proyectos: borrar los propios" on public.proyectos;
create policy "proyectos: borrar los propios"
  on public.proyectos for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Comprobación
-- ---------------------------------------------------------------------------
-- Debe devolver 1 fila con relrowsecurity = true y 4 políticas.
select relname as tabla, relrowsecurity as rls_activo
from pg_class where relname = 'proyectos';

select policyname as politica, cmd as operacion
from pg_policies where tablename = 'proyectos';

-- ---------------------------------------------------------------------------
-- 4. OPCIONAL — guardar la geometría completa de cada proyecto en la nube
--    (hoy el editor parte del diseño base `diseno_index`).
-- ---------------------------------------------------------------------------
-- alter table public.proyectos add column if not exists datos jsonb;
