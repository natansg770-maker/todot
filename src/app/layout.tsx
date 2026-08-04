import type { Metadata } from "next";
import { Frank_Ruhl_Libre, Rubik } from "next/font/google";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
});

const frank = Frank_Ruhl_Libre({
  variable: "--font-frank",
  subsets: ["hebrew", "latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "תודות צוות | קעמפ גן ישראל משפחת השלוחים הצעירים",
  description:
    "מערכת לתיאום שיחות וסמסים של תודה לצוות קעמפ גן ישראל משפחת השלוחים הצעירים",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${rubik.variable} ${frank.variable} h-full antialiased`}
    >
      <body className="app-shell min-h-full">{children}</body>
    </html>
  );
}
