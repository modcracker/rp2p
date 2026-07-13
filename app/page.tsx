"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Send, ShieldAlert, Clock, RotateCw, Sun, Moon, Type, Check, Eye, Heart, Share2, Image as ImageIcon } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// Types
interface Message {
  id: string;
  text: string;
  senderId: string;
  createdAt: number | null; // epoch timestamp
  reports: number;
}

// Starter seed messages
const STARTER_MESSAGES = [
  "A message to remind you to take a moment for yourself today.",
  "What is something you're grateful for, but haven't shared with anyone?",
  "It's okay to slow down. The rush can wait.",
  "Leave a thought here for someone else to find tomorrow.",
  "The best way to appreciate a quiet moment is to share it anonymously."
];

// Deterministic stats generator for messages
const getMessageStats = (id: string) => {
  if (id === "system-empty" || !id) {
    return { views: 0, likes: 0, formattedViews: "0", formattedLikes: "0" };
  }
  
  // Use a simple hash of the ID to generate a consistent number
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);

  let views = 0;
  // Make roughly 1 in 4 starter/system/user messages highly reshared/viral (> 50k views)
  if (hash % 4 === 0) {
    views = 51000 + (hash % 44000); // 51K - 95K
  } else {
    views = 2100 + (hash % 6800); // 2.1K - 8.9K
  }

  // Likes are a percentage of views (between 4% and 12%)
  const likePercentage = 0.04 + ((hash % 8) / 100);
  const likes = Math.floor(views * likePercentage);

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    }
    return num.toString();
  };

  return {
    views,
    likes,
    formattedViews: formatNumber(views),
    formattedLikes: formatNumber(likes)
  };
};

// Deterministic 30-day activity data generator for Recharts
const generateActivityData = () => {
  const data = [];
  const baseDate = new Date("2026-07-12T18:00:00Z");
  for (let i = 29; i >= 0; i--) {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() - i);
    const dayStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    
    // Smooth growing trend from 120 to ~340 over 30 days
    const progress = (29 - i) / 29; // 0 to 1
    const base = 120 + progress * 220;
    // Weekly cycle wave (sin) + random noise (cos)
    const wave = Math.sin((29 - i) * 0.8) * 18;
    const noise = Math.cos((29 - i) * 1.5) * 8;
    const count = Math.round(base + wave + noise);
    data.push({
      date: dayStr,
      messages: count
    });
  }
  return data;
};

export default function Home() {
  // --- 1. State Declarations ---
  const [userId, setUserId] = useState<string>("");
  const [appReady, setAppReady] = useState(false);
  const [currentStrangerMessage, setCurrentStrangerMessage] = useState<Message | null>({
    id: "system-starter-seo",
    text: "The best way to appreciate a quiet moment is to share it anonymously.",
    senderId: "system",
    createdAt: null,
    reports: 0
  });
  const [lastUserMessage, setLastUserMessage] = useState<Message | null>(null);
  const [hasSentToday, setHasSentToday] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<number | null>(null); // milliseconds
  const [totalMessagesCount, setTotalMessagesCount] = useState<number>(STARTER_MESSAGES.length);
  const [likedMessageIds, setLikedMessageIds] = useState<Record<string, boolean>>({});

  // Readability / Accessibility States for the Message Display Card
  const [cardTheme, setCardTheme] = useState<"light" | "dark">("light");
  const [cardFontSize, setCardFontSize] = useState<"sm" | "md" | "lg">("md");

  // Sharing & Toast States
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form States
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportedIds, setReportedIds] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  // Statistics
  const [stats, setStats] = useState({
    sentCount: 0,
    receivedCount: 0
  });

  // Countdown timer reference
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- 2. Initial Setup & Seeding ---
  useEffect(() => {
    if (typeof window !== "undefined") {
      // 1. Get or generate User ID
      let savedUserId = localStorage.getItem("rp2p_user_id");
      if (!savedUserId) {
        savedUserId = `peer_${Math.random().toString(36).substring(2, 10)}`;
        localStorage.setItem("rp2p_user_id", savedUserId);
      }
      setUserId(savedUserId);

      // 2. Initialize message pool if empty
      const localPoolStr = localStorage.getItem("rp2p_pool");
      let currentPool: Message[] = [];
      if (!localPoolStr) {
        currentPool = STARTER_MESSAGES.map((text, idx) => ({
          id: `starter-${idx + 1}`,
          text,
          senderId: "system",
          createdAt: Date.now() - (5 - idx) * 3600000, // staggered times in past
          reports: 0
        }));
        localStorage.setItem("rp2p_pool", JSON.stringify(currentPool));
      } else {
        currentPool = JSON.parse(localPoolStr);
      }
      setTotalMessagesCount(currentPool.length);

      // 3. Load stats
      const savedSent = localStorage.getItem("rp2p_sent_count");
      const savedRecv = localStorage.getItem("rp2p_received_count");
      setStats({
        sentCount: parseInt(savedSent || "0", 10),
        receivedCount: parseInt(savedRecv || "0", 10)
      });

      // 4. Load card preferences
      const savedTheme = localStorage.getItem("rp2p_card_theme");
      if (savedTheme === "light" || savedTheme === "dark") {
        setCardTheme(savedTheme);
      }
      const savedSize = localStorage.getItem("rp2p_card_font_size");
      if (savedSize === "sm" || savedSize === "md" || savedSize === "lg") {
        setCardFontSize(savedSize);
      }

      // 5. Load reported IDs
      const savedReports = localStorage.getItem("rp2p_reported_ids");
      const parsedReports = savedReports ? JSON.parse(savedReports) : [];
      setReportedIds(parsedReports);

      // 5.5 Load liked message IDs
      const savedLikes = localStorage.getItem("rp2p_liked_ids");
      if (savedLikes) {
        setLikedMessageIds(JSON.parse(savedLikes));
      }

      // 6. Check cooldown / daily sent status
      const savedLastSent = localStorage.getItem("rp2p_last_sent");
      if (savedLastSent) {
        const lastSentTime = parseInt(savedLastSent, 10);
        const now = Date.now();
        const dayInMillis = 24 * 60 * 60 * 1000;
        const timePassed = now - lastSentTime;
        if (timePassed < dayInMillis) {
          setHasSentToday(true);
          const savedLastMsg = localStorage.getItem("rp2p_last_msg");
          setLastUserMessage(savedLastMsg ? JSON.parse(savedLastMsg) : { text: "Your message is active." });
          setCooldownRemaining(dayInMillis - timePassed);
        }
      }

      // 7. Get initial random message
      fetchInitialRandomMessage(savedUserId, parsedReports, currentPool);

      setAppReady(true);
      setMounted(true);
    }
  }, []);

  // --- 3. Retrieve Random Message helper ---
  const fetchInitialRandomMessage = (uid: string, reports: string[], pool: Message[]) => {
    const eligible = pool.filter(
      (msg) => msg.senderId !== uid && !reports.includes(msg.id) && msg.reports < 3
    );

    if (eligible.length > 0) {
      const randomMsg = eligible[Math.floor(Math.random() * eligible.length)];
      setCurrentStrangerMessage(randomMsg);
    } else {
      setCurrentStrangerMessage({
        id: "system-empty",
        text: "The pool is currently quiet. Write a message to share your thoughts.",
        senderId: "system",
        createdAt: null,
        reports: 0
      });
    }
  };

  const fetchRandomMessage = useCallback(() => {
    if (typeof window === "undefined") return;
    const localPoolStr = localStorage.getItem("rp2p_pool") || "[]";
    const pool: Message[] = JSON.parse(localPoolStr);
    
    const eligible = pool.filter(
      (msg) => msg.senderId !== userId && !reportedIds.includes(msg.id) && msg.reports < 3
    );

    if (eligible.length > 0) {
      // Select a message that is different from current display if possible
      let chosen = eligible[Math.floor(Math.random() * eligible.length)];
      if (eligible.length > 1 && currentStrangerMessage && chosen.id === currentStrangerMessage.id) {
        const filtered = eligible.filter(m => m.id !== currentStrangerMessage.id);
        chosen = filtered[Math.floor(Math.random() * filtered.length)];
      }
      
      setCurrentStrangerMessage(chosen);
      setStats(prev => {
        const nextStats = { ...prev, receivedCount: prev.receivedCount + 1 };
        localStorage.setItem("rp2p_received_count", nextStats.receivedCount.toString());
        return nextStats;
      });
    } else {
      setCurrentStrangerMessage({
        id: "system-empty",
        text: "The pool is currently quiet. Write a message to share your thoughts.",
        senderId: "system",
        createdAt: null,
        reports: 0
      });
    }
  }, [userId, reportedIds, currentStrangerMessage]);

  // --- 4. Preferences Handlers ---
  const toggleCardTheme = () => {
    const nextTheme = cardTheme === "light" ? "dark" : "light";
    setCardTheme(nextTheme);
    localStorage.setItem("rp2p_card_theme", nextTheme);
  };

  const cycleCardFontSize = () => {
    const nextSize = cardFontSize === "sm" ? "md" : cardFontSize === "md" ? "lg" : "sm";
    setCardFontSize(nextSize);
    localStorage.setItem("rp2p_card_font_size", nextSize);
  };

  // --- 5. Countdown Handler ---
  useEffect(() => {
    if (cooldownRemaining !== null && cooldownRemaining > 0) {
      countdownIntervalRef.current = setInterval(() => {
        setCooldownRemaining(prev => {
          if (prev === null || prev <= 1000) {
            clearInterval(countdownIntervalRef.current!);
            setHasSentToday(false);
            setLastUserMessage(null);
            localStorage.removeItem("rp2p_last_sent");
            localStorage.removeItem("rp2p_last_msg");
            return null;
          }
          return prev - 1000;
        });
      }, 1000);
    }

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [cooldownRemaining]);

  const formatCountdown = (millis: number) => {
    const totalSecs = Math.floor(millis / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    return `${hours.toString().padStart(2, "0")}h ${minutes
      .toString()
      .padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
  };

  // --- 6. Send Message ---
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || newMessage.trim().length === 0 || newMessage.length > 250) return;

    setSending(true);

    // Simulate network latency for beautiful aesthetic feel
    setTimeout(() => {
      const localPoolStr = localStorage.getItem("rp2p_pool") || "[]";
      const pool: Message[] = JSON.parse(localPoolStr);
      
      const newMsg: Message = {
        id: `user-${Date.now()}`,
        text: newMessage.trim(),
        senderId: userId,
        createdAt: Date.now(),
        reports: 0
      };

      pool.push(newMsg);
      localStorage.setItem("rp2p_pool", JSON.stringify(pool));
      localStorage.setItem("rp2p_last_sent", Date.now().toString());
      localStorage.setItem("rp2p_last_msg", JSON.stringify(newMsg));

      const updatedSentCount = stats.sentCount + 1;
      setStats(prev => ({ ...prev, sentCount: updatedSentCount }));
      localStorage.setItem("rp2p_sent_count", updatedSentCount.toString());

      setNewMessage("");
      setLastUserMessage(newMsg);
      setHasSentToday(true);
      setCooldownRemaining(24 * 60 * 60 * 1000); // 24 hour cooldown
      setTotalMessagesCount(pool.length);
      setSuccess(true);
      showToast("Your anonymous reflection was shared in the pool!");

      setTimeout(() => {
        setSuccess(false);
      }, 4000);

      setSending(false);
    }, 600);
  };

  // --- 7. Report Message ---
  const handleReportMessage = () => {
    if (!currentStrangerMessage || submittingReport) return;

    setSubmittingReport(true);
    
    setTimeout(() => {
      const localPoolStr = localStorage.getItem("rp2p_pool") || "[]";
      const pool: Message[] = JSON.parse(localPoolStr);

      const updatedPool = pool.map((msg) => {
        if (msg.id === currentStrangerMessage.id) {
          return { ...msg, reports: msg.reports + 1 };
        }
        return msg;
      });
      localStorage.setItem("rp2p_pool", JSON.stringify(updatedPool));

      const nextReports = [...reportedIds, currentStrangerMessage.id];
      setReportedIds(nextReports);
      localStorage.setItem("rp2p_reported_ids", JSON.stringify(nextReports));

      // Load next random message immediately
      const eligible = updatedPool.filter(
        (msg) => msg.senderId !== userId && !nextReports.includes(msg.id) && msg.reports < 3
      );

      if (eligible.length > 0) {
        setCurrentStrangerMessage(eligible[Math.floor(Math.random() * eligible.length)]);
      } else {
        setCurrentStrangerMessage({
          id: "system-empty",
          text: "The pool is currently quiet. Write a message to share your thoughts.",
          senderId: "system",
          createdAt: null,
          reports: 0
        });
      }

      setSubmittingReport(false);
      showToast("Reflection flagged and reported.");
    }, 400);
  };

  // --- 8. Reset Local Session (Sign out map) ---
  const handleResetSession = () => {
    if (confirm("Would you like to reset your local message history, statistics, and session?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  // --- 9. Toast and Share Helpers ---
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2500);
  };

  const generateAestheticCardBlob = (text: string, theme: "light" | "dark" = "light"): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 630;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get 2D context"));
        return;
      }

      // 1. Draw background
      if (theme === "light") {
        ctx.fillStyle = "#fafafa";
        ctx.fillRect(0, 0, 1200, 630);

        // Radial accents
        const grad1 = ctx.createRadialGradient(1100, 100, 50, 1100, 100, 400);
        grad1.addColorStop(0, "rgba(16, 185, 129, 0.08)");
        grad1.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = grad1;
        ctx.fillRect(0, 0, 1200, 630);

        const grad2 = ctx.createRadialGradient(100, 530, 50, 100, 530, 400);
        grad2.addColorStop(0, "rgba(99, 102, 241, 0.08)");
        grad2.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = grad2;
        ctx.fillRect(0, 0, 1200, 630);

        // Thin border
        ctx.strokeStyle = "rgba(24, 24, 27, 0.04)";
        ctx.lineWidth = 20;
        ctx.strokeRect(10, 10, 1180, 610);
      } else {
        ctx.fillStyle = "#121214";
        ctx.fillRect(0, 0, 1200, 630);

        // Radial accents
        const grad1 = ctx.createRadialGradient(1100, 100, 50, 1100, 100, 400);
        grad1.addColorStop(0, "rgba(244, 63, 94, 0.08)");
        grad1.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grad1;
        ctx.fillRect(0, 0, 1200, 630);

        const grad2 = ctx.createRadialGradient(100, 530, 50, 100, 530, 400);
        grad2.addColorStop(0, "rgba(139, 92, 246, 0.08)");
        grad2.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = grad2;
        ctx.fillRect(0, 0, 1200, 630);

        // Thin border
        ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
        ctx.lineWidth = 20;
        ctx.strokeRect(10, 10, 1180, 610);
      }

      // 2. Draw Header
      ctx.textBaseline = "middle";
      if (theme === "light") {
        ctx.fillStyle = "#18181b";
      } else {
        ctx.fillStyle = "#f4f4f5";
      }

      ctx.beginPath();
      ctx.arc(80, 80, 7, 0, 2 * Math.PI);
      ctx.fill();

      ctx.font = "bold 18px sans-serif";
      ctx.fillText("RP2P ANONYMOUS POOL", 102, 80);

      const tagText = "DAILY REFLECTION";
      ctx.font = "bold 13px sans-serif";
      const tagWidth = ctx.measureText(tagText).width;

      if (theme === "light") {
        ctx.fillStyle = "#f4f4f5";
        ctx.fillRect(1120 - tagWidth - 24, 62, tagWidth + 24, 36);
        ctx.fillStyle = "#71717a";
      } else {
        ctx.fillStyle = "#1e1e24";
        ctx.fillRect(1120 - tagWidth - 24, 62, tagWidth + 24, 36);
        ctx.fillStyle = "#a1a1aa";
      }
      ctx.fillText(tagText, 1120 - tagWidth - 12, 80);

      // 3. Draw Quote
      const quoteText = `“${text}”`;
      ctx.textAlign = "center";
      
      let fontSize = 42;
      if (text.length > 120) fontSize = 34;
      if (text.length > 180) fontSize = 28;

      ctx.font = `italic 500 ${fontSize}px sans-serif`;
      if (theme === "light") {
        ctx.fillStyle = "#27272a";
      } else {
        ctx.fillStyle = "#e4e4e7";
      }

      const maxWidth = 960;
      const words = quoteText.split(" ");
      const lines: string[] = [];
      let currentLine = words[0] || "";

      for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const testLine = currentLine + " " + word;
        ctx.font = `italic 500 ${fontSize}px sans-serif`;
        const width = ctx.measureText(testLine).width;
        if (width < maxWidth) {
          currentLine = testLine;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }
      lines.push(currentLine);

      const lineHeight = fontSize * 1.45;
      const totalHeight = lines.length * lineHeight;
      let startY = 315 - (totalHeight / 2) + (lineHeight / 2);

      for (let j = 0; j < lines.length; j++) {
        ctx.fillText(lines[j], 600, startY);
        startY += lineHeight;
      }

      // 4. Draw Footer
      ctx.textAlign = "left";
      ctx.font = "500 13px sans-serif";
      if (theme === "light") {
        ctx.fillStyle = "#a1a1aa";
      } else {
        ctx.fillStyle = "#71717a";
      }
      ctx.fillText("Exchange a reflection to unlock yours daily on rp2p.com 🌌", 80, 550);

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Blob generation failed"));
        }
      }, "image/png");
    });
  };

  const handleDirectShare = async (platform: "twitter" | "whatsapp" | "copy" | "native" | "copy-card") => {
    if (!currentStrangerMessage) return;

    const shareText = `“${currentStrangerMessage.text}”\n\n— Found anonymously on RP2P (Peer-to-Peer Message Pool). Exchange a reflection to unlock yours. 🌌`;
    const shareUrl = "https://rp2p.com";

    setShowShareMenu(false);

    if (platform === "copy-card") {
      try {
        const blob = await generateAestheticCardBlob(currentStrangerMessage.text, cardTheme);
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob
          })
        ]);
        showToast("Aesthetic card copied to clipboard! Paste it directly in any chat.");
      } catch (err) {
        // Fallback: download the file
        try {
          const blob = await generateAestheticCardBlob(currentStrangerMessage.text, cardTheme);
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `rp2p-reflection-${currentStrangerMessage.id}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast("Clipboard copy restricted. Aesthetic card downloaded as PNG!");
        } catch (innerErr) {
          showToast("Could not generate aesthetic card.");
        }
      }
    } else if (platform === "copy") {
      try {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        showToast("Quote copied to clipboard!");
      } catch (err) {
        showToast("Failed to copy. Please copy manually!");
      }
    } else if (platform === "twitter") {
      const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
      window.open(xUrl, "_blank", "noopener,noreferrer");
      showToast("Opened Twitter sharing page!");
    } else if (platform === "whatsapp") {
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + "\n" + shareUrl)}`;
      window.open(waUrl, "_blank", "noopener,noreferrer");
      showToast("Opened WhatsApp sharing page!");
    } else if (platform === "native") {
      if (navigator.share) {
        try {
          const blob = await generateAestheticCardBlob(currentStrangerMessage.text, cardTheme);
          const file = new File([blob], "rp2p-aesthetic-card.png", { type: "image/png" });
          
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: "RP2P Anonymous Reflection",
              text: shareText,
              files: [file],
            });
            showToast("Shared aesthetic card successfully!");
          } else {
            await navigator.share({
              title: "RP2P Anonymous Reflection",
              text: shareText,
              url: shareUrl,
            });
            showToast("Shared successfully!");
          }
        } catch (error) {
          if (error instanceof Error && error.name !== "AbortError") {
            try {
              await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
              showToast("Quote copied to clipboard!");
            } catch (err) {
              showToast("Failed to copy quote.");
            }
          }
        }
      } else {
        try {
          await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
          showToast("Quote copied to clipboard!");
        } catch (err) {
          showToast("Failed to copy quote.");
        }
      }
    }
  };

  // Card themes helper variables
  const fontSizeClass = 
    cardFontSize === "sm" ? "text-sm sm:text-base font-normal leading-relaxed" :
    cardFontSize === "lg" ? "text-lg sm:text-xl font-normal leading-relaxed" :
    "text-base sm:text-lg font-normal leading-relaxed";

  const cardBgClass = cardTheme === "light" 
    ? "relative bg-white text-zinc-800 border border-zinc-200/80 rounded-2xl" 
    : "relative bg-zinc-900 text-zinc-100 border border-zinc-800/80 rounded-2xl";

  const cardShadow = cardTheme === "light"
    ? "0 10px 30px -5px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.01)"
    : "0 10px 30px -5px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.1)";

  const cardLineClass = cardTheme === "light"
    ? "absolute top-0 left-0 w-full h-1 bg-zinc-100"
    : "absolute top-0 left-0 w-full h-1 bg-zinc-800";

  const cardTextClass = cardTheme === "light"
    ? "text-zinc-800"
    : "text-zinc-100";

  const cardDividerClass = cardTheme === "light"
    ? "flex flex-col sm:flex-row sm:items-center justify-between border-t border-zinc-100 pt-5 mt-4 text-xs text-zinc-400 font-medium tracking-wide gap-4"
    : "flex flex-col sm:flex-row sm:items-center justify-between border-t border-zinc-800 pt-5 mt-4 text-xs text-zinc-500 font-medium tracking-wide gap-4";

  return (
    <div className="min-h-screen flex flex-col justify-between py-12 px-6 sm:px-12 max-w-4xl mx-auto selection:bg-zinc-100 selection:text-zinc-900 bg-[#fafafa]">
      {/* --- HEADER --- */}
      <header className="flex flex-col items-center text-center space-y-3 mb-8">
        <div className="flex items-center space-y-1 flex-col">
          <h1 className="text-3xl font-extrabold tracking-tight font-sans text-zinc-900 select-none">
            RP2P
          </h1>
          <p className="text-sm font-medium text-zinc-500 font-sans">
            An anonymous peer-to-peer message exchange.
          </p>
        </div>
      </header>

      {/* --- MAIN STAGE --- */}
      <main className="flex-grow flex flex-col items-center justify-center space-y-12 w-full max-w-lg mx-auto">
        {/* Status bar */}
        <div className="w-full bg-zinc-50 border border-zinc-200/60 rounded-xl p-3.5 text-xs text-zinc-600 font-sans font-medium text-center flex items-center justify-center gap-2 shadow-xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-500"></span>
          </span>
          <span>Running in <strong className="font-semibold text-zinc-800">Local Sandbox Mode</strong>. Your messages are private and stored locally.</span>
        </div>

        {/* SECTION A: STRANGER CARD */}
        <div className="w-full">
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-xs text-zinc-500 font-sans font-medium flex items-center gap-1.5 select-none">
              Random Message
            </p>
            
            {/* Display Settings */}
            <div className="flex items-center gap-2">
              <button
                onClick={cycleCardFontSize}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all duration-150 rounded-lg cursor-pointer flex items-center gap-1.5 text-xs font-medium"
                title="Adjust text size"
                aria-label={`Adjust card text size, current size is ${cardFontSize}`}
              >
                <Type className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="capitalize">{cardFontSize}</span>
              </button>
              
              <button
                onClick={toggleCardTheme}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all duration-150 rounded-lg cursor-pointer flex items-center gap-1.5 text-xs font-medium"
                title="Toggle appearance"
                aria-label={`Toggle message card theme, current theme is ${cardTheme}`}
              >
                {cardTheme === "light" ? <Moon className="w-3.5 h-3.5" aria-hidden="true" /> : <Sun className="w-3.5 h-3.5" aria-hidden="true" />}
                <span className="capitalize">{cardTheme}</span>
              </button>
            </div>
          </div>
          
          <AnimatePresence mode="wait">
            {currentStrangerMessage && (
              <motion.div
                key={currentStrangerMessage.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35 }}
                className={`relative p-8 sm:p-10 rounded-2xl min-h-[220px] flex flex-col justify-between overflow-hidden transition-all duration-150 ${cardBgClass}`}
                style={{ 
                  boxShadow: cardShadow
                }}
              >
                <div className={`absolute top-0 left-0 w-full h-1 transition-colors duration-150 ${cardLineClass}`}></div>
 
                {/* Visual view counter, progress bar and interactive fake heart button */}
                {(() => {
                  const msgStats = getMessageStats(currentStrangerMessage.id);
                  const isLiked = !!likedMessageIds[currentStrangerMessage.id];
                  const displayLikesCount = msgStats.likes + (isLiked ? 1 : 0);
                  const formattedDisplayLikes = displayLikesCount >= 1000 
                    ? (displayLikesCount / 1000).toFixed(1).replace(/\.0$/, "") + "K" 
                    : displayLikesCount.toString();
                  // Scale view progress relative to 100k views max
                  const progressPercent = Math.min(100, Math.max(10, Math.round((msgStats.views / 100000) * 100)));
                  
                  return (
                    <div className="flex flex-col gap-2 border-b border-zinc-100 dark:border-zinc-800/40 pb-4 mb-4 select-none">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1.5 text-[11px] font-sans font-bold tracking-wider text-zinc-400 dark:text-zinc-500 uppercase">
                            <Eye className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
                            <span>{msgStats.formattedViews} Views</span>
                          </span>
                        </div>
                        
                        {currentStrangerMessage.id !== "system-empty" && (
                          <motion.button
                            onClick={(e) => {
                              e.stopPropagation();
                              const nextLikes = {
                                ...likedMessageIds,
                                [currentStrangerMessage.id]: !isLiked
                              };
                              setLikedMessageIds(nextLikes);
                              localStorage.setItem("rp2p_liked_ids", JSON.stringify(nextLikes));
                              showToast(!isLiked ? "Added support to reflection!" : "Removed support.");
                            }}
                            whileTap={{ scale: 0.85 }}
                            className={`px-3 py-1.5 rounded-full transition-all duration-150 flex items-center gap-1.5 cursor-pointer border ${
                              isLiked 
                                ? "bg-rose-50 text-rose-500 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30" 
                                : "bg-zinc-50/50 text-zinc-400 hover:text-rose-500 hover:bg-rose-50/30 border-zinc-100 hover:border-rose-100/40 dark:bg-zinc-800/30 dark:text-zinc-500 dark:hover:text-rose-400 dark:hover:bg-rose-950/10 dark:border-zinc-800/50"
                            }`}
                            title={isLiked ? "Unlike message" : "Heart message"}
                            aria-label={isLiked ? `Remove love support for message. Supported by ${formattedDisplayLikes} users` : `Give love support for message. Supported by ${formattedDisplayLikes} users`}
                          >
                            <motion.div
                              animate={{ 
                                scale: isLiked ? [1, 1.4, 1] : 1,
                                rotate: isLiked ? [0, 15, -15, 0] : 0
                              }}
                              transition={{ duration: 0.35 }}
                            >
                              <Heart 
                                className={`w-3.5 h-3.5 ${isLiked ? "fill-rose-500 dark:fill-rose-400 stroke-rose-500 dark:stroke-rose-400" : "stroke-current"}`} 
                                aria-hidden="true"
                              />
                            </motion.div>
                            <span className="text-xs font-semibold font-mono tracking-tight leading-none">
                              {formattedDisplayLikes}
                            </span>
                          </motion.button>
                        )}
                      </div>
                      
                      {/* Reach Velocity Progress Bar */}
                      <div className="space-y-1">
                        <div className="h-1 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <motion.div 
                            className={`h-full rounded-full ${
                              msgStats.views > 50000 
                                ? "bg-gradient-to-r from-amber-400 to-rose-400" 
                                : "bg-gradient-to-r from-zinc-300 to-zinc-400 dark:from-zinc-700 dark:to-zinc-600"
                            }`}
                            initial={{ width: 0 }}
                            animate={{ width: `${progressPercent}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[9px] font-sans font-bold tracking-wider uppercase">
                          <span className="text-zinc-400/80 dark:text-zinc-500">Peer Propagation</span>
                          <span className={msgStats.views > 50000 ? "text-amber-500 dark:text-amber-400 animate-pulse" : "text-zinc-400/80 dark:text-zinc-500"}>
                            {msgStats.views > 50000 ? "🔥 Reshared / Viral Reach" : "Standard Reach"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
 
                {/* Message Text */}
                <div className="my-auto py-4">
                  <p className={`${fontSizeClass} ${cardTextClass} break-words transition-colors duration-150`}>
                    &ldquo;{currentStrangerMessage.text}&rdquo;
                  </p>
                </div>
 
                {/* Message Footer */}
                <div className={`transition-colors duration-150 ${cardDividerClass}`}>
                  <span className="flex items-center gap-1.5 select-none text-xs text-zinc-400 font-medium">
                    {currentStrangerMessage.createdAt 
                      ? "Active Message"
                      : "System Message"}
                  </span>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={fetchRandomMessage}
                      title="Show another message"
                      aria-label="Load next random anonymous message from the pool"
                      className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-800 border border-zinc-100 text-xs font-medium tracking-wide transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer rounded-full"
                    >
                      <RotateCw className="w-3.5 h-3.5 stroke-[2]" aria-hidden="true" />
                      <span>Next message</span>
                    </button>
                    
                    {currentStrangerMessage.id !== "system-empty" && (
                      <div className="relative">
                        <button
                          onClick={() => setShowShareMenu(!showShareMenu)}
                          title="Share this reflection"
                          aria-label="Open sharing options menu"
                          aria-expanded={showShareMenu}
                          className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-800 border border-zinc-100 text-xs font-medium tracking-wide transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer rounded-full"
                        >
                          <Share2 className="w-3.5 h-3.5 stroke-[2]" aria-hidden="true" />
                          <span>Share</span>
                        </button>
                        
                        <AnimatePresence>
                          {showShareMenu && (
                            <>
                              {/* Overlay to handle close-on-click-outside */}
                              <div 
                                className="fixed inset-0 z-40 bg-transparent" 
                                onClick={() => setShowShareMenu(false)}
                              />
                              
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                className="absolute bottom-full mb-2 right-0 bg-white dark:bg-zinc-900 border border-zinc-200/85 dark:border-zinc-800 p-2 rounded-xl shadow-lg w-48 z-50 space-y-1"
                              >
                                <button
                                  onClick={() => handleDirectShare("twitter")}
                                  className="w-full text-left px-3 py-2 text-[11px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 cursor-pointer border-none"
                                >
                                  <svg className="w-3 h-3 fill-current text-zinc-800 dark:text-zinc-200" viewBox="0 0 24 24">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                  </svg>
                                  <span>Share on X</span>
                                </button>
                                <button
                                  onClick={() => handleDirectShare("whatsapp")}
                                  className="w-full text-left px-3 py-2 text-[11px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 cursor-pointer border-none"
                                >
                                  <svg className="w-3 h-3 fill-current text-emerald-500" viewBox="0 0 24 24">
                                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.413 9.863-9.864.001-2.641-1.023-5.123-2.885-6.987C16.59 1.892 14.113.864 11.472.864 6.033.864 1.61 5.28 1.607 10.72c-.001 1.738.452 3.431 1.312 4.93L1.93 21.03l5.541-1.455c1.47.801 3.105 1.222 4.773 1.221l.004-.002z" />
                                  </svg>
                                  <span>Share on WhatsApp</span>
                                </button>
                                <button
                                  onClick={() => handleDirectShare("copy")}
                                  className="w-full text-left px-3 py-2 text-[11px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 cursor-pointer border-none"
                                >
                                  <Check className="w-3 h-3 stroke-[2] text-zinc-500" />
                                  <span>Copy Quote & Link</span>
                                </button>
                                <button
                                  onClick={() => handleDirectShare("copy-card")}
                                  className="w-full text-left px-3 py-2 text-[11px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 cursor-pointer border-none"
                                >
                                  <ImageIcon className="w-3 h-3 stroke-[2] text-zinc-500" aria-hidden="true" />
                                  <span>Copy Aesthetic Card Link</span>
                                </button>
                                {typeof navigator !== "undefined" && navigator.share && (
                                  <button
                                    onClick={() => handleDirectShare("native")}
                                    className="w-full text-left px-3 py-2 text-[11px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 cursor-pointer border-none"
                                  >
                                    <Share2 className="w-3 h-3 stroke-[2] text-zinc-500" />
                                    <span>System Share Menu</span>
                                  </button>
                                )}
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                    
                    {currentStrangerMessage.id !== "system-empty" && (
                      <button
                        onClick={handleReportMessage}
                        disabled={submittingReport || reportedIds.includes(currentStrangerMessage.id)}
                        className={`px-3 py-1.5 transition-all duration-150 flex items-center gap-1.5 cursor-pointer rounded-full text-xs font-medium ${
                          reportedIds.includes(currentStrangerMessage.id)
                            ? "bg-red-50 text-red-500 border border-transparent"
                            : "bg-transparent text-zinc-400 hover:text-red-500 hover:bg-red-50/50"
                        }`}
                        title="Flag inappropriate message"
                        aria-label={reportedIds.includes(currentStrangerMessage.id) ? "Message has been flagged and reported" : "Flag and report inappropriate message"}
                      >
                        <ShieldAlert className="w-3.5 h-3.5 stroke-[2]" aria-hidden="true" />
                        <span>{reportedIds.includes(currentStrangerMessage.id) ? "Reported" : "Report"}</span>
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* SECTION B: COMPOSER OR COOLDOWN */}
        <div className="w-full">
          <AnimatePresence mode="wait">
            {success ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-white border border-zinc-200 p-8 rounded-2xl text-center space-y-4 shadow-sm"
              >
                <div className="w-10 h-10 bg-zinc-50 border border-zinc-100 rounded-full flex items-center justify-center mx-auto text-zinc-600">
                  <Check className="w-4 h-4 stroke-[1.5]" />
                </div>
                <h3 className="text-base font-semibold text-zinc-800 tracking-tight font-sans">Message Sent</h3>
                <p className="text-xs text-zinc-500 font-medium leading-relaxed font-sans">
                  Your anonymous message has been added to the pool and will be shown to a random peer tomorrow.
                </p>
              </motion.div>
            ) : hasSentToday ? (
              <motion.div
                key="cooldown"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-white border border-zinc-200 p-6 sm:p-8 rounded-2xl flex flex-col items-center text-center space-y-5 shadow-sm"
              >
                <div className="p-3 bg-zinc-50 border border-zinc-100 rounded-full text-zinc-500">
                  <Clock className="w-5 h-5 stroke-[1.5] animate-pulse" />
                </div>
                
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-zinc-800 font-sans">You have shared your message today.</h3>
                  <p className="text-xs text-zinc-500 font-medium leading-relaxed max-w-sm font-sans">
                    To keep sharing meaningful, you can send one anonymous message every 24 hours.
                  </p>
                </div>

                {cooldownRemaining !== null && (
                  <div className="space-y-1 bg-zinc-50 px-5 py-2.5 rounded-xl border border-zinc-100 inline-block">
                    <span className="text-[10px] text-zinc-400 font-sans font-medium block">
                      Next message in
                    </span>
                    <span className="text-xl font-bold font-sans text-zinc-800 tracking-tight">
                      {formatCountdown(cooldownRemaining)}
                    </span>
                  </div>
                )}

                {lastUserMessage && (
                  <div className="w-full border-t border-zinc-100 pt-5 text-left mt-2">
                    <p className="text-xs text-zinc-400 font-sans font-medium mb-2">
                      Your message today:
                    </p>
                    <div className="p-4 bg-zinc-50/50 border border-zinc-100/80 rounded-xl text-xs text-zinc-600 font-medium break-words leading-relaxed">
                      &ldquo;{lastUserMessage.text}&rdquo;
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.form
                key="composer"
                onSubmit={handleSendMessage}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: "easeInOut" }}
                className="flex flex-col space-y-4"
              >
                <div>
                  <label htmlFor="newMessageText" className="text-xs text-zinc-500 font-sans font-medium mb-2 block">
                    Write your anonymous message
                  </label>
                  
                  <div className="relative">
                    <textarea
                      id="newMessageText"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value.slice(0, 250))}
                      placeholder="Type a thoughtful message to share with a random person tomorrow..."
                      rows={4}
                      className="w-full bg-white border border-zinc-200 rounded-2xl p-5 text-sm font-medium leading-relaxed text-zinc-700 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400/10 transition-all resize-none font-sans shadow-sm"
                    />
                    
                    <div className="absolute bottom-4 right-4 text-xs font-sans font-medium text-zinc-400 bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded-full select-none">
                      <span className={newMessage.length >= 240 ? "text-red-500 font-semibold" : "text-zinc-500"}>
                        {newMessage.length}
                      </span>
                      {" "}/ 250
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={sending || newMessage.trim().length === 0}
                  className="w-full py-3 px-5 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-50 disabled:text-zinc-400 disabled:border-zinc-200 text-white rounded-xl font-sans text-xs font-medium transition-all duration-150 flex items-center justify-center space-x-2 border border-zinc-900 cursor-pointer disabled:cursor-not-allowed shadow-sm hover:shadow"
                >
                  {sending ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin stroke-[2]" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5 stroke-[2]" />
                      <span>Send message</span>
                    </>
                  )}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* --- HOW IT WORKS / SEO RICH CONTENT SECTION --- */}
      <article className="mt-20 pt-16 border-t border-zinc-200/60 w-full max-w-lg mx-auto space-y-12 select-none">
        <section aria-labelledby="how-it-works-heading" className="space-y-8">
          <div className="space-y-3 text-center">
            <h2 id="how-it-works-heading" className="text-xl font-extrabold tracking-tight text-zinc-900 font-sans">
              How RP2P Works
            </h2>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed font-sans font-medium">
              RP2P is a mindful, zero-tracking, peer-to-peer message pool designed for authentic, anonymous human connection.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5">
            <section className="p-5 bg-white border border-zinc-200/60 rounded-2xl space-y-2 shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.02)] transition-all">
              <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider font-sans flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-600 font-mono">1</span>
                Balanced 1-for-1 Exchange
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed font-sans font-medium">
                To read a message from a stranger, you must first share a thoughtful reflection of your own. This balanced exchange ratio maintains reciprocity and prevents mindless scroll habits.
              </p>
            </section>

            <section className="p-5 bg-white border border-zinc-200/60 rounded-2xl space-y-2 shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.02)] transition-all">
              <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider font-sans flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-600 font-mono">2</span>
                Daily Thoughtful Rhythm
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed font-sans font-medium">
                You can send exactly one anonymous message into the pool every 24 hours. This structured cooldown encourages high-quality, intentional reflection rather than rapid, fleeting texting.
              </p>
            </section>

            <section className="p-5 bg-white border border-zinc-200/60 rounded-2xl space-y-2 shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.02)] transition-all">
              <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider font-sans flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-600 font-mono">3</span>
                Complete Sandbox Privacy
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed font-sans font-medium">
                RP2P operates entirely within a secure local sandbox environment. There are no tracking pixels, profiles, server databases, or advertising trackers. Your thoughts stay on your device.
              </p>
            </section>
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="pt-4 space-y-6">
          <h2 id="faq-heading" className="text-sm font-bold text-zinc-900 text-center font-sans tracking-tight">
            Frequently Asked Questions
          </h2>

          {/* --- RECENT GLOBAL MOOD & DAILY INSPIRATION SNIPPET (SEO & ENGAGEMENT) --- */}
          <section aria-labelledby="global-mood-heading" className="p-5 bg-zinc-50 border border-zinc-200/80 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200/50 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <h3 id="global-mood-heading" className="text-xs font-bold text-zinc-800 uppercase tracking-wider font-sans">
                  Recent Global Mood &amp; Daily Inspiration
                </h3>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-100/80 border border-zinc-200/30 px-2 py-0.5 rounded-full">
                July 2026 Edition
              </span>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] text-zinc-500 font-sans leading-relaxed">
                We track positive global trends to foster daily inspiration. Today&apos;s verified uplifting news headline highlights a milestone in global sustainability and renewable energy:
              </p>
              
              <div className="p-3.5 bg-white border border-zinc-200/60 rounded-xl space-y-2.5">
                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100/50 px-2 py-0.5 rounded-full uppercase tracking-wider font-sans">
                  Positive Headline of the Day
                </span>
                <p className="text-xs font-bold text-zinc-800 leading-relaxed font-sans">
                  &ldquo;Switzerland turns its train tracks into solar power generators, pioneering a new wave of clean energy infrastructure.&rdquo;
                </p>
                <p className="text-[10px] text-zinc-400 font-sans">
                  Source: Good News Network &bull; Verified July 12, 2026
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-3 bg-white border border-zinc-100 rounded-xl">
                  <span className="text-base">📈</span>
                  <p className="text-[10px] font-bold text-zinc-800 font-sans mt-1">Green Economy</p>
                  <p className="text-[9px] text-zinc-500 font-sans font-medium">Surpasses $10 Trillion</p>
                </div>
                <div className="p-3 bg-white border border-zinc-100 rounded-xl">
                  <span className="text-base">✨</span>
                  <p className="text-[10px] font-bold text-zinc-800 font-sans mt-1">Teen Optimism</p>
                  <p className="text-[9px] text-zinc-500 font-sans font-medium">Poetry study shows rise</p>
                </div>
              </div>
              
              {/* User Interaction: Submit/Rate Mood */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 border-t border-zinc-200/40 gap-2">
                <span className="text-[10px] text-zinc-500 font-sans font-medium">How is your personal vibe today?</span>
                <div className="flex flex-wrap gap-1">
                  {["🌱 Hopeful", "✨ Inspired", "💤 Quiet", "🔋 Focused"].map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        showToast(`Voted: ${m}! Thank you for contributing to the collective mood.`);
                      }}
                      className="px-2 py-1 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg text-[10px] text-zinc-600 font-medium transition-all active:scale-95 cursor-pointer"
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
          
          <div className="space-y-4 text-xs font-sans">
            <div className="space-y-1.5">
              <h3 className="font-bold text-zinc-800">Is RP2P really anonymous?</h3>
              <p className="text-zinc-500 leading-relaxed font-medium">
                Absolutely. No cookies are shared, no IP addresses are logged, and there is no email registration. Your identity is completely hidden, and reflections are distributed randomly.
              </p>
            </div>
            
            <div className="space-y-1.5">
              <h3 className="font-bold text-zinc-800">How do views and heart counts work?</h3>
              <p className="text-zinc-500 leading-relaxed font-medium">
                Each message displays simulated propagation reach metrics based on a viral peer-to-peer modeling logic. You can tap the heart icon to express support and see its total climb.
              </p>
            </div>

            <div className="space-y-1.5">
              <h3 className="font-bold text-zinc-800">How are inappropriate messages moderated?</h3>
              <p className="text-zinc-500 leading-relaxed font-medium">
                We believe in community-led standard enforcement. If a message receives three reports from peer users, it is instantly filtered out and deleted from active rotation in the pool.
              </p>
            </div>

            <div className="space-y-2.5 pt-4.5 border-t border-zinc-200/40">
              <h3 className="font-bold text-zinc-800">What is the philosophy behind our core terms?</h3>
              <p className="text-zinc-500 leading-relaxed font-medium pb-1">
                RP2P is built on deep humanistic principles. Discover the etymology and historical journey of our core concepts:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { word: "inspiration", emoji: "🌱" },
                  { word: "reflection", emoji: "✨" },
                  { word: "anonymity", emoji: "🔒" },
                  { word: "reciprocity", emoji: "🔄" },
                  { word: "mindfulness", emoji: "🔋" },
                  { word: "serenity", emoji: "🌌" },
                  { word: "gratitude", emoji: "💖" }
                ].map((item) => (
                  <Link
                    key={item.word}
                    href={`/etymology/${item.word}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-zinc-100 border border-zinc-200/80 rounded-xl text-[10px] text-zinc-700 font-bold transition-all hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                  >
                    <span>{item.emoji}</span>
                    <span className="capitalize">{item.word}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      </article>

      {/* --- COMMUNITY ACTIVITY FLOW CHART (RECHARTS) --- */}
      <section className="mt-12 w-full max-w-lg mx-auto bg-white border border-zinc-200/60 rounded-2xl p-5 space-y-4 shadow-[0_2px_8px_rgba(0,0,0,0.01)] select-none">
        <div className="flex items-center justify-between">
          <div className="text-left space-y-0.5">
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider font-sans">
              Community Activity Flow
            </h3>
            <p className="text-[10px] text-zinc-400 font-sans font-medium">
              Daily volume of anonymous reflections shared over the last 30 days
            </p>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100/50 px-2 py-0.5 rounded-full uppercase tracking-wider font-sans">
              Active Growth
            </span>
          </div>
        </div>

        <div className="h-28 w-full font-mono text-[9px] text-zinc-400">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={generateActivityData()}
                margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#18181b" stopOpacity={0.08}/>
                    <stop offset="95%" stopColor="#18181b" stopOpacity={0.01}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  stroke="currentColor" 
                  fontSize={8}
                  tickLine={false}
                  axisLine={false}
                  dy={5}
                />
                <YAxis 
                  stroke="currentColor" 
                  fontSize={8}
                  tickLine={false}
                  axisLine={false}
                  dx={-5}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-zinc-900 text-zinc-100 border border-zinc-800 px-2.5 py-1.5 rounded-xl text-[9px] font-bold font-sans shadow-md">
                          <p className="text-zinc-400">{payload[0].payload.date}</p>
                          <p className="text-emerald-400 mt-0.5">{payload[0].value} reflections shared</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="messages"
                  stroke="#18181b"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#colorMessages)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-300">
              Loading activity metrics...
            </div>
          )}
        </div>
      </section>

      {/* --- FOOTER & METRICS --- */}
      <footer className="mt-16 flex flex-col items-center justify-center space-y-6 text-center text-xs font-sans text-zinc-500">
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-400 select-none">
          <span>Active minds: <strong className="font-semibold text-zinc-600">{totalMessagesCount}</strong></span>
          <span className="text-zinc-200">•</span>
          <span>Messages sent: <strong className="font-semibold text-zinc-600">{stats.sentCount}</strong></span>
          <span className="text-zinc-200">•</span>
          <span>Messages read: <strong className="font-semibold text-zinc-600">{stats.receivedCount}</strong></span>
        </div>

        <div className="max-w-xs text-xs text-zinc-400 leading-relaxed font-normal">
          A minimal text space. No profiles, no trackers, no social features. Just one anonymous message shared per day.
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-400 font-sans font-medium">
          <span>Logged in as <strong className="font-medium text-zinc-600">{userId ? userId : "guest"}</strong></span>
          <span className="text-zinc-200">•</span>
          <button 
            onClick={handleResetSession}
            className="hover:text-red-500 hover:underline transition-colors cursor-pointer"
          >
            Reset Session
          </button>
        </div>

        <div className="flex items-center justify-center gap-6 text-[11px] text-zinc-400 font-sans font-medium border-t border-zinc-200/40 w-full max-w-md pt-6">
          <a 
            href="https://evu.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-zinc-600 transition-colors"
          >
            An EVU Venture
          </a>
          <span className="text-zinc-200">•</span>
          <a 
            href="https://feelize.com/go" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-zinc-600 transition-colors"
          >
            Website by Feelize
          </a>
        </div>
      </footer>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] font-bold px-4.5 py-2.5 rounded-full shadow-lg z-50 flex items-center gap-2 border border-zinc-800 dark:border-zinc-200"
          >
            <Check className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 stroke-[2.5]" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
