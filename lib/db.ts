import { PrismaClient, Prisma } from '@/app/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg(process.env.DATABASE_URL!);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Ensure a `public.users` row exists for an authenticated Supabase user.
 *
 * Supabase owns `auth.users`; Prisma owns `public.users`. Rows in `public.users`
 * were historically only created by the Stripe webhook on purchase, so any
 * free-tier user who signed up and never bought Pro has no parent row — and
 * every insert that references `users.id` (saved_profiles, fueling_results,
 * inscyd_results) fails with a foreign-key violation.
 *
 * Call this before any insert scoped to `userId`.
 *
 * `email` is only written on create, and on update only when present, so an
 * existing address is never blanked by a session that lacks one.
 */
export async function ensureUserRow(id: string, email?: string | null) {
  await prisma.user.upsert({
    where:  { id },
    create: { id, email: email ?? '' },
    update: email ? { email } : {},
  });
}

/**
 * Describe a database error for server logs.
 *
 * Prisma's known-request errors carry the diagnostic detail — `P2003` is a
 * foreign-key violation, `P2002` a unique-constraint violation — and `meta`
 * names the constraint or field that failed. Without these a caught error
 * logs as a generic message and the cause has to be reconstructed by hand.
 *
 * Returns null for anything that is not a Prisma error, so callers can tell
 * a DB failure from an application one.
 */
export function describeDbError(err: unknown): string | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = err.meta ? ` meta=${JSON.stringify(err.meta)}` : '';
    return `Prisma ${err.code}${meta}`;
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return 'Prisma validation error (query shape does not match schema)';
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return `Prisma initialization error${err.errorCode ? ` ${err.errorCode}` : ''}`;
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    return 'Prisma unknown request error';
  }
  if (err instanceof Prisma.PrismaClientRustPanicError) {
    return 'Prisma engine panic';
  }
  return null;
}
