export const MAX_EXPIRATION_MESSAGE_LENGTH = 500;

export function normalizeExpirationMessage(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_EXPIRATION_MESSAGE_LENGTH
  ) {
    return null;
  }

  return normalized;
}
