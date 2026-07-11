import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "happySenior 拍手節奏編輯器",
  description: "給銀髮族課程使用的拍手節奏與背景音樂工具，支援手機與電腦。",
  icons: { icon: "/chen-yufong-logo.png", shortcut: "/chen-yufong-logo.png" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
