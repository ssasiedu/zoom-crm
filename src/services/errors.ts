/** Normalised application error with a friendly message */
export class AppError extends Error {
  code?: string;
  details?: string;

  constructor(message: string, code?: string, details?: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

interface PgLikeError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

const FRIENDLY: Record<string, string> = {
  '42501': "You don't have permission to do that.",
  '23505': 'That value already exists. Please use a different one.',
  '23503': 'This record is linked to other data and cannot be changed that way.',
  '23514': 'Some values are not valid. Please check the form.',
  PGRST116: 'The record was not found or you no longer have access to it.',
  PGRST301: 'Your session has expired. Please sign in again.',
};

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error && typeof error === 'object') {
    const e = error as PgLikeError;
    const raw = e.message ?? 'Something went wrong';
    // Messages raised by our own triggers are already user friendly.
    const isTriggerMessage = e.code === 'P0001';
    let message = isTriggerMessage ? raw : (e.code && FRIENDLY[e.code]) || raw;
    if (e.code === '42501' && raw && !raw.startsWith('new row violates') && !raw.startsWith('permission denied')) {
      message = raw;
    }
    if (/Failed to fetch|NetworkError/i.test(raw)) {
      message = 'Network error. Check your internet connection and try again.';
    }
    if (e.code === '23514' && raw.includes('contact_number')) {
      message = 'CONTACT NUMBER must be a valid Ghana number (0XXXXXXXXX or +233XXXXXXXXX).';
    }
    return new AppError(message, e.code, e.details ?? undefined);
  }
  return new AppError(typeof error === 'string' ? error : 'Something went wrong');
}

export function errorMessage(error: unknown): string {
  return toAppError(error).message;
}

/** Throw a normalised error if a Supabase response contains one */
export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw toAppError(result.error);
  return result.data;
}
