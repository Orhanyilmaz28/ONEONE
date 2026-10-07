import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f4f2ee] text-ink">{children}</div>;
}
