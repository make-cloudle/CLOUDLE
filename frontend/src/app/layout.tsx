import type { Metadata, Viewport } from "next";
import { Footer } from "@/widgets/footer/Footer";
import { Header } from "@/widgets/header/Header";
import { PREFS_BOOT_SCRIPT } from "@/shared/lib/prefs";
import "./globals.css";

export const metadata: Metadata = {
  title: "CLOUDLE — Make the Earth a Little Better",
  description: "버릴까 고민되는 물건의 수리·재사용·분리배출 방법을 근거와 함께 찾아주는 RAG 서비스",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#141c29" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <Header />
        <main className="mx-auto max-w-[1320px] px-4 pb-24 sm:px-8">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
