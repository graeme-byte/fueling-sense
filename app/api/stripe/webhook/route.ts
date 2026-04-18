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
    console.error('[stripe/webhook] Invalid signature', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const email =
          session.customer_email ??
          session.customer_details?.email ??
          null;

        if (!userId) {
          console.warn('[stripe/webhook] checkout.session.completed: missing userId in metadata');
          break;
        }

        // Ensure app-side user row exists before creating the FK-linked subscription row
        await prisma.user.upsert({
          where: { id: userId },
          create: {
            id: userId,
            email: email ?? '',
          },
          update: {
            ...(email ? { email } : {}),
          },
        });

        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            tier: 'pro',
            stripeCustomerId:
              typeof session.customer === 'string' ? session.customer : null,
            stripeSubId:
              typeof session.subscription === 'string'
                ? session.subscription
                : null,
          },
          update: {
            tier: 'pro',
            stripeCustomerId:
              typeof session.customer === 'string' ? session.customer : null,
            stripeSubId:
              typeof session.subscription === 'string'
                ? session.subscription
                : null,
          },
        });

        console.log('[stripe/webhook] subscription upserted for user', userId);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const isActive = ['active', 'trialing'].includes(sub.status);
        const periodEndRaw = sub.items.data[0]?.current_period_end;
        const priceId = sub.items.data[0]?.price.id ?? null;

        await prisma.subscription.updateMany({
          where: { stripeSubId: sub.id },
          data: {
            tier: isActive ? 'pro' : 'free',
            stripePriceId: priceId,
            currentPeriodEnd: periodEndRaw
              ? new Date(periodEndRaw * 1000)
              : null,
            cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
          },
        });

        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;

        await prisma.subscription.updateMany({
          where: { stripeSubId: sub.id },
          data: {
            tier: 'free',
            cancelAtPeriodEnd: false,
          },
        });

        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(
      '[stripe/webhook] DB error processing event',
      event.type,
      err
    );

    // Important: return 500 so Stripe retries
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}