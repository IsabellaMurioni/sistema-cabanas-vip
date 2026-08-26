-- ============================================================
-- 010_multi_complejo_base.sql
-- Fase 1.1 — Tablas nuevas para soportar múltiples complejos.
-- 100% aditivo: no modifica ninguna tabla existente.
-- ============================================================

create table complejos (
  id               uuid default gen_random_uuid() primary key,
  nombre           text not null,
  slug             text not null unique,
  ubicacion        text,
  color_primario   text,
  color_secundario text,
  whatsapp         text,
  email_contacto   text,
  web              text,
  created_at       timestamptz default now()
);

alter table complejos enable row level security;

create policy "complejos_select" on complejos
  for select to authenticated using (true);

create table cabanas (
  id          uuid default gen_random_uuid() primary key,
  complejo_id uuid not null references complejos(id) on delete cascade,
  nombre      text not null,
  color       text,
  pax_min     integer,
  pax_max     integer,
  orden       integer not null default 0,
  created_at  timestamptz default now()
);

alter table cabanas enable row level security;

create table membresias (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  complejo_id uuid not null references complejos(id) on delete cascade,
  created_at  timestamptz default now(),
  unique (user_id, complejo_id)
);

alter table membresias enable row level security;

create policy "membresias_select_propia" on membresias
  for select to authenticated using (user_id = auth.uid());

insert into complejos (nombre, slug, ubicacion, color_primario, whatsapp, email_contacto, web)
values (
  'Cabañas VIP',
  'cabanas-vip',
  'Santa Clara del Mar',
  '#d2ab84',
  '011-5099-5700',
  'ventashotelesdelacosta@hotmail.com',
  'www.complejocabanasvip.com'
);

insert into cabanas (complejo_id, nombre, color, orden)
select (select id from complejos where slug = 'cabanas-vip'), nombre, color, orden
from (values
  ('Bahama',    '#1e3a5f', 1),
  ('Bahia',     '#065f46', 2),
  ('Maui',      '#0ea5e9', 3),
  ('Itaparica', '#4d7c0f', 4),
  ('Acapulco',  '#ea580c', 5),
  ('Cozumel',   '#db2777', 6),
  ('Ibiza',     '#7c3aed', 7),
  ('Ipanema',   '#d97706', 8),
  ('Maceio',    '#dc2626', 9),
  ('Hawai',     '#0d9488', 10),
  ('Vallarta',  '#9333ea', 11),
  ('Aruba',     '#16a34a', 12),
  ('Cancún',    '#2563eb', 13),
  ('Buzios',    '#e11d48', 14),
  ('Jamaica',   '#92400e', 15)
) as t(nombre, color, orden);

insert into membresias (user_id, complejo_id)
select u.id, (select id from complejos where slug = 'cabanas-vip')
from auth.users u
where u.email = 'isamurioni07@gmail.com'
on conflict do nothing;
