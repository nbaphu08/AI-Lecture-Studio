import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import "./globals.css";

const ui = Geist({ subsets: ["latin", "vietnamese"], variable: "--font-ui" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "AI Lecture Studio — Turn documents into beautiful presentations",
  description: "Upload a Word document and get a professionally designed, editable PowerPoint presentation. AI plans the slides; the PowerPoint is built in your browser.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${ui.variable} ${display.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
