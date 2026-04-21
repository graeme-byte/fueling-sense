import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fueling Sense — Sports Metabolic Calculator",
  description: "Science-based metabolic profiling + personalised substrate fueling recommendations for endurance athletes.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        {/* Google tag (gtag.js) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-9C9LS744E3"
          strategy="afterInteractive"
        />
        <Script
          id="google-analytics"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-9C9LS744E3');
            `,
          }}
        />
        {children}
        <footer className="border-t border-gray-100 bg-gray-50 py-4 text-center text-xs text-gray-400 space-y-1">
          <div>
            <Link href="/support" className="hover:text-gray-600 transition">Support</Link>
            {' · '}
            <Link href="/terms" className="hover:text-gray-600 transition">Terms</Link>
            {' · '}
            <Link href="/privacy" className="hover:text-gray-600 transition">Privacy</Link>
          </div>
          <div>Fueling Sense is operated by Stewart Sports Ltd (Company No. 07426879, UK)</div>
        </footer>
      </body>
    </html>
  );
}
