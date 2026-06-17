-- Rate limiting for the verify flow (DESIGN.md §6: "deliberately slow hash and
-- ... rate-limiting" — the defense against brute-forcing the small answer space).
--
-- Without this, an attacker who knows a device is enrolled could spin up many
-- login sessions and submit guesses (0,1,2,3…) until one matches — the answer
-- space is tiny. We throttle SUBMIT attempts per device.
--
-- One row per submit attempt; the Edge Function counts recent rows for the
-- device before verifying and refuses once the window is full.

create table public.auth_attempts (
  id         bigint generated always as identity primary key,
  device_id  text not null,
  ok         boolean not null,            -- was the attempt a PASS?
  created_at timestamptz not null default now()
);

create index auth_attempts_device_time_idx
  on public.auth_attempts (device_id, created_at desc);

alter table public.auth_attempts enable row level security;
-- No anon policies → clients cannot read or write this table at all. Only the
-- Edge Function (service role, bypasses RLS) records and counts attempts, so a
-- client can neither inspect nor clear its own rate-limit state.
