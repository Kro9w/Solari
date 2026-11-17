# SINAG offboarding cleanup

Migration `202611170004_offboard_legacy_data.sql`:

- drops the unused `allowed_surnames` table;
- truncates `exam_results` but leaves the table and exams intact;
- drops the obsolete plural table `sinag_participant_counters`;
- clears `auth_user_id` links so retained participant IDs can be used again;
- preserves `sinag_participants`, issued IDs, names, exams, sessions, and the
  signup rate-limit table.

The migration is not applied until `supabase db push` is run. After applying
it, flush the Auth users as planned. The rate-limit table,
`sinag_signup_rate_limits`, supports the public signup Edge Function. It stores
only keyed hashes of the requester IP and normalized TSI ID, plus an hourly
window start and attempt count. The function limits requests to 12 per IP and
5 per TSI ID per hour. It stores no passwords or Auth tokens. Dropping it would
make the signup function fail closed because it cannot enforce those limits.
