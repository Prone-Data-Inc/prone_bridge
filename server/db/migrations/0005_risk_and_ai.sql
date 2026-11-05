-- Risk checks and the AI layer (steps 7 and 8).
--   risk_assessments  one row per payment that was scored: the score, the rules that fired, and a plain explanation.
--                     Country, nationality, ethnicity and name are never inputs to a score.
--   ai_usage          tokens spent on AI calls, so the app can stop at a daily budget.
--   copilot_actions   a change the seller copilot proposed. Nothing happens until the seller confirms it.

create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments (id) on delete cascade,
  score smallint not null check (score between 0 and 100),
  level text not null check (level in ('low', 'medium', 'high')),
  decision text not null check (decision in ('allow', 'review', 'block')),
  -- false for a payment scored after it was settled (the demo history): the decision was not applied to it.
  enforced boolean not null default true,
  -- [{ id, points, fact }]: the rules that fired and what they saw.
  signals jsonb not null default '[]'::jsonb,
  explanation text not null,
  explanation_source text not null check (explanation_source in ('ai', 'rules')),
  model text,
  engine text not null,
  review_decision text check (review_decision in ('approved', 'rejected')),
  review_note text check (review_note is null or char_length(review_note) <= 240),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (review_decision is null or reviewed_at is not null)
);
create index risk_assessments_level_idx on public.risk_assessments (level, created_at desc);
create index risk_assessments_created_idx on public.risk_assessments (created_at desc);

-- The review queue and the risk views look up payments by status.
create index payments_review_idx on public.payments (created_at) where status = 'in_review';

create table public.ai_usage (
  id bigint generated always as identity primary key,
  feature text not null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  merchant_id uuid references public.merchants (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_usage_created_idx on public.ai_usage (created_at desc);

create table public.copilot_actions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  kind text not null check (kind in ('method', 'link_create', 'link_active', 'payout')),
  params jsonb not null default '{}'::jsonb,
  summary text not null check (char_length(summary) between 1 and 240),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed', 'failed')),
  result jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index copilot_actions_merchant_idx on public.copilot_actions (merchant_id, created_at desc);

-- Same rule as every table: row level security on, no policy, so the Supabase data API reaches nothing.
alter table public.risk_assessments enable row level security;
alter table public.ai_usage enable row level security;
alter table public.copilot_actions enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.risk_assessments from %I', r);
      execute format('revoke all on public.ai_usage from %I', r);
      execute format('revoke all on public.copilot_actions from %I', r);
      execute format('revoke all on sequence public.ai_usage_id_seq from %I', r);
    end if;
  end loop;
end $$;
