# Sol Bot participant-type issuer update

Migration `202611170005_participant_type_prefix.sql` adds a four-argument
overload while preserving the current three-argument RPC. Both overloads are
`service_role` only. The old overload delegates to the new one with type `P`,
so existing callers remain functional during rollout. Old callers cannot issue
volunteer-prefixed IDs until they pass the explicit type.

## Sol Bot changes

1. At nickname-request submission, read the requester's volunteer role once:
   save `V` if they have the volunteer role and `P` otherwise. Persist that
   snapshot on the request.
2. On approval, use that saved snapshot. Do not query the member's current
   Discord roles at approval time.
3. Call the existing RPC name with the fourth argument:

```ts
const { data: participantId, error } = await supabase.rpc(
  "issue_sinag_participant_id",
  {
    p_discord_user_id: discordUserId,
    p_first_name: firstName,
    p_surname: surname,
    p_participant_type: savedParticipantType, // exactly "V" or "P"
  },
);
```

The function returns the generated ID as text. For `V`, new IDs look like
`TSI-V26K7M4`; for `P`, they look like `TSI-P26K7M4`. The two-digit year uses
the existing `Asia/Manila` year behavior. Existing rows keep their IDs, and a
retry for the same Discord user returns the first issued ID even if a later
call supplies another type.

## Rollout order

Apply the migration first, then deploy the updated Sol Bot. The previous bot
continues working through the retained three-argument overload, but that
compatibility path always issues `P` IDs. To correctly classify volunteers,
the bot must pass the submission-time snapshot through the new fourth argument.

From the repository root, preview and apply the migration:

```sh
supabase db push --dry-run --remote
supabase db push --remote
```

Check the dry-run output first; it should include
`202611170005_participant_type_prefix.sql` and any other migrations you intend
to apply. Deploy the updated bot after the migration succeeds.

## Manual checks

- A `V` call returns `^TSI-V[0-9]{2}[A-Z0-9]{4}$`.
- A `P` call and the legacy three-argument call return IDs matching
  `^TSI-P[0-9]{2}[A-Z0-9]{4}$`.
- Null, lowercase, or any type other than exact `V`/`P` is rejected by the
  four-argument RPC.
- Repeating either RPC for the same Discord ID returns the original ID;
  changing the supplied type on retry does not change its prefix.
- Different Discord users receive unique IDs. In staging, force a primary-key
  collision and confirm the issuer retries.
- Existing sequential and already-random IDs remain unchanged and retain their
  participant/Auth links.
- `anon` and `authenticated` cannot execute either overload; `service_role`
  can execute both.
