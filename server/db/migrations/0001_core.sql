-- ProneBridge core tables: catalog, merchants, buyers, payments, payouts, notifications.
-- Money is stored as integer cents in US dollars. Local prices use a simulated, indicative exchange rate.
-- A buyer's country is kept to choose which payment methods to show. It is never a risk signal.

-- Catalog -------------------------------------------------------------------------------------

create table public.countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  region text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  currency_name text not null,
  currency_symbol text not null,
  minor_units smallint not null default 2 check (minor_units between 0 and 3),
  price_step integer not null default 1 check (price_step > 0),
  fx_per_usd numeric(18, 6) not null check (fx_per_usd > 0),
  dial_code text,
  sort integer not null default 100,
  active boolean not null default true
);
comment on column public.countries.fx_per_usd is 'Simulated, indicative rate: units of local currency for one US dollar.';
comment on column public.countries.price_step is 'Local prices are rounded to this many minor units, so buyers see tidy amounts.';

create table public.payment_methods (
  id text primary key check (id ~ '^[a-z_]+$'),
  kind text not null check (kind in ('paypal', 'card', 'mobile_money', 'bank_transfer', 'ussd', 'voucher')),
  label text not null,
  hint text not null,
  provider text not null check (provider in ('paypal', 'simulated')),
  fee_bps integer not null check (fee_bps between 0 and 2000),
  fee_fixed_cents integer not null default 0 check (fee_fixed_cents >= 0),
  sort integer not null default 100
);
comment on column public.payment_methods.provider is 'paypal: runs through the PayPal sandbox. simulated: a labeled simulation.';
comment on column public.payment_methods.fee_bps is 'Demo pricing, in basis points.';

create table public.country_methods (
  country_code text not null references public.countries (code) on delete cascade,
  method_id text not null references public.payment_methods (id) on delete cascade,
  enabled boolean not null default true,
  status text not null default 'operational' check (status in ('operational', 'degraded', 'down')),
  sort integer not null default 100,
  primary key (country_code, method_id)
);

-- Merchants and their products ----------------------------------------------------------------

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  tagline text,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  settlement_currency text not null default 'USD' check (settlement_currency = 'USD'),
  payout_email text,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now()
);

create table public.merchant_methods (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  country_code text not null,
  method_id text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (merchant_id, country_code, method_id),
  foreign key (country_code, method_id) references public.country_methods (country_code, method_id) on delete cascade
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  subtitle text not null,
  summary text not null,
  category text not null check (category ~ '^[a-z-]+$'),
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  lessons integer not null check (lessons > 0),
  hours numeric(4, 1) not null check (hours > 0),
  price_usd_cents integer not null check (price_usd_cents > 0),
  cover text not null default 'blue' check (cover in ('blue', 'sky', 'deep', 'ink')),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  unique (merchant_id, slug),
  unique (id, merchant_id)
);

-- Buyers --------------------------------------------------------------------------------------

create table public.buyers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  country_code text not null references public.countries (code),
  created_at timestamptz not null default now()
);
create unique index buyers_email_key on public.buyers (lower(email));

-- Money out -----------------------------------------------------------------------------------

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  amount_usd_cents bigint not null check (amount_usd_cents > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null check (status in ('scheduled', 'processing', 'paid', 'failed')),
  provider text not null check (provider in ('paypal', 'simulated')),
  recipient_email text,
  paypal_batch_id text,
  paypal_item_id text,
  failure_code text,
  payments_count integer not null default 0 check (payments_count >= 0),
  period_start date,
  period_end date,
  origin text not null default 'app' check (origin in ('seed', 'app')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

-- Money in ------------------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  product_id uuid not null,
  buyer_id uuid not null references public.buyers (id),
  method_id text not null references public.payment_methods (id),
  country_code text not null references public.countries (code),
  amount_usd_cents integer not null check (amount_usd_cents > 0),
  display_currency text not null check (display_currency ~ '^[A-Z]{3}$'),
  display_amount_minor bigint not null check (display_amount_minor > 0),
  fx_rate numeric(18, 6) not null check (fx_rate > 0),
  fee_usd_cents integer not null default 0,
  net_usd_cents integer generated always as (amount_usd_cents - fee_usd_cents) stored,
  status text not null check (
    status in ('requires_payment', 'processing', 'succeeded', 'failed', 'blocked', 'in_review', 'refunded')
  ),
  failure_code text,
  provider text not null check (provider in ('paypal', 'simulated')),
  provider_order_id text,
  provider_capture_id text,
  card_brand text check (card_brand in ('visa', 'mastercard')),
  card_last4 text check (card_last4 ~ '^[0-9]{4}$'),
  payout_id uuid references public.payouts (id) on delete set null,
  idempotency_key text unique,
  origin text not null default 'app' check (origin in ('seed', 'app')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (product_id, merchant_id) references public.products (id, merchant_id),
  check (fee_usd_cents >= 0 and fee_usd_cents <= amount_usd_cents),
  check (status not in ('succeeded', 'refunded') or completed_at is not null)
);
create index payments_merchant_created_idx on public.payments (merchant_id, created_at desc);
create index payments_created_idx on public.payments (created_at desc);
create index payments_status_idx on public.payments (status);
create index payments_country_idx on public.payments (country_code);
create index payments_buyer_idx on public.payments (buyer_id);
create index payments_payout_idx on public.payments (payout_id) where payout_id is not null;
create index payouts_merchant_created_idx on public.payouts (merchant_id, created_at desc);

create table public.payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid not null references public.payments (id) on delete cascade,
  type text not null,
  actor text not null check (actor in ('buyer', 'seller', 'admin', 'system', 'ai', 'paypal')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index payment_events_payment_idx on public.payment_events (payment_id, created_at);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.buyers (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  payment_id uuid unique references public.payments (id) on delete set null,
  granted_at timestamptz not null default now(),
  unique (buyer_id, product_id)
);

create table public.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  buyer_id uuid references public.buyers (id) on delete set null,
  country_code text not null references public.countries (code),
  outcome text not null default 'open' check (outcome in ('open', 'paid', 'abandoned')),
  abandon_stage text check (abandon_stage in ('country', 'method', 'payment')),
  payment_id uuid references public.payments (id) on delete set null,
  origin text not null default 'app' check (origin in ('seed', 'app')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (outcome = 'abandoned' or abandon_stage is null)
);
create index checkout_sessions_merchant_created_idx on public.checkout_sessions (merchant_id, created_at desc);
create index checkout_sessions_country_idx on public.checkout_sessions (merchant_id, country_code);

-- Notifications and audit ---------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('buyer', 'seller', 'admin')),
  merchant_id uuid references public.merchants (id) on delete cascade,
  buyer_id uuid references public.buyers (id) on delete cascade,
  kind text not null,
  level text not null default 'info' check (level in ('info', 'success', 'warning', 'danger')),
  title text not null,
  body text not null,
  payment_id uuid references public.payments (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (audience <> 'seller' or merchant_id is not null),
  check (audience <> 'buyer' or buyer_id is not null)
);
create index notifications_audience_idx on public.notifications (audience, created_at desc);
create index notifications_merchant_idx on public.notifications (merchant_id, created_at desc) where merchant_id is not null;
create index notifications_buyer_idx on public.notifications (buyer_id, created_at desc) where buyer_id is not null;

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor text not null check (actor in ('buyer', 'seller', 'admin', 'system', 'ai', 'paypal')),
  actor_id text,
  action text not null,
  entity_type text,
  entity_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- Keep updated_at honest -----------------------------------------------------------------------

create function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger payments_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger payouts_updated_at before update on public.payouts for each row execute function public.set_updated_at();
create trigger merchant_methods_updated_at before update on public.merchant_methods for each row execute function public.set_updated_at();

-- Security: nothing in this schema is readable through Supabase's public data API ---------------
-- Row level security is on for every table and no policy lets the anon or authenticated roles in.
-- The API server connects as the database owner and does all reads and writes.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end $$;
