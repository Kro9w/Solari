# Participant ID issuer rollout

Migration `202611170003_random_tsi_participant_ids.sql` replaces only the body
of `issue_sinag_participant_id(bigint,text,text)`. It preserves the existing
signature and service-role-only execute grant. It does not update existing
participant IDs, change table/counter schemas, or modify participant-linking
functions.

New IDs use `TSI-P` + the two-digit year in `Asia/Manila` + four uppercase
alphanumeric characters, with no separator between year and suffix. The
suffix uses PostgreSQL's cryptographically secure v4 UUID random source and
rejection sampling to select each of the 36 symbols without modulo bias.
The participant ID primary key enforces full-ID uniqueness. The issuer checks
for an existing ID before insert and retries a primary-key collision; the
insert constraint handles races between concurrent issuances. A transaction
advisory lock by Discord user ID keeps retries idempotent.

## Deploy

Apply this migration to the SINAG Supabase project before deploying the Sol Bot
change. The Sol Bot RPC call remains:

```sql
select public.issue_sinag_participant_id(
  p_discord_user_id := 123456789012345678,
  p_first_name := 'Example',
  p_surname := 'Reviewee'
);
```

Deploy against the same `service_role` credential and RPC signature already in
use. Do not put that credential in the bot's client/browser code.

## Manual checks

Run these in a staging project first using `service_role` only.

1. **Exact format:** issue one ID and assert it matches
   `^TSI-P[0-9]{2}[A-Z0-9]{4}$`, for example `TSI-P26K7M4`. Confirm there is no
   dash between the year and suffix.
2. **Idempotent retry:** call the RPC twice with the same Discord user ID and
   different names. Both calls must return the exact same previously issued
   ID; the participant names should update as they did before.
3. **Distinct users:** call with several new Discord IDs. Each result must be
   unique, match the format, and be associated with the corresponding Discord
   ID.
4. **Collision handling:** in an isolated staging database, force the first
   generated candidate to match an existing participant ID using a temporary
   test-only database hook, then call the real issuer. It must retry and return
   a different ID. Remove the test hook and verify no production hook or
   predictable random source was added.
5. **Existing-ID compatibility:** snapshot representative sequential IDs
   before migration, apply it, and verify every value remains unchanged and
   still links to the same Discord/Auth records. Retry an existing Discord ID
   and verify the old sequential ID is returned as-is.
6. **Permissions and linking:** verify `authenticated` and `anon` cannot
   execute the issuer, `service_role` can, and participant-linking behavior
   and grants are unchanged.

This migration is ready for staging review. Promote it to the production
Supabase project before deploying Sol Bot against random-format IDs.
