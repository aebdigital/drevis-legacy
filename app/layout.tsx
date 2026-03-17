import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drevis",
  description: "Drevis mirror",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sk">
      <body>{children}</body>
    </html>
  );
}
