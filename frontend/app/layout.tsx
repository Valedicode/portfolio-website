import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const TITLE = "Kevin Ha — Multi-Agent Systems & ML";
const DESCRIPTION =
  "Portfolio of Kevin Ha, Computer Science M.Sc. student at RWTH Aachen building multi-agent and LLM-based systems. Ask the on-page agents about his work.";

// Link previews (LinkedIn, Slack, X). The preview image comes from
// app/opengraph-image.tsx; on Vercel, Next.js resolves its absolute URL from
// the production domain automatically.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/**
 * Applies the saved theme before first paint to avoid a flash of the
 * wrong theme. Dark is the default; only "light" is stored explicitly.
 */
const themeInitScript = `try{if(localStorage.getItem("theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
