-- ============================================================================
-- ArqStudio 3D — pruebas de las políticas RLS (Fase 1)
--
-- PARA MANUEL (yo no lo ejecuto: requiere tu panel de Supabase)
--   1. Ejecuta primero supabase/schema.sql en el SQL Editor (si no lo hiciste).
--   2. Crea DOS usuarios de prueba en Authentication → Users con correo y
--      contraseña (p. ej. rls-a@test.com y rls-b@test.com) y anota sus UUID
--      (aparecen en la lista de usuarios).
--   3. Sustituye abajo LOS DOS UUID en los bloques :user_a / :user_b.
--   4. Ejecuta cada bloque (BEGIN … COMMIT) por separado y comprueba que la
--      salida es la indicada en cada comentario.
--
-- Qué garantiza:
--   * un usuario solo VE sus filas (nunca las de otro),
--   * un usuario solo INSERTA filas con su propio user_id,
--   * un usuario NO actualiza NI borra filas ajenas (0 filas afectadas),
--   * el rol anon (sin sesión) NO puede leer nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- BLOQUE 1 — Sembrar datos de prueba (una sola vez)
--   Sustituye los UUID. Deja 2 filas de A y 1 de B.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims to json_build_object('sub', 'UUID-AQUI-USER_A', 'role', 'authenticated')::text;

insert into public.proyectos (user_id, nombre, modo)
values ('UUID-AQUI-USER_A', 'RLS prueba de A', '3D'),
       ('UUID-AQUI-USER_A', 'RLS segunda de A', '2D');

commit;

begin;
set local role authenticated;
set local request.jwt.claims to json_build_object('sub', 'UUID-AQUI-USER_B', 'role', 'authenticated')::text;

insert into public.proyectos (user_id, nombre, modo)
values ('UUID-AQUI-USER_B', 'RLS prueba de B', '3D');

commit;

-- ---------------------------------------------------------------------------
-- BLOQUE 2 — A solo ve SUS proyectos (esperado: 2 filas, solo «RLS prueba…»)
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims to json_build_object('sub', 'UUID-AQUI-USER_A', 'role', 'authenticated')::text;

select nombre, user_id from public.proyectos order by nombre;
-- ESPERADO: exactamente 2 filas, ambas con el user_id de A.

commit;

-- ---------------------------------------------------------------------------
-- BLOQUE 3 — B NO ve los proyectos de A (esperado: 1 fila, solo la de B)
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims to json_build_object('sub', 'UUID-AQUI-USER_B', 'role', 'authenticated')::text;

select nombre, user_id from public.proyectos order by nombre;
-- ESPERADO: 1 fila («RLS prueba de B»). NO aparece NADA de A.

commit;

-- ---------------------------------------------------------------------------
-- BLOQUE 4 — B NO puede actualizar filas de A (esperado: UPDATE 0)
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims to json_build_object('sub', 'UUID-AQUI-USER_B', 'role', 'authenticated')::text;

update public.proyectos set nombre = 'HACKEADO' where nombre = 'RLS prueba de A';
-- ESPERADO: UPDATE 0

commit;

-- ---------------------------------------------------------------------------
-- BLOQUE 5 — B NO puede borrar filas de A (esperado: DELETE 0)
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims to json_build_object('sub', 'UUID-AQUI-USER_B', 'role', 'authenticated')::text;

delete from public.proyectos where nombre = 'RLS prueba de A';
-- ESPERADO: DELETE 0

commit;

-- ---------------------------------------------------------------------------
-- BLOQUE 6 — Nadie puede INSERTAR proyectos en nombre de otro
--             (esperado: ERROR por la política «proyectos: crear los propios»)
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims to json_build_object('sub', 'UUID-AQUI-USER_B', 'role', 'authenticated')::text;

insert into public.proyectos (user_id, nombre, modo)
values ('UUID-AQUI-USER_A', 'Intento ajeno', '3D');
-- ESPERADO: ERROR new row violates row-level security policy

commit;
rollback;

-- ---------------------------------------------------------------------------
-- BLOQUE 7 — rol anon (sin sesión) no lee NADA (esperado: 0 filas)
-- ---------------------------------------------------------------------------
begin;
set local role anon;
set local request.jwt.claims to '';

select count(*) as filas_visibles_sin_sesion from public.proyectos;
-- ESPERADO: filas_visibles_sin_sesion = 0

commit;

-- ---------------------------------------------------------------------------
-- LIMPIEZA (ejecuta con una sesión de servicio o como postgres con
--authenticated simulado si quieres borrar los datos de prueba):
--   delete from public.proyectos where nombre like 'RLS prueba%';
-- ---------------------------------------------------------------------------

-- Comprobación final de configuración:
select relname as tabla, relrowsecurity as rls_activo
from pg_class where relname = 'proyectos';
select policyname as politica, cmd as operacion
from pg_policies where tablename = 'proyectos';
-- ESPERADO: rls_activo = true y 4 políticas (select/insert/update/delete).
