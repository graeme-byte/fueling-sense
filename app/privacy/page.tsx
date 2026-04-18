import Link from 'next/link';
import CompanyInfo from '@/components/shared/CompanyInfo';

export const metadata = { title: 'Privacy Policy — Fueling Sense' };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-16">

        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 transition mb-8 block">← Back to home</Link>

        <h1 className="text-2xl font-black text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-xs text-gray-400 mb-8">Last updated: April 2026</p>

        <div className="prose prose-sm text-gray-600 space-y-6">

          <section>
            <h2 className="text-sm font-bold text-gray-800 mb-2">1. Who we are</h2>
            <p>Fueling Sense is operated by Stewart Sports Ltd (Company No. 07426879), United Kingdom. We are the data controller for information collected through this service.</p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-gray-800 mb-2">2. What we collect</h2>
            <p>We collect your email address when you create an account, physiological data you enter (power outputs, weight, body composition), and standard usage data (page views, session timestamps).</p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-gray-800 mb-2">3. How we use it</h2>
            <p>Your data is used solely to provide and improve the Fueling Sense service. We do not sell your data to third parties.</p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-gray-800 mb-2">4. Data storage</h2>
            <p>Data is stored on secure servers provided by Supabase (EU region). Payment processing is handled by Stripe. Neither provider receives your physiological data.</p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-gray-800 mb-2">5. Your rights</h2>
            <p>Under UK GDPR you have the right to access, correct, or delete your personal data at any time. To exercise these rights, contact us at <a href="mailto:info@fueling-sense.com" className="text-violet-600 hover:text-violet-800 transition">info@fueling-sense.com</a>.</p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-gray-800 mb-2">6. Cookies</h2>
            <p>We use only essential cookies required for authentication. No advertising or tracking cookies are used.</p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-gray-800 mb-2">7. Contact</h2>
            <p>Privacy enquiries: <a href="mailto:info@fueling-sense.com" className="text-violet-600 hover:text-violet-800 transition">info@fueling-sense.com</a></p>
          </section>

        </div>

        <CompanyInfo />
      </div>
    </main>
  );
}
