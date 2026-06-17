-- Tessera backend schema (DESIGN.md §6, §10).
--
-- Two tables:
--   enrollments    — one per authenticator device. Stores ONLY the Option B
--                    verifier (hash + salt + enumerate bounds), the public grid
--                    seed + params, and the readout shape. NEVER the rule (§9.2).
--   login_sessions — the two-device pairing + challenge state. The laptop creates
--                    a session, the phone claims it by pairing code, the Edge
--                    Function marks it passed/failed; the laptop watches via
--                    Realtime.
--
-- Security model for the DEMO: clients use the anon key. The verifier credential
-- and the verify decision are protected by running verification ONLY in the Edge
-- Function (service role + secret pepper). RLS below is permissive enough for the
-- demo flow but blocks the two things that matter: reading another device's
-- verifier, and clients writing their own session to "passed".

-- ── enrollments ────────────────────────────────────────────────────────────
create table public.enrollments (
  device_id     text primary key,           -- random id the phone generates
  credential    jsonb not null,             -- Option B credential: {hash, salt, enumerate}
  seed          text  not null,             -- public grid seed (§10)
  params        jsonb not null,             -- grid params {rows, cols, periodSeconds, emptyDensity}
  readout_shape jsonb not null,             -- {kind, ...} so the phone renders the input
  created_at    timestamptz not null default now()
);

-- ── login_sessions ─────────────────────────────────────────────────────────
create table public.login_sessions (
  id          uuid primary key default gen_random_uuid(),
  pair_code   text not null unique,         -- short code the laptop shows, phone enters
  device_id   text,                         -- set when the phone claims the session
  status      text not null default 'pending'
              check (status in ('pending', 'claimed', 'passed', 'failed', 'expired')),
  tick        bigint,                        -- the challenge tick (set on claim)
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '5 minutes')
);

create index login_sessions_pair_code_idx on public.login_sessions (pair_code);

-- Realtime: the laptop subscribes to its session row to learn the result live.
alter publication supabase_realtime add table public.login_sessions;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.enrollments   enable row level security;
alter table public.login_sessions enable row level security;

-- enrollments:
--   * anyone may INSERT an enrollment (the phone enrolling itself).
--   * NOBODY may SELECT via the anon key — the verifier must never be read back
--     by clients. Only the Edge Function (service role, which bypasses RLS) reads
--     it to verify. This keeps the stored verifier server-only.
create policy enrollments_insert_anon
  on public.enrollments for insert
  to anon
  with check (true);
-- (no select/update/delete policies for anon → those are denied)

-- login_sessions:
--   * anyone may INSERT (laptop starting a login) and SELECT (laptop polling /
--     phone looking up by pair code).
--   * clients may UPDATE only to 'claimed' (the phone claiming) — NEVER to
--     'passed'/'failed'. The verify decision is written by the Edge Function
--     (service role) alone, so a client can't mark itself authenticated.
create policy login_sessions_insert_anon
  on public.login_sessions for insert
  to anon
  with check (true);

create policy login_sessions_select_anon
  on public.login_sessions for select
  to anon
  using (true);

create policy login_sessions_claim_anon
  on public.login_sessions for update
  to anon
  using (status = 'pending')
  with check (status = 'claimed');
