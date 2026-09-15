import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LM Smart | Legal Metrology Verification",
  description: "Owner portal for weighing and measuring instrument verification",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
