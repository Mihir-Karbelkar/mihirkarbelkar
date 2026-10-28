export function errorMessage(error: unknown, fallback: string) {
  if (typeof error === 'string') return error;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  )
    return error.message;
  return fallback;
}
/** Short visitor-facing copy for any failure; details go to the console. */
export function friendlyError(error: unknown, context = 'chat'): string {
  console.warn(`[${context}]`, error);
  const text = errorMessage(error, '');
  if (/storage/i.test(text))
    return 'There isn’t enough free storage on this device.';
  if (/stall|network|fetch|connection|timed? ?out|took too long/i.test(text))
    return 'The connection dropped. Please try again.';
  return 'Something went wrong. Please try again.';
}
