import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import "@/app/[locale]/globals.css";

import Navigation from "@/components/Navigation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CoQuest",
  description: "Learn and play with CoQuest",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="antialiased min-h-screen flex flex-col bg-gray-50">
        <NextIntlClientProvider messages={messages}>
          <GoogleOAuthProvider
            clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!}
          >
            <Navigation />

            <main className="flex-grow">{children}</main>
          </GoogleOAuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
