import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NeroPanel",
  description: "Xtream Codes Proxy Middleware",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex h-screen bg-gray-100 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-gray-50 text-slate-900">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
