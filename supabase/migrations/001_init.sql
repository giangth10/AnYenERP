create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('admin', 'sale')),
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null unique,
  full_name text not null,
  phone text not null,
  address text not null,
  citizen_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  name text not null,
  weight_gram numeric(12,3) not null check (weight_gram > 0),
  created_at timestamptz not null default now()
);

create table if not exists inventory (
  product_id uuid primary key references products(id) on delete cascade,
  physical_qty integer not null default 0,
  pending_qty integer not null default 0,
  total_qty integer not null default 0,
  avg_cost_vnd_per_gram numeric(18,2) not null default 0,
  updated_at timestamptz not null default now(),
  check (total_qty = physical_qty + pending_qty)
);

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  customer_id uuid references customers(id),
  qty integer not null check (qty > 0),
  unit_price numeric(18,2) not null check (unit_price >= 0),
  status text not null default 'pending_delivery' check (status in ('pending_delivery', 'received')),
  created_at timestamptz not null default now()
);

create table if not exists sales_orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  customer_id uuid not null references customers(id),
  qty integer not null check (qty > 0),
  unit_price numeric(18,2) not null check (unit_price >= 0),
  sale_type text not null check (sale_type in ('physical', 'pending')),
  require_vat_invoice boolean not null default false,
  delivery_date date,
  created_at timestamptz not null default now()
);

create table if not exists procurements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  customer_id uuid not null references customers(id),
  qty integer not null check (qty > 0),
  unit_price numeric(18,2) not null check (unit_price >= 0),
  procurement_type text not null check (procurement_type in ('physical', 'invoice')),
  linked_sale_order_id uuid references sales_orders(id),
  require_vat_invoice boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace view company_profile as
select
  'Công ty TNHH MTV Bạc An Yên'::text as company_name,
  '5801550903'::text as tax_code,
  '11B Lữ Gia, Phường Lâm Viên - Đà Lạt, Tỉnh Lâm Đồng'::text as address,
  '0845354222'::text as phone;
