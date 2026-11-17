// IDs issued by the deployed contract look like TSI-P + two year digits +
// a sequence padded to at least four digits (for example, TSI-P260001).
const TSI_PARTICIPANT_ID_PATTERN = /^TSI-P\d{6,}$/;

export function normalizeParticipantId(value: string) {
  return value.trim().toUpperCase();
}

export function isValidParticipantId(value: string) {
  return TSI_PARTICIPANT_ID_PATTERN.test(normalizeParticipantId(value));
}
