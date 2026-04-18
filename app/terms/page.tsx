import Link from 'next/link';
import CompanyInfo from '@/components/shared/CompanyInfo';

export const metadata = { title: 'Terms of Use — Fueling Sense' };

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-16">

        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 transition mb-8 block">← Back to home</Link>

        <h1 className="text-2xl font-black text-gray-900 mb-2">Terms of Use</h1>
        <p className="text-xs text-gray-400 mb-8">Last updated: April 2026</p>

        <div className="prose prose-sm text-gray-600 space-y-6">

          <section>
            <h2 className="text-sm font-bold text-gray-800 mb-2">1. Acceptance</h2>
            <p>By using Fueling Sense you agree to these terms. If you do not agree, do not use the service.</p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-gray-800 mb-2">2. Nature of the service</h2>
            <p>Fueling Sense provides metabolic profiling and sports nutrition estimates for informational purposes only. Outputs are based on physiological models and are not a substitute for professional medical or dietary advice. You are solely responsible for all decisions you make regarding your training, nutrition, and health. Always consult a qualified practitioner before making significant changes to your nutrition or training programme.</p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-gray-800 mb-2">3. Accounts and subscriptions</h2>
            <p>You are responsible for keeping your account credentials secure. Subscription fees are billed in advance and are non-refundable except where required by law.</p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-gray-800 mb-2">4. Intellectual property</h2>
            <p>All content, models, and software are owned by Stewart Sports Ltd. You may not copy, reproduce, or reverse-engineer any part of the service.</p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-gray-800 mb-2">5. Limitation of liability</h2>
            <p>To the maximum extent permitted by law, Stewart Sports Ltd is not liable for any indirect, incidental, or consequential loss arising from your use of Fueling Sense.</p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-gray-800 mb-2">6. Governing law</h2>
            <p>These terms are governed by the laws of England and Wales.</p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-gray-800 mb-2">7. Contact</h2>
            <p>Questions about these terms: <a href="mailto:info@fueling-sense.com" className="text-violet-600 hover:text-violet-800 transition">info@fueling-sense.com</a></p>
          </section>

        </div>

        <CompanyInfo />
      </div>
    </main>
  );
}
