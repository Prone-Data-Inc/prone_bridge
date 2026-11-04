-- PayPal (step 5): an inbox for webhook events, and one payment per PayPal order or capture.

-- Every webhook PayPal sends is written here once, by its event id. A repeat delivery finds the row and does nothing,
-- so a retried webhook can never settle a payment twice. Only ids and the outcome are kept: no names, no emails, no
-- amounts.
create table public.webhook_events (
  id text primary key,
  event_type text not null,
  resource_type text,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error text,
  attempts integer not null default 1 check (attempts > 0),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index webhook_events_received_idx on public.webhook_events (received_at desc);

-- Same rule as every table: row level security on, no policy, so the Supabase data API reaches nothing.
alter table public.webhook_events enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.webhook_events from %I', r);
    end if;
  end loop;
end $$;

-- A PayPal order or capture belongs to exactly one payment.
create unique index payments_provider_order_key on public.payments (provider_order_id) where provider_order_id is not null;
create unique index payments_provider_capture_key on public.payments (provider_capture_id) where provider_capture_id is not null;

-- A payout is found by its reference (the sender batch id) when PayPal reports on it.
create index payouts_paypal_batch_idx on public.payouts (paypal_batch_id) where paypal_batch_id is not null;
