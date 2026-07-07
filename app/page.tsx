"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, ShieldAlert, Clock, RotateCw, Sun, Moon, Type, Check, Eye, Heart } from "lucide-react";

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

export default function Home() {
  // --- 1. State Declarations ---
  const [userId, setUserId] = useState<string>("");
  const [appReady, setAppReady] = useState(false);
  const [currentStrangerMessage, setCurrentStrangerMessage] = useState<Message | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState<Message | null>(null);
  const [hasSentToday, setHasSentToday] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<number | null>(null); // milliseconds
  const [totalMessagesCount, setTotalMessagesCount] = useState<number>(STARTER_MESSAGES.length);
  const [likedMessageIds, setLikedMessageIds] = useState<Record<string, boolean>>({});

  // Readability / Accessibility States for the Message Display Card
  const [cardTheme, setCardTheme] = useState<"light" | "dark">("light");
  const [cardFontSize, setCardFontSize] = useState<"sm" | "md" | "lg">("md");

  // Form States
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportedIds, setReportedIds] = useState<string[]>([]);

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
    }, 400);
  };

  // --- 8. Reset Local Session (Sign out map) ---
  const handleResetSession = () => {
    if (confirm("Would you like to reset your local message history, statistics, and session?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  if (!appReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#fafafa] text-zinc-900 p-6">
        <div className="flex flex-col items-center space-y-4 max-w-md w-full text-center">
          <div className="text-3xl font-extrabold tracking-tight font-sans text-zinc-900 select-none">
            RP2P
          </div>
          <div className="flex flex-col items-center space-y-2">
            <div className="flex space-x-1 items-center justify-center py-2">
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-pulse" />
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse" />
            </div>
            <p className="text-[11px] font-sans font-semibold text-zinc-400 tracking-wider uppercase">
              CONNECTING TO SECURE POOL...
            </p>
          </div>
        </div>
      </div>
    );
  }

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
          <div className="text-3xl font-extrabold tracking-tight font-sans text-zinc-900 select-none">
            RP2P
          </div>
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
              >
                <Type className="w-3.5 h-3.5" />
                <span className="capitalize">{cardFontSize}</span>
              </button>
              
              <button
                onClick={toggleCardTheme}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all duration-150 rounded-lg cursor-pointer flex items-center gap-1.5 text-xs font-medium"
                title="Toggle appearance"
              >
                {cardTheme === "light" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
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
                            <Eye className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
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
                            }}
                            whileTap={{ scale: 0.85 }}
                            className={`px-3 py-1.5 rounded-full transition-all duration-150 flex items-center gap-1.5 cursor-pointer border ${
                              isLiked 
                                ? "bg-rose-50 text-rose-500 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30" 
                                : "bg-zinc-50/50 text-zinc-400 hover:text-rose-500 hover:bg-rose-50/30 border-zinc-100 hover:border-rose-100/40 dark:bg-zinc-800/30 dark:text-zinc-500 dark:hover:text-rose-400 dark:hover:bg-rose-950/10 dark:border-zinc-800/50"
                            }`}
                            title={isLiked ? "Unlike message" : "Heart message"}
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
                      className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-800 border border-zinc-100 text-xs font-medium tracking-wide transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer rounded-full"
                    >
                      <RotateCw className="w-3.5 h-3.5 stroke-[2]" />
                      <span>Next message</span>
                    </button>
                    
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
                      >
                        <ShieldAlert className="w-3.5 h-3.5 stroke-[2]" />
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
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
    </div>
  );
}
