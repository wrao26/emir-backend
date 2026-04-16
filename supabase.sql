-- ══════════════════════════════════════════════════
-- EMIR.COM — Schema v3 (favoritos + tracking + relatórios)
-- Cola no Supabase → SQL Editor → Run
-- ══════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- ── CLIENTES ──────────────────────────────────────
create table if not exists clientes (
  id            uuid primary key default uuid_generate_v4(),
  nome          text not null,
  email         text unique not null,
  telefone      text,
  password_hash text not null,
  ativo         boolean default true,
  criado_em     timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- ── MORADAS ───────────────────────────────────────
create table if not exists moradas (
  id          serial primary key,
  cliente_id  uuid references clientes(id) on delete cascade,
  nome        text not null,
  telefone    text not null,
  provincia   text not null,
  municipio   text,
  morada      text not null,
  predefinida boolean default false,
  criado_em   timestamptz default now()
);

-- ── ADMINS ────────────────────────────────────────
create table if not exists admins (
  id            serial primary key,
  email         text unique not null,
  password_hash text not null,
  nome          text,
  criado_em     timestamptz default now()
);

-- ── PRODUTOS ──────────────────────────────────────
create table if not exists produtos (
  id          serial primary key,
  nome        text not null,
  categoria   text not null default 'Outros',
  loja        text not null,
  loja_url    text,
  preco_eur   numeric(10,2) not null,
  imagem_url  text,
  descricao   text,
  ativo       boolean default true,
  criado_em   timestamptz default now()
);

-- ── ENCOMENDAS ────────────────────────────────────
create table if not exists encomendas (
  id             serial primary key,
  numero         text unique not null,
  cliente_id     uuid references clientes(id) on delete set null,
  produto_url    text not null,
  produto_nome   text,
  produto_img    text,
  quantidade     int default 1,
  preco_eur      numeric(10,2),
  cambio_usado   numeric(10,2),
  base_kz        numeric(12,2),
  taxa_kz        numeric(12,2),
  envio_kz       numeric(12,2) default 5000,
  total_kz       numeric(12,2),
  metodo_pag     text,
  estado         text default 'Pendente',
  tracking_code  text,
  -- entrega
  entrega_nome   text not null,
  entrega_tel    text not null,
  entrega_prov   text not null,
  entrega_mun    text,
  entrega_morada text not null,
  notas          text,
  criado_em      timestamptz default now(),
  atualizado_em  timestamptz default now()
);
-- Estados: Pendente | Confirmado | Pago | Em Processamento | Em Trânsito | Entregue | Cancelado

-- ── HISTÓRICO DE ESTADOS ──────────────────────────
create table if not exists estados_historico (
  id           serial primary key,
  encomenda_id int references encomendas(id) on delete cascade,
  estado       text not null,
  nota         text,
  criado_em    timestamptz default now()
);

-- ── FAVORITOS ─────────────────────────────────────
create table if not exists favoritos (
  id           serial primary key,
  cliente_id   uuid references clientes(id) on delete cascade,
  produto_id   int references produtos(id) on delete cascade,
  produto_url  text,
  produto_nome text,
  produto_img  text,
  preco_eur    numeric(10,2),
  loja         text,
  criado_em    timestamptz default now(),
  unique(cliente_id, produto_id)
);

-- ── TRIGGERS ──────────────────────────────────────
create or replace function set_atualizado_em()
returns trigger as $$
begin new.atualizado_em = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_encomendas_upd on encomendas;
create trigger trg_encomendas_upd before update on encomendas
  for each row execute function set_atualizado_em();

drop trigger if exists trg_clientes_upd on clientes;
create trigger trg_clientes_upd before update on clientes
  for each row execute function set_atualizado_em();

create or replace function log_estado_encomenda()
returns trigger as $$
begin
  if (TG_OP = 'INSERT') or (OLD.estado is distinct from NEW.estado) then
    insert into estados_historico (encomenda_id, estado)
    values (NEW.id, NEW.estado);
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_log_estado on encomendas;
create trigger trg_log_estado after insert or update on encomendas
  for each row execute function log_estado_encomenda();

-- ── ADMIN INICIAL (password: Emir2026!) ──────────
insert into admins (email, password_hash, nome) values (
  'admin@emir.com',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'Emir Admin'
) on conflict (email) do nothing;

-- ── PRODUTOS DE EXEMPLO ───────────────────────────
insert into produtos (nome, categoria, loja, preco_eur, imagem_url) values
  ('Nike Air Max 270',        'Calçado',    'Nike.com',         129, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=420&q=85&fit=crop'),
  ('iPhone 15 Pro',           'Tecnologia', 'Apple.com',        999, 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&h=420&q=85&fit=crop'),
  ('Vestido Zara Premium',    'Moda',       'Zara.com',          79, 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600&h=420&q=85&fit=crop'),
  ('PS5 DualSense',           'Gaming',     'PlayStation.com',   75, 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=600&h=420&q=85&fit=crop'),
  ('Chanel Chance EDP 100ml', 'Beleza',     'Chanel.com',       110, 'https://images.unsplash.com/photo-1541643600914-78b084683702?w=600&h=420&q=85&fit=crop'),
  ('Samsung Galaxy Watch 6',  'Tecnologia', 'Samsung.com',      249, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=420&q=85&fit=crop')
on conflict do nothing;
