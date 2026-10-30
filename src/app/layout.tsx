import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import "./globals.css";

const display = Cormorant_Garamond({ subsets: ["latin", "vietnamese"], weight: ["300", "400", "500"], style: ["normal", "italic"], variable: "--font-display" });
const label = Jost({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-label" });

export const metadata: Metadata = {
  title: "SlideCraft — Turn documents into beautiful presentations",
  description: "Upload a Word document and get a professionally designed, editable PowerPoint presentation. Everything runs in your browser.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${label.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
