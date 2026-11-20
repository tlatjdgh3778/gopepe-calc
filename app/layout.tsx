import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "포지션 계산기",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="font-sans">
      <body>{children}</body>
    </html>
  );
}
