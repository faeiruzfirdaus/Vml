create table if not exists public.vml_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  subscription jsonb not null,
  phone text,
  name text,
  profile text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vml_push_subscriptions enable row level security;

-- Backend uses SUPABASE_SERVICE_ROLE_KEY, so no public policy is required.
-- Do NOT put the service-role key into index.html.
