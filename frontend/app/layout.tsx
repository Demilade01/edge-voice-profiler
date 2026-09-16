import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://edge-voice-profiler-wheat.vercel.app";
const siteTitle = "Aethex Voice Profiler";
const siteDescription =
  "A diagnostic edge-network profiler for measuring conversational voice latency over Aethex WebRTC.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: `%s | ${siteTitle}`,
  },
  description: siteDescription,
  applicationName: siteTitle,
  category: "technology",
  keywords: [
    "Aethex",
    "voice profiler",
    "WebRTC",
    "voice latency",
    "real-time voice",
    "edge network",
  ],
  authors: [{ name: "Aethex Voice Profiler" }],
  creator: "Aethex Voice Profiler",
  publisher: "Aethex Voice Profiler",
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: siteTitle,
    description: siteDescription,
    siteName: siteTitle,
    images: [
      {
        url: "/aethex-voice-profiler.png",
        alt: "Aethex Voice Profiler",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/aethex-voice-profiler.png"],
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
