-- ============================================================================
-- ArqStudio 3D — Esquema de Colaboración en Tiempo Real (Salas, Miembros, Solicitudes)
-- ============================================================================

-- 1. Tabla de Salas de Colaboración (`rooms`)
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT UNIQUE NOT NULL,
  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL DEFAULT 'Proyecto Colaborativo',
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL DEFAULT 'Anfitrión',
  mode TEXT NOT NULL DEFAULT '3D' CHECK (mode IN ('2D', '3D')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rooms_room_code_idx ON public.rooms (room_code);
CREATE INDEX IF NOT EXISTS rooms_project_id_idx ON public.rooms (project_id);

-- 2. Tabla de Miembros y Solicitudes de Sala (`room_members`)
CREATE TABLE IF NOT EXISTS public.room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL REFERENCES public.rooms(room_code) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'kicked')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (room_code, user_id)
);

CREATE INDEX IF NOT EXISTS room_members_room_code_idx ON public.room_members (room_code);

-- 3. Tabla de Mensajes del Chat de Sala (`room_messages`)
CREATE TABLE IF NOT EXISTS public.room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabla de Registro de Cambios en Vivo (`room_activities`)
CREATE TABLE IF NOT EXISTS public.room_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  action_text TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'scene',
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla heredada para enlaces compartidos y notas (compatibilidad)
CREATE TABLE IF NOT EXISTS public.enlaces_compartidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  rol TEXT CHECK (rol IN ('editor', 'visualizador')) NOT NULL DEFAULT 'visualizador',
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expira_en TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.notas_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id TEXT NOT NULL,
  autor_email TEXT NOT NULL,
  rol TEXT NOT NULL,
  posicion_x FLOAT DEFAULT 0,
  posicion_y FLOAT DEFAULT 0,
  posicion_z FLOAT DEFAULT 0,
  comentario TEXT NOT NULL,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

);