export const MAX_FEEDBACK_CHARACTERS = 500;

export function limitFeedbackCharacters(text: string): string {
  return text.slice(0, MAX_FEEDBACK_CHARACTERS);
}
