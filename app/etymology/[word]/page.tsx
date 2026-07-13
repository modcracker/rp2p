import React from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Sparkles, Check, Globe, HelpCircle } from "lucide-react";
import { Metadata } from "next";

// Define the Etymology interface
interface EtymologyData {
  word: string;
  phonetic: string;
  origin: string;
  definition: string;
  literalTranslation: string;
  history: string;
  relevance: string;
  quote: string;
  accentColor: string;
}

// Complete etymological dictionary mapping core concepts of RP2P
const ETYMOLOGIES: Record<string, EtymologyData> = {
  inspiration: {
    word: "inspiration",
    phonetic: "/ˌɪnspəˈreɪʃən/",
    origin: "Latin (inspirare)",
    definition: "The excitement of the mind or emotions to a high level of feeling or activity; a sudden brilliant, creative, or timely idea.",
    literalTranslation: "To breathe or blow into; to infuse with spirit.",
    history: "From the Latin 'in-' (into) + 'spirare' (to breathe). Historically, it described a divine influence exerted upon the human soul, breathing life and high purpose into thought. In contemporary culture, to find daily inspiration is to let new, unexpected energy flow into our consciousness.",
    relevance: "On RP2P, daily inspiration flows peer-to-peer. When you write a simple, genuine note into the anonymous pool, you breathe small bits of hope, comfort, or wisdom into a stranger's daily experience.",
    quote: "“The best way to appreciate a quiet moment is to share it anonymously.”",
    accentColor: "emerald"
  },
  reflection: {
    word: "reflection",
    phonetic: "/rɪˈflɛkʃən/",
    origin: "Latin (reflectere)",
    definition: "Serious thought, meditation, or consideration; the return of light or sound waves from a surface.",
    literalTranslation: "To bend or turn back; to look inwards.",
    history: "From the Latin prefix 're-' (back) + 'flectere' (to bend). The term originally referred to physical mirroring or rebound, but eventually evolved to represent the intellectual process of bending one's attention backwards to examine past deeds, sentiments, or the inner self.",
    relevance: "RP2P is a digital mirror of collective human sentiment. It asks you to bend your thoughts inward to draft one genuine, raw reflection, exchanging it to release a mirror of a stranger's inner mind.",
    quote: "“It's okay to slow down. The rush can wait.”",
    accentColor: "indigo"
  },
  anonymity: {
    word: "anonymity",
    phonetic: "/ˌænəˈnɪmɪti/",
    origin: "Greek (anonymia)",
    definition: "The state of being anonymous; lack of outstanding, individual, or identifying features.",
    literalTranslation: "Without a name; namelessness.",
    history: "Formed from the ancient Greek 'an-' (without) + 'onyma' (name). Namelessness has historically served as a shield of safety, a medium for forbidden truths, and a sanctuary from social performing. It levels the hierarchy of prestige, leaving only the pure weight of the message itself.",
    relevance: "RP2P strips away social credentials, avatars, and status games. It uses complete anonymity to cultivate a space of unburdened authenticity, where peers connect on the pure essence of their thoughts.",
    quote: "“What is something you're grateful for, but haven't shared with anyone?”",
    accentColor: "zinc"
  },
  reciprocity: {
    word: "reciprocity",
    phonetic: "/ˌrɛsɪˈprɒsɪti/",
    origin: "Latin (reciprocus)",
    definition: "The practice of exchanging things with others for mutual benefit, especially privileges granted by one country or organization to another.",
    literalTranslation: "Returning the same way; moving backward and forward.",
    history: "From the Latin 'reciprocus' (alternating, rising and falling like the tide), compounded from 're-' (backward) and 'pro-' (forward). It embodies a rhythmic, balanced dance of giving and receiving, ensuring that no one takes without also leaving something of value behind.",
    relevance: "The peer-to-peer (P2P) pool enforces absolute reciprocity. To read a stranger's daily reflection, you must first contribute your own. This circular model ensures the pool remains active, mutual, and sustainable.",
    quote: "“Leave a thought here for someone else to find tomorrow.”",
    accentColor: "amber"
  },
  mindfulness: {
    word: "mindfulness",
    phonetic: "/ˈmaɪndf(ə)lnəs/",
    origin: "Old English (myndung)",
    definition: "The quality or state of being conscious or aware of something; a mental state achieved by focusing one's awareness on the present moment.",
    literalTranslation: "State of keeping in mind; memory and intent observation.",
    history: "Traced to the Old English 'mynd' (mind, memory) paired with the suffix '-ness'. While deeply rooted in ancient contemplative traditions, the word historically denoted active remembrance and careful, compassionate attention directed toward current experiences without judgment.",
    relevance: "We counter 'doomscrolling' with a brief, focused moment of deliberate attention. Crafting one daily message requires pausing to examine your immediate internal state, bringing presence to digital spaces.",
    quote: "“A message to remind you to take a moment for yourself today.”",
    accentColor: "teal"
  },
  serenity: {
    word: "serenity",
    phonetic: "/sɪˈrɛnɪti/",
    origin: "Latin (serenus)",
    definition: "The state of being calm, peaceful, and untroubled; a tranquil clarity.",
    literalTranslation: "Clear, calm, untroubled sky.",
    history: "From the Latin 'serenus' (clear, fine, tranquil), originally used by Roman citizens to describe cloudless, calm weather. Over centuries, it was metaphoricalized to describe an unclouded, balanced intellect—undisturbed by transient storms of worry or social noise.",
    relevance: "RP2P offers a minimalist shelter of quiet aesthetics. With soft gray borders, zero visual clutter, and intentional negative space, the app aims to bring a sliver of serene peace to your daily routine.",
    quote: "“It's okay to slow down. The rush can wait.”",
    accentColor: "sky"
  },
  gratitude: {
    word: "gratitude",
    phonetic: "/ˈɡrætɪtjuːd/",
    origin: "Latin (gratus)",
    definition: "The quality of being thankful; readiness to show appreciation for and to return kindness.",
    literalTranslation: "Pleasing, welcome, thankful state.",
    history: "Derived from Medieval Latin 'gratitudo', from 'gratus' (pleasing, beloved, agreeable). It is not merely a passive sensation of pleasure, but an active, creative orientation toward life that acknowledges the external sources of our wellbeing and aims to pay them forward.",
    relevance: "Acknowledging a small, hidden source of joy anchors us. When you reflect on what you are grateful for and release it, you sow seeds of joy that strangers harvest anonymously.",
    quote: "“What is something you're grateful for, but haven't shared with anyone?”",
    accentColor: "rose"
  }
};

// Next.js static parameters generation for static build target
export function generateStaticParams() {
  return Object.keys(ETYMOLOGIES).map((word) => ({
    word,
  }));
}

// Next.js dynamic metadata generation
export async function generateMetadata({ params }: { params: Promise<{ word: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const wordKey = resolvedParams.word.toLowerCase();
  const data = ETYMOLOGIES[wordKey];

  if (!data) {
    return {
      title: "Etymology Dictionary | RP2P",
      description: "Explore the linguistic etymologies of mindfulness, anonymity, and shared community thoughts.",
    };
  }

  const titleWord = data.word.charAt(0).toUpperCase() + data.word.slice(1);
  return {
    title: `${titleWord} — Etymology, Origin, and Daily Meaning | RP2P`,
    description: `Learn the etymological origin of '${data.word}' (${data.origin}: ${data.literalTranslation}). See how it defines the anonymous peer-to-peer reflection loop of RP2P.`,
    keywords: [
      `${data.word} etymology`,
      `${data.word} origin`,
      `${data.word} history`,
      "word origins",
      "daily inspiration",
      "rp2p philosophy",
      "anonymous messaging",
    ],
    alternates: {
      canonical: `https://rp2p.com/etymology/${data.word}`,
    },
    openGraph: {
      title: `${titleWord} — Etymology, Origin, and Daily Meaning | RP2P`,
      description: `Learn the etymological origin of '${data.word}' (${data.origin}: ${data.literalTranslation}). See how it defines the anonymous peer-to-peer reflection loop of RP2P.`,
      url: `https://rp2p.com/etymology/${data.word}`,
      type: "article",
    },
  };
}

export default async function EtymologyPage({ params }: { params: Promise<{ word: string }> }) {
  const resolvedParams = await params;
  const wordKey = resolvedParams.word.toLowerCase();
  const data = ETYMOLOGIES[wordKey];

  // Return a beautiful, high-contrast 404/not found card if the word isn't recognized
  if (!data) {
    return (
      <main className="min-h-screen w-full flex items-center justify-center p-6 bg-[#fafafa]">
        <div id="not-found-card" className="w-full max-w-md bg-white border border-zinc-200 p-8 rounded-3xl text-center space-y-5 shadow-sm">
          <HelpCircle className="w-12 h-12 text-zinc-400 mx-auto" />
          <h1 className="text-lg font-bold text-zinc-900 tracking-tight">Etymology Entry Not Found</h1>
          <p className="text-xs text-zinc-500 leading-relaxed">
            We haven&apos;t mapped the origin of that specific word yet. Join us on the homepage to share thoughts and suggest concepts.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-full transition-all duration-150 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Pool</span>
          </Link>
        </div>
      </main>
    );
  }

  // Define dynamic accent styling based on configuration
  const bgAccentMap: Record<string, string> = {
    emerald: "bg-emerald-500",
    indigo: "bg-indigo-500",
    zinc: "bg-zinc-500",
    amber: "bg-amber-500",
    teal: "bg-teal-500",
    sky: "bg-sky-500",
    rose: "bg-rose-500",
  };

  const textAccentMap: Record<string, string> = {
    emerald: "text-emerald-600",
    indigo: "text-indigo-600",
    zinc: "text-zinc-600",
    amber: "text-amber-600",
    teal: "text-teal-600",
    sky: "text-sky-600",
    rose: "text-rose-600",
  };

  const bgLightAccentMap: Record<string, string> = {
    emerald: "bg-emerald-50/50 border-emerald-100/40",
    indigo: "bg-indigo-50/50 border-indigo-100/40",
    zinc: "bg-zinc-50/50 border-zinc-100/40",
    amber: "bg-amber-50/50 border-amber-100/40",
    teal: "bg-teal-50/50 border-teal-100/40",
    sky: "bg-sky-50/50 border-sky-100/40",
    rose: "bg-rose-50/50 border-rose-100/40",
  };

  const activeBg = bgAccentMap[data.accentColor] || "bg-zinc-900";
  const activeText = textAccentMap[data.accentColor] || "text-zinc-800";
  const activeBgLight = bgLightAccentMap[data.accentColor] || "bg-zinc-50/50 border-zinc-100/40";

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-between p-6 sm:p-12 md:p-16 bg-[#fafafa]">
      
      {/* Navigation Header */}
      <header className="w-full max-w-lg flex items-center justify-between mb-8 sm:mb-12">
        <Link
          href="/"
          className="group inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-800 transition-colors py-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Home Pool</span>
        </Link>
        <span className="text-[10px] font-mono font-bold tracking-wider text-zinc-400 bg-zinc-100 border border-zinc-200/50 px-2.5 py-0.5 rounded-full">
          ETYMOLOGY SERIES
        </span>
      </header>

      {/* Main Content Card */}
      <article id="etymology-detail-card" className="w-full max-w-lg bg-white border border-zinc-200/70 p-6 sm:p-8 rounded-3xl space-y-6 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
        
        {/* Title, phonetic representation & origin */}
        <div className="space-y-2 pb-5 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${activeBg}`} />
            <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">Linguistic History</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900 font-sans tracking-tight capitalize">
            {data.word}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-zinc-500 font-mono pt-1">
            <span className="font-sans font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded-lg">{data.phonetic}</span>
            <span>&bull;</span>
            <span className="font-semibold text-zinc-600">{data.origin}</span>
          </div>
        </div>

        {/* Translation Snippet */}
        <div className={`p-4 rounded-2xl border ${activeBgLight} space-y-1`}>
          <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">Literal Etymology</p>
          <p className={`text-sm font-bold leading-relaxed font-sans ${activeText}`}>
            &ldquo;{data.literalTranslation}&rdquo;
          </p>
        </div>

        {/* Dictionary Definition */}
        <div className="space-y-1.5">
          <h2 className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen className="w-3 h-3 stroke-[2]" />
            <span>Definition</span>
          </h2>
          <p className="text-xs text-zinc-600 font-sans leading-relaxed">
            {data.definition}
          </p>
        </div>

        {/* History narrative */}
        <div className="space-y-1.5">
          <h2 className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="w-3 h-3 stroke-[2]" />
            <span>Historical Evolution</span>
          </h2>
          <p className="text-xs text-zinc-600 font-sans leading-relaxed">
            {data.history}
          </p>
        </div>

        {/* RP2P relevance */}
        <div className="space-y-1.5 pt-2">
          <h2 className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 stroke-[2]" />
            <span>Relevance to RP2P</span>
          </h2>
          <p className="text-xs text-zinc-600 font-sans leading-relaxed">
            {data.relevance}
          </p>
        </div>

        {/* Thematic quote card */}
        <blockquote className="border-l-2 border-zinc-200 pl-4 py-1 italic text-zinc-500 text-xs font-sans leading-relaxed">
          {data.quote}
        </blockquote>

        {/* Action Button */}
        <div className="pt-4 border-t border-zinc-100 flex justify-center">
          <Link
            href="/"
            className={`w-full text-center py-3 text-white ${activeBg} hover:opacity-90 font-bold font-sans text-xs tracking-wider uppercase transition-all duration-150 active:scale-[0.98] rounded-full shadow-sm`}
          >
            Exchange a Reflection Now
          </Link>
        </div>
      </article>

      {/* Crawlable Footer Menu for SEO Spiders */}
      <footer className="w-full max-w-lg mt-12 mb-4 space-y-6 text-center select-none">
        <div className="space-y-2">
          <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
            Explore More Etymologies
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            {Object.keys(ETYMOLOGIES).map((word) => {
              const isCurrent = word === wordKey;
              return (
                <Link
                  key={word}
                  href={`/etymology/${word}`}
                  className={`text-[11px] px-3 py-1.5 rounded-full border transition-all ${
                    isCurrent
                      ? "bg-zinc-900 border-zinc-900 text-white font-bold"
                      : "bg-white border-zinc-200 text-zinc-500 hover:text-zinc-800 hover:border-zinc-300 font-medium"
                  }`}
                >
                  {word}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="pt-6 border-t border-zinc-200/40 text-[10px] text-zinc-400 font-sans leading-relaxed">
          <p>&copy; 2026 RP2P &bull; Shared Anonymous Peer-to-Peer Message Pool</p>
          <p className="mt-1">Designed for daily inspiration, mindfulness, and semantic web discovery.</p>
        </div>
      </footer>
    </main>
  );
}
