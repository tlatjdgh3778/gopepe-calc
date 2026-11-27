import localFont from "next/font/local";
import "./globals.css";

const Pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${Pretendard.variable} dark font-sans`}>
      <body className="tabular-nums">{children}</body>
    </html>
  );
}
