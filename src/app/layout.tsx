import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "תודות צוות | קעמפ גן ישראל משפחת השלוחים הצעירים",
  description:
    "מערכת לתיאום שיחות וסמסים של תודה לצוות קעמפ גן ישראל משפחת השלוחים הצעירים",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <body className="app-shell min-h-full">{children}</body>
    </html>
  );
}
