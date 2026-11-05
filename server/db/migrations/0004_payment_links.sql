-- Payment links (step 6): a seller shares a link to one of their courses, and sees who used it and what it earned.
-- The price is never on the link. It always comes from the course, so a link cannot be edited into a discount.

create table public.payment_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]{6,12}$'),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  product_id uuid not null,
  title text not null check (char_length(title) between 1 and 80),
  note text check (note is null or char_length(note) <= 240),
  max_uses integer check (max_uses is null or max_uses > 0),
  expires_at timestamptz,
  active boolean not null default true,
  origin text not null default 'app' check (origin in ('seed', 'app')),
  created_at timestamptz not null default now(),
  foreign key (product_id, merchant_id) references public.products (id, merchant_id) on delete cascade
);
create index payment_links_merchant_idx on public.payment_links (merchant_id, created_at desc);

-- Which link a visit and a payment came from. A link that is removed leaves them as they were.
alter table public.checkout_sessions add column link_id uuid references public.payment_links (id) on delete set null;
alter table public.payments add column link_id uuid references public.payment_links (id) on delete set null;
create index checkout_sessions_link_idx on public.checkout_sessions (link_id) where link_id is not null;
create index payments_link_idx on public.payments (link_id) where link_id is not null;

-- Same rule as every table: row level security on, no policy, so the Supabase data API reaches nothing.
alter table public.payment_links enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.payment_links from %I', r);
    end if;
  end loop;
end $$;
