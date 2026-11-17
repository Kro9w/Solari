-- Signup rate limits and server-bound participant linking.
-- The deployed sinag_participants table/ID issuer are not modified.

create table if not exists public.sinag_signup_rate_limits (
  bucket_hash text primary key check (bucket_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0),
  updated_at timestamptz not null default now()
);

alter table public.sinag_signup_rate_limits enable row level security;
revoke all on table public.sinag_signup_rate_limits from public, anon, authenticated, service_role;

create or replace function public.consume_sinag_signup_rate_limit(
  p_bucket_hash text,
  p_max_attempts integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_attempts integer;
begin
  if p_bucket_hash is null or p_bucket_hash !~ '^[0-9a-f]{64}$'
     or p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 100
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit parameters';
  end if;

  insert into public.sinag_signup_rate_limits
    (bucket_hash, window_started_at, attempts, updated_at)
  values (p_bucket_hash, v_now, 1, v_now)
  on conflict (bucket_hash) do update
    set attempts = case
          when public.sinag_signup_rate_limits.window_started_at
               + make_interval(secs => p_window_seconds) <= v_now then 1
          else public.sinag_signup_rate_limits.attempts + 1
        end,
        window_started_at = case
          when public.sinag_signup_rate_limits.window_started_at
               + make_interval(secs => p_window_seconds) <= v_now then v_now
          else public.sinag_signup_rate_limits.window_started_at
        end,
        updated_at = v_now
  returning attempts into v_attempts;

  return v_attempts <= p_max_attempts;
end;
$function$;
revoke all on function public.consume_sinag_signup_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_sinag_signup_rate_limit(text, integer, integer)
  to service_role;

-- Called only after verified Auth sign-in. The participant ID comes from
-- server-managed app_metadata, never from a client-supplied RPC argument.
create or replace function public.complete_sinag_participant_link()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_email_confirmed_at timestamptz;
  v_participant_id text;
  v_existing_participant_id text;
begin
  if v_uid is null then
    raise exception 'verified authentication required' using errcode = '42501';
  end if;

  select u.email_confirmed_at,
         u.raw_app_meta_data ->> 'sinag_participant_id'
    into v_email_confirmed_at, v_participant_id
    from auth.users as u
   where u.id = v_uid;

  if v_email_confirmed_at is null or nullif(btrim(v_participant_id), '') is null then
    raise exception 'verified participant signup required' using errcode = '42501';
  end if;

  select p.participant_id into v_existing_participant_id
    from public.sinag_participants as p
   where p.auth_user_id = v_uid;

  if v_existing_participant_id is not null then
    if v_existing_participant_id = v_participant_id then return; end if;
    raise exception 'auth user already linked' using errcode = '23505';
  end if;

  update public.sinag_participants
     set auth_user_id = v_uid,
         updated_at = clock_timestamp()
   where participant_id = v_participant_id
     and auth_user_id is null;

  if not found then
    raise exception 'participant unavailable' using errcode = '23505';
  end if;
end;
$function$;
revoke all on function public.complete_sinag_participant_link() from public, anon;
grant execute on function public.complete_sinag_participant_link() to authenticated;

-- Prevent older browser builds from submitting arbitrary participant IDs.
do $function$
begin
  if to_regprocedure('public.link_sinag_participant(text)') is not null then
    execute 'revoke all on function public.link_sinag_participant(text) from public, anon, authenticated';
  end if;
end;
$function$;
