import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const viewport: Viewport = {
  themeColor: "#fafafa",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "RP2P — Anonymous Peer-to-Peer Message Exchange",
  description: "Share anonymous thoughts, reflections, and kind words with strangers. Send one message into the pool and read one from another peer, once a day.",
  keywords: [
    "rp2p",
    "anonymous messaging",
    "peer-to-peer message exchange",
    "anonymous notes",
    "thought sharing",
    "daily reflection",
    "stranger thoughts",
    "mindful reflections",
    "anonymous chat boards",
    "kindness pool",
    "daily wellness",
    "mental health breaks",
    "mindfulness habits",
    "positive psychology online",
    "mental health micro-habits",
    "anonymous journal exchange",
    "daily motivation notes"
  ],
  authors: [{ name: "RP2P Community" }],
  creator: "RP2P",
  publisher: "RP2P",
  alternates: {
    canonical: "https://rp2p.com",
  },
  openGraph: {
    title: "RP2P — Anonymous Peer-to-Peer Message Exchange",
    description: "Share anonymous thoughts, reflections, and kind words with strangers. One message. One stranger. Once a day.",
    url: "https://rp2p.com",
    siteName: "RP2P",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop",
        width: 1200,
        height: 630,
        alt: "RP2P Peer-to-Peer Message Pool Graphic Preview",
      }
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RP2P — Anonymous Peer-to-Peer Message Exchange",
    description: "Share anonymous thoughts, reflections, and kind words with strangers. One message. One stranger. Once a day.",
    images: ["https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "name": "RP2P",
        "url": "https://rp2p.com",
        "description": "An anonymous peer-to-peer message exchange. Send one thoughtful message to the pool and receive one in return, once a day.",
        "applicationCategory": "SocialNetworkingApplication",
        "operatingSystem": "All",
        "featureList": [
          "Anonymous peer-to-peer message exchange",
          "Zero tracking, offline-friendly local state",
          "Customizable presentation cards for accessibility",
          "Rate-limiting to maintain message quality"
        ],
        "offers": {
          "@type": "Offer",
          "price": "0.00",
          "priceCurrency": "USD"
        }
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Is RP2P really anonymous?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Absolutely. No cookies are shared, no IP addresses are logged, and there is no email registration. Your identity is completely hidden, and reflections are distributed randomly."
            }
          },
          {
            "@type": "Question",
            "name": "How do views and heart counts work?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Each message displays simulated propagation reach metrics based on a viral peer-to-peer modeling logic. You can tap the heart icon to express support and see its total climb."
            }
          },
          {
            "@type": "Question",
            "name": "How are inappropriate messages moderated?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "We believe in community-led standard enforcement. If a message receives three reports from peer users, it is instantly filtered out and deleted from active rotation in the pool."
            }
          }
        ]
      }
    ]
  };

  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-sans antialiased bg-[#fafafa] text-[#111111] min-h-screen">
        {children}
      </body>
    </html>
  );
}
