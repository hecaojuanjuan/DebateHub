import type { Metadata } from "next";
import "./globals.css";
import { requestLocale } from "@/lib/i18n/server";
import { localeTag } from "@/lib/i18n/core";

export const metadata: Metadata = {
  title: "DebateHub · UNNC Debate / 宁诺例辩",
  description:
    "每一种立场，都值得被认真听见。加入宁诺例辩社区，选择持方、交换观点，一起练习思考。",
  referrer: "no-referrer",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await requestLocale();
  return (
    <html lang={localeTag(locale)}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
