import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_KR } from "next/font/google";
import { Header } from "@/components/Header";
import { PREFS_BOOT_SCRIPT } from "@/lib/prefs";
import "./globals.css";

const plex = IBM_Plex_Sans_KR({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CLOUDLE",
  description: "버릴까 고민되는 물건의 수리·재사용·분리배출 방법을 근거와 함께 찾아주는 RAG 서비스",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#161714" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="light" className={plex.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <Header />
        <main className="mx-auto max-w-[1280px] px-4 pb-24 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
