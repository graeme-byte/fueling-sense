import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const SUPPORT_EMAIL = 'info@fueling-sense.com';

// Deterministic subject prefix mapping — drives Gmail filter labels.
// fuelingsense-report-bug  → [Fueling Sense][Bug]
// fuelingsense-support     → [Fueling Sense][Support]
const SUBJECT_PREFIXES: Record<string, string> = {
  bug:      '[Fueling Sense][Bug]',
  help:     '[Fueling Sense][Support]',
  feedback: '[Fueling Sense][Support]',
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, topic, message, name } = body as {
    type: string;
    topic: string;
    message: string;
    name?: string;
  };

  // Validate
  if (!type || !SUBJECT_PREFIXES[type]) {
    return NextResponse.json({ error: 'Invalid submission type' }, { status: 400 });
  }
  if (!topic?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'Topic and message are required' }, { status: 400 });
  }

  const prefix = SUBJECT_PREFIXES[type];
  const subject = `${prefix} ${topic.trim()}`;

  const senderLabel = name?.trim() ? name.trim() : 'Anonymous';
  const typeLabel = type === 'bug' ? 'Bug Report' : type === 'help' ? 'Help / Question' : 'Feedback';

  const html = `
<p><strong>Type:</strong> ${typeLabel}</p>
<p><strong>From:</strong> ${senderLabel}</p>
<hr />
<p>${message.trim().replace(/\n/g, '<br />')}</p>
  `.trim();

  const text = `Type: ${typeLabel}\nFrom: ${senderLabel}\n\n${message.trim()}`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[support] RESEND_API_KEY is not set');
    return NextResponse.json({ error: 'Email service not configured' }, { status: 503 });
  }

  const fromEmail = process.env.SUPPORT_FROM_EMAIL ?? 'noreply@app.fueling-sense.com';
  const from = `Fueling Sense <${fromEmail}>`;
  console.log(`[support] sending from=${from} to=${SUPPORT_EMAIL} subject="${subject}"`);

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: SUPPORT_EMAIL,
    subject,
    html,
    text,
  });

  if (error) {
    console.error('[support] Resend error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
