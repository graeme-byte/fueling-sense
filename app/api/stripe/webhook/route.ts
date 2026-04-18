/**
 * POST /api/stripe/webhook
 * Handles Stripe subscription lifecycle events.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    console.error('[stripe/webhook] Request missing stripe-signature header');
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed — check STRIPE_WEBHOOK_SECRET matches the Dashboard webhook secret (not the CLI secret):', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log(`[stripe/webhook] Received event: ${event.type} (id: ${event.id})`);

  try {
    switch (event.type) {

      // ── New subscription created via Checkout ───────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId  = session.metadata?.userId;
        const email   =
          session.customer_email ??
          session.customer_details?.email ??
          null;

        console.log(`[stripe/webhook] checkout.session.completed — userId from metadata: ${userId ?? 'MISSING'}, email: ${email ?? 'none'}, stripeSubId: ${session.subscription ?? 'none'}`);

        if (!userId) {
          console.error('[stripe/webhook] checkout.session.completed: metadata.userId is missing — cannot map to app user. Check checkout session creation sets metadata.userId.');
          break;
        }

        // Ensure app-side user row exists before creating the FK-linked subscription row
        await prisma.user.upsert({
          where:  { id: userId },
          create: { id: userId, email: email ?? '' },
          update: { ...(email ? { email } : {}) },
        });
        console.log(`[stripe/webhook] User upsert complete for ${userId}`);

        const stripeCustomerId =
          typeof session.customer === 'string' ? session.customer : null;
        const stripeSubId =
          typeof session.subscription === 'string' ? session.subscription : null;

        await prisma.subscription.upsert({
          where:  { userId },
          create: { userId, tier: 'pro', stripeCustomerId, stripeSubId },
          update: { tier: 'pro', stripeCustomerId, stripeSubId },
        });
        console.log(`[stripe/webhook] Subscription upserted → tier=pro for user ${userId} (stripeSubId: ${stripeSubId ?? 'none'})`);
        break;
      }

      // ── Subscription activated / changed / renewed ──────────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub      = event.data.object as Stripe.Subscription;
        const isActive = ['active', 'trialing'].includes(sub.status);
        const periodEndRaw = sub.items.data[0]?.current_period_end;
        const priceId  = sub.items.data[0]?.price.id ?? null;
        const newTier  = isActive ? 'pro' : 'free';

        console.log(`[stripe/webhook] ${event.type} — stripeSubId: ${sub.id}, status: ${sub.status}, tier→${newTier}, periodEnd: ${periodEndRaw ? new Date(periodEndRaw * 1000).toISOString() : 'none'}`);

        const result = await prisma.subscription.updateMany({
          where: { stripeSubId: sub.id },
          data: {
            tier: newTier,
            stripePriceId:    priceId,
            currentPeriodEnd: periodEndRaw ? new Date(periodEndRaw * 1000) : null,
            cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
          },
        });

        if (result.count === 0) {
          console.warn(`[stripe/webhook] ${event.type}: updateMany matched 0 rows for stripeSubId ${sub.id} — subscription row may not exist yet (checkout.session.completed may not have fired first). This is harmless if checkout.session.completed follows.`);
        } else {
          console.log(`[stripe/webhook] ${event.type}: updated ${result.count} subscription row(s) for stripeSubId ${sub.id}`);
        }
        break;
      }

      // ── Subscription cancelled ──────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        console.log(`[stripe/webhook] customer.subscription.deleted — stripeSubId: ${sub.id}`);

        const result = await prisma.subscription.updateMany({
          where: { stripeSubId: sub.id },
          data:  { tier: 'free', cancelAtPeriodEnd: false },
        });

        console.log(`[stripe/webhook] customer.subscription.deleted: updated ${result.count} row(s) to tier=free`);
        break;
      }

      default:
        console.log(`[stripe/webhook] Unhandled event type: ${event.type} — ignored`);
        break;
    }
  } catch (err) {
    console.error(
      `[stripe/webhook] DB error processing event ${event.type} (id: ${event.id}):`,
      err
    );
    // Return 500 so Stripe retries the event
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
