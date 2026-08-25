'use client';

interface Props {
  headline: string;
  body:     string;
  onCreateAccount: () => void;
}

// Shown on a results view to a logged-out user. This is the funnel's only
// entry point now that anonymous access removed the auth wall — it has to
// read as an offer with a clear payoff, sit right next to the numbers it's
// offering to keep, and never reappear or escalate if ignored.
export default function SaveAccountPrompt({ headline, body, onCreateAccount }: Props) {
  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-start gap-4">
      <div className="flex-1">
        <p className="text-sm font-bold text-violet-900">{headline}</p>
        <p className="text-xs text-violet-700 mt-1">{body}</p>
      </div>
      <button
        onClick={onCreateAccount}
        className="shrink-0 px-4 py-2 bg-violet-600 text-white text-xs font-black rounded-lg hover:bg-violet-700 transition"
      >
        Create free account →
      </button>
    </div>
  );
}
