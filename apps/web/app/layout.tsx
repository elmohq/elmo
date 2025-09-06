import type { Metadata } from "next";
import { Titan_One } from "next/font/google";
import { AppLayout } from "@/components/app-layout";
import { getAppConfig } from "@/lib/adapters";
import "@elmo/ui/globals.css";

const titan = Titan_One({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  variable: "--font-titan",
});

export const metadata: Metadata = {
  title: {
    template: "%s - Elmo",
    default: "Elmo - LLM Optimization",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { providers } = getAppConfig();

  return (
    <html lang="en">
      <body className={`${titan.variable} antialiased`}>
        <providers.auth.Provider>
          <AppLayout>{children}</AppLayout>
        </providers.auth.Provider>
      </body>
    </html>
  );
}
