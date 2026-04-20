-- ============================================================
--  FIDELIZA — Schema PostgreSQL
--  Ejecutar: psql -U postgres -d fideliza -f schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Clientes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        VARCHAR(100) NOT NULL,
  telefono      VARCHAR(30)  NOT NULL UNIQUE,
  email         VARCHAR(150),
  qr_origen     VARCHAR(100),          -- de qué QR vino
  local         VARCHAR(20)  DEFAULT 'mujer'   -- mujer | hombre
  puntos        INTEGER DEFAULT 0,
  nivel         VARCHAR(20)  DEFAULT 'bronce'  -- bronce | plata | oro | vip
                CHECK (nivel IN ('bronce','plata','oro','vip')),
  segmento      VARCHAR(20)  DEFAULT 'nuevo'   -- nuevo | frecuente | vip | inactivo
                CHECK (segmento IN ('nuevo','frecuente','vip','inactivo')),
  es_vip        BOOLEAN DEFAULT FALSE,
  total_gastado NUMERIC(12,2) DEFAULT 0,
  ultima_compra TIMESTAMP,
  notas         TEXT,
  creado_en     TIMESTAMP DEFAULT NOW(),
  actualizado_en TIMESTAMP DEFAULT NOW()
);

-- ─── Compras ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compras (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id    UUID REFERENCES clientes(id) ON DELETE CASCADE,
  monto         NUMERIC(12,2) NOT NULL,
  descripcion   TEXT,
  origen        VARCHAR(50) DEFAULT 'manual',  -- manual | tiendanube | shopify
  orden_externa VARCHAR(100),                   -- ID de la tienda online
  puntos_ganados INTEGER DEFAULT 0,
  creado_en     TIMESTAMP DEFAULT NOW()
);

-- ─── Canjes de recompensas ────────────────────────────────────
CREATE TABLE IF NOT EXISTS canjes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id    UUID REFERENCES clientes(id) ON DELETE CASCADE,
  tipo          VARCHAR(50) NOT NULL,           -- descuento | envio_gratis | regalo
  descripcion   TEXT,
  puntos_usados INTEGER DEFAULT 0,
  codigo        VARCHAR(30) UNIQUE,
  usado         BOOLEAN DEFAULT FALSE,
  usado_en      TIMESTAMP,
  creado_en     TIMESTAMP DEFAULT NOW()
);

-- ─── Mensajes WhatsApp (log) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS mensajes_whatsapp (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id    UUID REFERENCES clientes(id) ON DELETE SET NULL,
  telefono      VARCHAR(30) NOT NULL,
  tipo          VARCHAR(50),    -- post_compra | cross_sell | reactivacion | vip | manual | campaña
  mensaje       TEXT NOT NULL,
  estado        VARCHAR(20) DEFAULT 'enviado'  -- enviado | fallido | simulado
                CHECK (estado IN ('enviado','fallido','simulado')),
  twilio_sid    VARCHAR(100),   -- ID de Twilio cuando es real
  creado_en     TIMESTAMP DEFAULT NOW()
);

-- ─── Campañas ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campanas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        VARCHAR(100) NOT NULL,
  mensaje       TEXT NOT NULL,
  segmento      VARCHAR(30) NOT NULL,
  local         VARCHAR(20) DEFAULT 'todos',  -- todos | mujer | hombre
  estado        VARCHAR(20) DEFAULT 'borrador'  -- borrador | enviada
                CHECK (estado IN ('borrador','enviada')),
  total_enviados INTEGER DEFAULT 0,
  creado_en     TIMESTAMP DEFAULT NOW(),
  enviado_en    TIMESTAMP
);

-- ─── Administradores ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  rol           VARCHAR(20) DEFAULT 'admin',
  creado_en     TIMESTAMP DEFAULT NOW()
);

-- ─── Índices para performance ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clientes_telefono    ON clientes(telefono);
CREATE INDEX IF NOT EXISTS idx_clientes_segmento    ON clientes(segmento);
CREATE INDEX IF NOT EXISTS idx_clientes_nivel       ON clientes(nivel);
CREATE INDEX IF NOT EXISTS idx_compras_cliente      ON compras(cliente_id);
CREATE INDEX IF NOT EXISTS idx_compras_fecha        ON compras(creado_en);
CREATE INDEX IF NOT EXISTS idx_mensajes_cliente     ON mensajes_whatsapp(cliente_id);

-- ─── Función: actualizar timestamp ──────────────────────────
CREATE OR REPLACE FUNCTION actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_clientes_updated
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();
