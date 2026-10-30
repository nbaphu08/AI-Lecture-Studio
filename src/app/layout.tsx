import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SlideCraft — Turn documents into beautiful presentations",
  description: "Upload a Word document and get a professionally designed, editable PowerPoint presentation. Everything runs in your browser.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
