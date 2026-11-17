-- Switch newly issued IDs to TSI-P + Manila issuance year + four secure
-- uppercase alphanumeric characters. Existing participant IDs are untouched.
-- The participant_id primary key remains the uniqueness constraint.

create or replace function public.issue_sinag_participant_id(
  p_discord_user_id bigint,
  p_first_name text,
  p_surname text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_year integer;
  v_participant_id text;
  v_existing_participant_id text;
  v_suffix text;
  v_alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_random_bytes bytea;
  v_random_byte integer;
  v_attempt integer;
  v_constraint_name text;
begin
  if p_discord_user_id is null or p_discord_user_id <= 0 then
    raise exception 'A valid Discord user ID is required.';
  end if;
  if nullif(trim(p_first_name), '') is null then
    raise exception 'A first name is required.';
  end if;
  if nullif(trim(p_surname), '') is null then
    raise exception 'A surname is required.';
  end if;

  -- Serialize retries for the same Discord account without blocking unrelated
  -- approvals. A retry always returns the original participant ID.
  perform pg_catalog.pg_advisory_xact_lock(p_discord_user_id);

  select participant_id
    into v_existing_participant_id
    from public.sinag_participants
   where discord_user_id = p_discord_user_id
   for update;

  if v_existing_participant_id is not null then
    update public.sinag_participants
       set first_name = trim(p_first_name),
           surname = trim(p_surname),
           updated_at = v_now
     where discord_user_id = p_discord_user_id;
    return v_existing_participant_id;
  end if;

  v_year := extract(year from (v_now at time zone 'Asia/Manila'))::integer;

  loop
    v_suffix := '';
    for v_attempt in 1..4 loop
      loop
        -- PostgreSQL's built-in v4 UUID generator is backed by the database
        -- strong random source. Its first byte contains eight random bits.
        v_random_bytes := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
        v_random_byte := pg_catalog.get_byte(v_random_bytes, 0);
        -- 252 is the largest multiple of 36 below 256, so rejection sampling
        -- gives every uppercase letter/digit an equal probability.
        exit when v_random_byte < 252;
      end loop;
      v_suffix := v_suffix || pg_catalog.substr(v_alphabet, (v_random_byte % 36) + 1, 1);
    end loop;

    v_participant_id := 'TSI-P'
      || pg_catalog.right(v_year::text, 2)
      || v_suffix;

    -- Fast collision check. The primary key still handles concurrent
    -- collisions between two issuances that generated the same candidate.
    if exists (
      select 1 from public.sinag_participants
       where participant_id = v_participant_id
    ) then
      continue;
    end if;

    begin
      insert into public.sinag_participants (
        participant_id,
        discord_user_id,
        first_name,
        surname,
        assigned_at
      ) values (
        v_participant_id,
        p_discord_user_id,
        trim(p_first_name),
        trim(p_surname),
        v_now
      );
      return v_participant_id;
    exception when unique_violation then
      -- Preserve idempotency if the Discord row appeared concurrently.
      select participant_id
        into v_existing_participant_id
        from public.sinag_participants
       where discord_user_id = p_discord_user_id;
      if v_existing_participant_id is not null then
        update public.sinag_participants
           set first_name = trim(p_first_name),
               surname = trim(p_surname),
               updated_at = v_now
         where discord_user_id = p_discord_user_id;
        return v_existing_participant_id;
      end if;

      get stacked diagnostics v_constraint_name = constraint_name;
      -- The deployed contract defines participant_id as the primary key.
      -- Retry only that collision; propagate any unrelated unique violation.
      if v_constraint_name = 'sinag_participants_pkey' then
        continue;
      end if;
      raise;
    end;
  end loop;
end;
$function$;

-- Keep the deployed RPC signature and its service-role-only permission model.
revoke all on function public.issue_sinag_participant_id(bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.issue_sinag_participant_id(bigint, text, text)
  to service_role;
