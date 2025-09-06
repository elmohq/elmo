import type { Metadata } from "next";
import { Geist, Geist_Mono, Titan_One } from "next/font/google";
import { getAppConfig } from "@/lib/adapters";
import "./globals.css";
import { AppLayout } from '@/components/app-layout';


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const titan = Titan_One({
  subsets: ['latin'],
  display: 'swap',
  weight: '400',
  variable: '--font-titan',
})

export const metadata: Metadata = {
	title: {
		template: `%s - Elmo`,
		default: `Elmo - LLM Optimization`,
	}
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { providers } = getAppConfig();

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${titan.variable} antialiased`}
      >
        <providers.auth.Provider>
          <AppLayout>{children}</AppLayout>
        </providers.auth.Provider>
      </body>
    </html>
  );
}
