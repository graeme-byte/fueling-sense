'use client';

// Preserves an in-progress calculator result across the signup → email
// confirmation → /auth/callback round trip, so a logged-out user who creates
// an account doesn't lose the numbers they just got. This is the only
// mechanism by which a logged-out visitor becomes an account holder — there
// is no other signup path once anonymous access removed the auth wall.
//
// Single fixed key: only the most recently stashed result is kept. If someone
// runs more than one calculator anonymously before signing up, only the one
// they actually clicked "Create free account" from is restored — this matches
// the one-shot, low-pressure nature of the offer rather than tracking a full
// anonymous session.

export type PendingResultKind =
  | 'cycling-profile'
  | 'running-profile'
  | 'cycling-fueling'
  | 'running-fueling';

interface PendingResultEnvelope<T> {
  kind:    PendingResultKind;
  payload: T;
  savedAt: number; // Date.now() at write time
}

const STORAGE_KEY = 'fuelingSense.pendingResult';

// How long a stashed result waits for its owner to finish confirming their
// email. Long enough to survive a delayed inbox check (end of day, over a
// weekend); short enough that a months-old test never comes back and
// silently overwrites a profile the user is actively working on today.
const EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

export function savePendingResult<T>(kind: PendingResultKind, payload: T): void {
  try {
    const envelope: PendingResultEnvelope<T> = { kind, payload, savedAt: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Private browsing, blocked site data, storage quota, etc. — degrade to
    // "no preservation." Signup still works; the user just re-enters their
    // numbers, same as if this feature didn't exist.
  }
}

export function readPendingResult<T>(kind: PendingResultKind): T | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const envelope = JSON.parse(raw) as Partial<PendingResultEnvelope<T>>;
    if (
      envelope.kind !== kind ||
      envelope.payload === undefined ||
      typeof envelope.savedAt !== 'number'
    ) {
      return null;
    }

    if (Date.now() - envelope.savedAt > EXPIRY_MS) {
      clearPendingResult();
      return null;
    }

    return envelope.payload;
  } catch {
    return null;
  }
}

export function clearPendingResult(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — if we couldn't read it, there's nothing to clear either.
  }
}
