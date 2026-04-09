-- ══════════════════════════════════════════════
-- EMIR.COM — Schema Supabase
-- Copia este ficheiro inteiro e cola no
-- Supabase → SQL Editor → Run
-- ══════════════════════════════════════════════

-- ── PRODUTOS ──────────────────────────────────
create table if not exists produtos (
  id          serial primary key,
  nome        text not null,
  categoria   text not null,
  loja        text not null,
  preco_eur   numeric(10,2) not null,
  imagem_url  text,
  ativo       boolean default true,
  criado_em   timestamptz default now()
);

-- ── ENCOMENDAS ────────────────────────────────
create table if not exists encomendas (
  id              serial primary key,
  numero          text unique not null,   -- EMIR-2026-001
  produto_url     text not null,
  produto_nome    text,
  quantidade      int default 1,
  preco_eur       numeric(10,2),
  taxa_kz         numeric(12,2),
  envio_kz        numeric(12,2) default 5000,
  total_kz        numeric(12,2),
  metodo_pag      text,                   -- Multicaixa / TRF / WhatsApp
  estado          text default 'Pendente', -- Pendente | Confirmado | Em Trânsito | Entregue | Cancelado
  -- cliente
  cliente_nome    text not null,
  cliente_tel     text not null,
  cliente_prov    text not null,
  cliente_mun     text,
  cliente_morada  text not null,
  notas           text,
  -- meta
  criado_em       timestamptz default now(),
  atualizado_em   timestamptz default now()
);

-- ── ADMINS ────────────────────────────────────
create table if not exists admins (
  id          serial primary key,
  email       text unique not null,
  password_hash text not null,           -- bcrypt
  nome        text,
  criado_em   timestamptz default now()
);

-- ── TRIGGER: atualiza atualizado_em ──────────
create or replace function set_atualizado_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_encomendas_updated on encomendas;
create trigger trg_encomendas_updated
  before update on encomendas
  for each row execute function set_atualizado_em();

-- ── INSERIR ADMIN INICIAL ─────────────────────
-- Password padrão: Emir2026! (muda depois no painel)
-- Hash gerado com bcrypt rounds=10
insert into admins (email, password_hash, nome)
values (
  'admin@emir.com',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'Emir Admin'
) on conflict (email) do nothing;

-- ── DADOS DE EXEMPLO ──────────────────────────
insert into produtos (nome, categoria, loja, preco_eur, imagem_url) values
  ('Nike Air Max 270',       'Calçado',    'Nike.com',         129, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=420&q=85&fit=crop'),
  ('iPhone 15 Pro',          'Tecnologia', 'Apple.com',        999, 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&h=420&q=85&fit=crop'),
  ('Vestido Zara Premium',   'Moda',       'Zara.com',          79, 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600&h=420&q=85&fit=crop'),
  ('PS5 DualSense',          'Gaming',     'PlayStation.com',   75, 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=600&h=420&q=85&fit=crop'),
  ('Chanel Chance EDP 100ml','Beleza',     'Chanel.com',       110, 'https://images.unsplash.com/photo-1541643600914-78b084683702?w=600&h=420&q=85&fit=crop'),
  ('Cadeira Gaming RGB Pro', 'Gaming',     'Amazon.com',       230, 'https://images.unsplash.com/photo-1593640408182-31c228e62bab?w=600&h=420&q=85&fit=crop'),
  ('CeraVe Skincare Set',    'Beleza',     'ASOS.com',          38, 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&h=420&q=85&fit=crop'),
  ('Samsung Galaxy Watch 6', 'Tecnologia', 'Samsung.com',      249, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=420&q=85&fit=crop')
on conflict do nothing;
