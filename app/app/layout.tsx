import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DebateHub · 宁诺例辩",
  description:
    "每一种立场，都值得被认真听见。加入宁诺例辩社区，选择持方、交换观点，一起练习思考。",
  referrer: "no-referrer",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
