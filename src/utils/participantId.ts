// Accept both existing sequential IDs and new year + four-character IDs.
const TSI_PARTICIPANT_ID_PATTERN = /^TSI-[PV](?:\d{6,}|\d{2}[A-Z0-9]{4})$/;

export function normalizeParticipantId(value: string) {
  return value.trim().toUpperCase();
}

export function isValidParticipantId(value: string) {
  return TSI_PARTICIPANT_ID_PATTERN.test(normalizeParticipantId(value));
}
