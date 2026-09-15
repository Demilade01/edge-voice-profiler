import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aethex Voice Latency Profiler",
  description: "Measure latency across an Aethex WebRTC voice session.",
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
