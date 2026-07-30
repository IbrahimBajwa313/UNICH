import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const display = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "U-niche Perfumes ERP",
  description:
    "Professional ERP for U-niche Perfumes — POS, inventory FIFO, formulas, CRM, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
