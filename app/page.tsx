"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  writeBatch
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { handleFirestoreError, OperationType } from "@/lib/firebase-errors";
import { motion, AnimatePresence } from "motion/react";
import { Send, Eye, ShieldAlert, Heart, Info, Clock, RotateCw, AlertTriangle, ArrowRight, Lock, Sun, Moon, Type } from "lucide-react";

// Types
interface Message {
  id: string;
  text: string;
  senderId: string;
  createdAt: Timestamp | null;
  reports: number;
  randomId: number;
}

// Starter seed messages
const STARTER_MESSAGES = [
  "A message to remind you to take a moment for yourself today.",
  "What is something you're grateful for, but haven't shared with anyone?",
  "It's okay to slow down. The rush can wait.",
  "Leave a thought here for someone else to find tomorrow.",
  "The best way to appreciate a quiet moment is to share it anonymously."
];

export default function Home() {
  // --- 1. State & Ref Declarations (Grouped at the top) ---
  const [user, setUser] = useState<User | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("Connecting...");

  // Sign In states
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // App States
  const [currentStrangerMessage, setCurrentStrangerMessage] = useState<Message | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState<Message | null>(null);
  const [hasSentToday, setHasSentToday] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<number | null>(null); // milliseconds
  const [totalMessagesCount, setTotalMessagesCount] = useState<number | null>(null);

  // Readability / Accessibility States for the Message Display Card
  const [cardTheme, setCardTheme] = useState<"light" | "dark">("light");
  const [cardFontSize, setCardFontSize] = useState<"sm" | "md" | "lg">("md");

  // Form States
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportedIds, setReportedIds] = useState<string[]>([]);

  // Local state for statistics (fun little footer features)
  const [stats, setStats] = useState({
    sentCount: 0,
    receivedCount: 0
  });

  // Countdown timer reference
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- 2. Callback & Event Handlers ---
  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setSignInError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google sign in failed:", error);
      setSignInError(error instanceof Error ? error.message : String(error));
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      if (!isGuestMode) {
        await signOut(auth);
      }
      // Reset all user-specific states
      setUser(null);
      setIsGuestMode(false);
      setHasSentToday(false);
      setLastUserMessage(null);
      setCurrentStrangerMessage(null);
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  const enterGuestMode = useCallback(async () => {
    setIsGuestMode(true);
    setInitError(null);
    setAppReady(false);
    setLoadingMessage("Entering Guest Mode...");
    
    // Simulate slight loading for beautiful polish
    setTimeout(async () => {
      const guestUser = {
        uid: "guest-user-id",
        email: "guest@pool.local",
      } as User;
      
      setUser(guestUser);
      
      // Initialize guest pool if not present
      if (typeof window !== "undefined") {
        const localPool = localStorage.getItem("rp2p_guest_pool");
        if (!localPool) {
          const initialPool = STARTER_MESSAGES.map((text, idx) => ({
            id: `g-starter-${idx + 1}`,
            text,
            senderId: "system",
            createdAt: null,
            reports: 0,
            randomId: Math.random()
          }));
          localStorage.setItem("rp2p_guest_pool", JSON.stringify(initialPool));
        }
      }
      
      // Load guest states
      const localPoolStr = localStorage.getItem("rp2p_guest_pool") || "[]";
      const localPool = JSON.parse(localPoolStr);
      setTotalMessagesCount(localPool.length);
      
      const savedLastSent = localStorage.getItem("rp2p_guest_last_sent");
      if (savedLastSent) {
        const lastSentTime = parseInt(savedLastSent, 10);
        const now = Date.now();
        const dayInMillis = 24 * 60 * 60 * 1000;
        const timePassed = now - lastSentTime;
        if (timePassed < dayInMillis) {
          setHasSentToday(true);
          const savedLastMsg = localStorage.getItem("rp2p_guest_last_msg");
          setLastUserMessage(savedLastMsg ? JSON.parse(savedLastMsg) : { text: "Your message is active." });
          setCooldownRemaining(dayInMillis - timePassed);
        } else {
          setHasSentToday(false);
          setLastUserMessage(null);
          setCooldownRemaining(null);
        }
      } else {
        setHasSentToday(false);
        setLastUserMessage(null);
        setCooldownRemaining(null);
      }
      
      const eligible = localPool.filter((msg: any) => msg.senderId !== "guest-user-id" && !reportedIds.includes(msg.id) && msg.reports < 3);
      if (eligible.length > 0) {
        const randomMsg = eligible[Math.floor(Math.random() * eligible.length)];
        setCurrentStrangerMessage(randomMsg);
      } else {
        setCurrentStrangerMessage({
          id: "system-empty",
          text: "The pool is currently quiet. Write a message to share your thoughts.",
          senderId: "system",
          createdAt: null,
          reports: 0,
          randomId: 0.5
        });
      }
      
      setAppReady(true);
    }, 800);
  }, [reportedIds]);

  // Load preferences on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("rp2p_card_theme");
      if (savedTheme === "light" || savedTheme === "dark") {
        setCardTheme(savedTheme);
      }
      const savedSize = localStorage.getItem("rp2p_card_font_size");
      if (savedSize === "sm" || savedSize === "md" || savedSize === "lg") {
        setCardFontSize(savedSize);
      }
    }
  }, []);

  // Save preferences when they change
  const toggleCardTheme = () => {
    const nextTheme = cardTheme === "light" ? "dark" : "light";
    setCardTheme(nextTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem("rp2p_card_theme", nextTheme);
    }
  };

  const cycleCardFontSize = () => {
    const nextSize = cardFontSize === "sm" ? "md" : cardFontSize === "md" ? "lg" : "sm";
    setCardFontSize(nextSize);
    if (typeof window !== "undefined") {
      localStorage.setItem("rp2p_card_font_size", nextSize);
    }
  };

  // --- 3. Connection Validation & Seeding ---
  const validateAndSeed = useCallback(async () => {
    setLoadingMessage("Checking connection...");
    const connPath = "test/connection";
    try {
      // Validate connection to Firestore as per instructions
      await getDocFromServer(doc(db, "test", "connection"));
    } catch (error) {
      console.warn("Initial direct server check failed, attempting normal read...", error);
    }

    setLoadingMessage("Connecting to database...");
    const messagesPath = "messages";
    try {
      // Check message pool size
      console.log("rp2p: Querying messages to check pool size...");
      const countQuery = query(collection(db, "messages"), limit(1));
      let snapshot;
      try {
        snapshot = await getDocs(countQuery);
        console.log("rp2p: Querying messages succeeded, size:", snapshot.size);
      } catch (readError) {
        console.error("rp2p: Querying messages failed:", readError);
        throw readError;
      }
      
      if (snapshot.empty) {
        setLoadingMessage("Setting up message pool...");
        console.log("rp2p: Pool is empty, preparing batch seed...");
        const batch = writeBatch(db);
        
        for (const text of STARTER_MESSAGES) {
          const newDocRef = doc(collection(db, "messages"));
          batch.set(newDocRef, {
            text,
            senderId: "system",
            createdAt: serverTimestamp(),
            reports: 0,
            randomId: Math.random()
          });
        }
        try {
          await batch.commit();
          console.log("rp2p: Database seeded successfully with starter messages!");
        } catch (writeError) {
          console.error("rp2p: Seeding batch commit failed:", writeError);
          // Throw a specific error so we know it was a write error
          throw new Error(`Seeding failed: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, messagesPath);
    }
  }, []);

  // --- 2. Query Total Count for Social Proof ---
  const fetchTotalCount = useCallback(async () => {
    if (isGuestMode) {
      if (typeof window !== "undefined") {
        const localPool = JSON.parse(localStorage.getItem("rp2p_guest_pool") || "[]");
        setTotalMessagesCount(localPool.length);
      }
      return;
    }
    const messagesPath = "messages";
    try {
      const q = query(collection(db, "messages"));
      const snapshot = await getDocs(q);
      setTotalMessagesCount(snapshot.size);
    } catch (err) {
      console.error("Error fetching count:", err);
    }
  }, [isGuestMode]);

  // --- 3. Retrieve Random Stranger Message ---
  const fetchRandomMessage = useCallback(async (currentUserUid: string) => {
    if (isGuestMode) {
      if (typeof window !== "undefined") {
        const localPool = JSON.parse(localStorage.getItem("rp2p_guest_pool") || "[]");
        const eligible = localPool.filter((msg: any) => msg.senderId !== currentUserUid && !reportedIds.includes(msg.id) && msg.reports < 3);
        if (eligible.length > 0) {
          const randomMsg = eligible[Math.floor(Math.random() * eligible.length)];
          setCurrentStrangerMessage(randomMsg);
          setStats(prev => ({ ...prev, receivedCount: prev.receivedCount + 1 }));
        } else {
          setCurrentStrangerMessage({
            id: "system-empty",
            text: "The pool is currently quiet. Write a message to share your thoughts.",
            senderId: "system",
            createdAt: null,
            reports: 0,
            randomId: 0.5
          });
        }
      }
      return;
    }
    const messagesPath = "messages";
    try {
      const r = Math.random();
      // O(1) random message retrieval: search >= randomId
      const qGreater = query(
        collection(db, "messages"),
        where("randomId", ">=", r),
        where("reports", "<", 3),
        orderBy("randomId"),
        limit(5) // Fetch a few to filter out current user's messages easily
      );
      
      let snapshot = await getDocs(qGreater);
      
      // Fallback: search < randomId if nothing was greater
      if (snapshot.empty) {
        const qLesser = query(
          collection(db, "messages"),
          where("randomId", "<", r),
          where("reports", "<", 3),
          orderBy("randomId", "desc"),
          limit(5)
        );
        snapshot = await getDocs(qLesser);
      }

      const docsList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as Message);
      
      // Filter out user's own messages and already reported ones
      const eligible = docsList.filter(msg => msg.senderId !== currentUserUid && !reportedIds.includes(msg.id));

      if (eligible.length > 0) {
        setCurrentStrangerMessage(eligible[0]);
        setStats(prev => ({ ...prev, receivedCount: prev.receivedCount + 1 }));
      } else {
        // Absolute fallback: system messages or first matching message
        const qFallback = query(collection(db, "messages"), where("reports", "<", 3), limit(5));
        const fallbackSnapshot = await getDocs(qFallback);
        const fallbackList = fallbackSnapshot.docs.map(d => ({ id: d.id, ...d.data() }) as Message);
        const fallbackEligible = fallbackList.filter(msg => msg.senderId !== currentUserUid && !reportedIds.includes(msg.id));
        
        if (fallbackEligible.length > 0) {
          setCurrentStrangerMessage(fallbackEligible[0]);
        } else {
          setCurrentStrangerMessage({
            id: "system-empty",
            text: "The pool is currently quiet. Write a message to share your thoughts.",
            senderId: "system",
            createdAt: null,
            reports: 0,
            randomId: 0.5
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, messagesPath);
    }
  }, [reportedIds, isGuestMode]);

  // --- 4. Check If User Has Sent Message Today ---
  const checkSendingStatus = useCallback(async (currentUserUid: string) => {
    if (isGuestMode) {
      if (typeof window !== "undefined") {
        const savedLastSent = localStorage.getItem("rp2p_guest_last_sent");
        if (savedLastSent) {
          const lastSentTime = parseInt(savedLastSent, 10);
          const now = Date.now();
          const dayInMillis = 24 * 60 * 60 * 1000;
          const timePassed = now - lastSentTime;
          if (timePassed < dayInMillis) {
            setHasSentToday(true);
            const savedLastMsg = localStorage.getItem("rp2p_guest_last_msg");
            setLastUserMessage(savedLastMsg ? JSON.parse(savedLastMsg) : { text: "Your message is active." });
            setCooldownRemaining(dayInMillis - timePassed);
            return;
          }
        }
      }
      setHasSentToday(false);
      setLastUserMessage(null);
      setCooldownRemaining(null);
      return;
    }
    const messagesPath = "messages";
    try {
      const q = query(
        collection(db, "messages"),
        where("senderId", "==", currentUserUid),
        orderBy("createdAt", "desc"),
        limit(1)
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const lastMsgDoc = snapshot.docs[0];
        const lastMsg = { id: lastMsgDoc.id, ...lastMsgDoc.data() } as Message;
        
        if (lastMsg.createdAt) {
          const sentTime = lastMsg.createdAt.toDate().getTime();
          const now = Date.now();
          const dayInMillis = 24 * 60 * 60 * 1000;
          const timePassed = now - sentTime;

          if (timePassed < dayInMillis) {
            setHasSentToday(true);
            setLastUserMessage(lastMsg);
            setCooldownRemaining(dayInMillis - timePassed);
            return;
          }
        }
      }
      
      setHasSentToday(false);
      setLastUserMessage(null);
      setCooldownRemaining(null);
    } catch (error) {
      console.warn("Could not retrieve daily status (likely missing index or fresh database), resetting to default...", error);
      setHasSentToday(false);
      setLastUserMessage(null);
    }
  }, [isGuestMode]);

  // --- 5. Countdown Handler ---
  useEffect(() => {
    if (cooldownRemaining !== null && cooldownRemaining > 0) {
      countdownIntervalRef.current = setInterval(() => {
        setCooldownRemaining(prev => {
          if (prev === null || prev <= 1000) {
            clearInterval(countdownIntervalRef.current!);
            setHasSentToday(false);
            setLastUserMessage(null);
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

  // Format Countdown
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
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || sending || newMessage.trim().length === 0 || newMessage.length > 250) return;

    setSending(true);
    
    if (isGuestMode) {
      // Simulate network wait
      setTimeout(async () => {
        try {
          const localPool = JSON.parse(localStorage.getItem("rp2p_guest_pool") || "[]");
          const newMsg = {
            id: `g-user-${Date.now()}`,
            text: newMessage.trim(),
            senderId: user.uid,
            createdAt: null,
            reports: 0,
            randomId: Math.random()
          };
          
          localPool.push(newMsg);
          localStorage.setItem("rp2p_guest_pool", JSON.stringify(localPool));
          localStorage.setItem("rp2p_guest_last_sent", Date.now().toString());
          localStorage.setItem("rp2p_guest_last_msg", JSON.stringify(newMsg));
          
          setStats(prev => ({ ...prev, sentCount: prev.sentCount + 1 }));
          setNewMessage("");
          setSuccess(true);
          
          await checkSendingStatus(user.uid);
          await fetchTotalCount();
          
          setTimeout(() => {
            setSuccess(false);
          }, 4000);
        } catch (err) {
          console.error("Local save failed:", err);
        } finally {
          setSending(false);
        }
      }, 600);
      return;
    }
    
    const messagesPath = "messages";
    
    try {
      const newMsgId = doc(collection(db, "messages")).id;
      const messagePayload = {
        text: newMessage.trim(),
        senderId: user.uid,
        createdAt: serverTimestamp(),
        reports: 0,
        randomId: Math.random()
      };

      await setDoc(doc(db, "messages", newMsgId), messagePayload);

      // Instantly track user stats
      setStats(prev => ({ ...prev, sentCount: prev.sentCount + 1 }));
      setNewMessage("");
      setSuccess(true);
      
      // Refresh state to trigger countdown
      await checkSendingStatus(user.uid);
      await fetchTotalCount();

      // Show success animation then reset success flag (form hides since hasSentToday is now true)
      setTimeout(() => {
        setSuccess(false);
      }, 4000);

    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, messagesPath);
    } finally {
      setSending(false);
    }
  };

  // --- 7. Report / Flag Message ---
  const handleReportMessage = async () => {
    if (!user || !currentStrangerMessage || submittingReport) return;

    setSubmittingReport(true);
    
    if (isGuestMode) {
      try {
        const localPool = JSON.parse(localStorage.getItem("rp2p_guest_pool") || "[]");
        const updatedPool = localPool.map((msg: any) => {
          if (msg.id === currentStrangerMessage.id) {
            return { ...msg, reports: msg.reports + 1 };
          }
          return msg;
        });
        localStorage.setItem("rp2p_guest_pool", JSON.stringify(updatedPool));
        
        setReportedIds(prev => [...prev, currentStrangerMessage.id]);
        await fetchRandomMessage(user.uid);
      } catch (err) {
        console.error("Local report failed:", err);
      } finally {
        setSubmittingReport(false);
      }
      return;
    }
    
    const messagesPath = `messages/${currentStrangerMessage.id}`;
    
    try {
      const docRef = doc(db, "messages", currentStrangerMessage.id);
      await updateDoc(docRef, {
        reports: currentStrangerMessage.reports + 1
      });

      // Mark as reported in client local state
      setReportedIds(prev => [...prev, currentStrangerMessage.id]);
      
      // Load next random message
      await fetchRandomMessage(user.uid);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, messagesPath);
    } finally {
      setSubmittingReport(false);
    }
  };

  // --- 8. Core Initialization Life Cycle ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setIsGuestMode(false);
          setUser(currentUser);
          
          // Seed starter messages, validate connection, fetch states
          await validateAndSeed();
          await checkSendingStatus(currentUser.uid);
          await fetchRandomMessage(currentUser.uid);
          await fetchTotalCount();
        } else {
          setUser(prev => {
            if (prev && prev.uid === "guest-user-id") return prev;
            return null;
          });
        }
        setAppReady(true);
      } catch (err) {
        console.error("Initialization failed:", err);
        setInitError(err instanceof Error ? err.message : String(err));
      }
    });

    return () => unsubscribe();
  }, [validateAndSeed, checkSendingStatus, fetchRandomMessage, fetchTotalCount, isGuestMode]);

  // Load custom stats from LocalStorage on mount
  useEffect(() => {
    const savedSent = localStorage.getItem("rp2p_sent_count");
    const savedRecv = localStorage.getItem("rp2p_received_count");
    if (savedSent || savedRecv) {
      setStats({
        sentCount: parseInt(savedSent || "0", 10),
        receivedCount: parseInt(savedRecv || "0", 10)
      });
    }
  }, []);

  // Sync custom stats to LocalStorage
  useEffect(() => {
    localStorage.setItem("rp2p_sent_count", stats.sentCount.toString());
    localStorage.setItem("rp2p_received_count", stats.receivedCount.toString());
  }, [stats]);


  // Error State Display
  if (initError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center bg-[#fafafa] text-zinc-900 selection:bg-zinc-100 selection:text-zinc-900">
        <div className="p-8 bg-white border border-zinc-200 rounded-2xl max-w-md shadow-sm">
          <AlertTriangle className="w-10 h-10 text-zinc-500 mx-auto mb-4 stroke-[1.5]" />
          <h2 className="text-lg font-semibold text-zinc-800 mb-2 font-sans">Connection Disrupted</h2>
          <p className="text-xs text-zinc-500 mb-4 font-sans leading-relaxed">
            We couldn't connect to the secure message pool. This can happen during initial database synchronization or under high network latency.
          </p>
          <div className="p-3 bg-zinc-50 text-zinc-600 border border-zinc-100 rounded-lg text-left text-xs font-mono overflow-auto max-h-32 mb-4">
            {initError}
          </div>
          <div className="flex flex-col gap-2 w-full">
            <button 
              onClick={() => window.location.reload()} 
              className="w-full px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-medium tracking-wide transition-all duration-150 cursor-pointer"
            >
              Reconnect to Pool
            </button>
            <button 
              onClick={enterGuestMode} 
              className="w-full px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl text-xs font-medium tracking-wide transition-all duration-150 cursor-pointer border border-zinc-200/50"
            >
              Enter Offline Guest Mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading State Display
  if (!appReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#fafafa] text-zinc-900 p-6 selection:bg-zinc-100 selection:text-zinc-900">
        <div className="flex flex-col items-center space-y-4 max-w-md w-full text-center">
          <div className="text-3xl font-extrabold tracking-tight font-sans text-zinc-900 select-none">
            RP2P
          </div>
          
          <div className="flex flex-col items-center space-y-2">
            <div className="flex space-x-1 items-center justify-center py-2">
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-pulse" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-[11px] font-sans font-semibold text-zinc-400 tracking-wider uppercase">
              {loadingMessage.toUpperCase()}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // If not logged in, show a gorgeous minimalist login screen
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col justify-between py-12 px-6 sm:px-12 max-w-4xl mx-auto selection:bg-zinc-100 selection:text-zinc-900 bg-[#fafafa]">
        <header className="flex flex-col items-center text-center space-y-2 mb-8">
          <div className="text-3xl font-extrabold tracking-tight font-sans text-zinc-900 select-none">
            RP2P
          </div>
          <p className="text-sm font-medium text-zinc-500 font-sans">
            An anonymous peer-to-peer message exchange.
          </p>
        </header>

        <main className="flex-grow flex flex-col items-center justify-center space-y-8 w-full max-w-md mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full bg-white border border-zinc-200/80 p-8 sm:p-10 rounded-2xl flex flex-col items-center text-center space-y-6 shadow-sm"
          >
            <div className="space-y-3">
              <h2 className="text-base font-semibold tracking-tight text-zinc-800 font-sans">
                Sign In
              </h2>
              <p className="text-xs text-zinc-500 leading-relaxed font-sans">
                RP2P lets you share a single message and read one from a random peer each day. To keep the network clean and prevent spam, please sign in with Google.
              </p>
              <p className="text-xs text-zinc-400 font-medium leading-relaxed font-sans">
                Your messages are completely anonymous and never linked to your account.
              </p>
            </div>

            {signInError && (
              <div className="w-full p-3 bg-red-50 border border-red-100 text-left text-xs font-semibold text-red-600 font-sans rounded-lg">
                Authentication failed: {signInError}
              </div>
            )}

            <div className="flex flex-col gap-2.5 w-full">
              <button
                onClick={handleGoogleSignIn}
                disabled={signingIn}
                className="w-full py-3 px-5 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-50 disabled:text-zinc-400 disabled:border-zinc-200 text-white rounded-xl font-sans text-xs uppercase tracking-wider font-semibold transition-all duration-150 flex items-center justify-center space-x-2.5 cursor-pointer disabled:cursor-not-allowed border border-zinc-900"
              >
                {signingIn ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin stroke-[2]" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>Sign in with Google</span>
                  </>
                )}
              </button>

              <button
                onClick={enterGuestMode}
                className="w-full py-3 px-5 bg-zinc-50 hover:bg-zinc-100 text-zinc-600 rounded-xl font-sans text-xs font-semibold tracking-wide transition-all duration-150 flex items-center justify-center space-x-2 border border-zinc-200/80 cursor-pointer shadow-sm"
              >
                <span>Try Guest Mode (Local Sandbox)</span>
              </button>
            </div>
          </motion.div>
        </main>

        <footer className="mt-16 flex flex-col items-center justify-center space-y-4 text-center text-xs font-sans text-zinc-500">
          <div className="max-w-xs text-xs text-zinc-400 leading-relaxed font-normal">
            A minimal, zero-profile peer message board.
          </div>
          
          <div className="flex items-center justify-center gap-6 text-[11px] text-zinc-400 font-sans font-medium">
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

  // Styling helper variables for the customizable message display card
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
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center space-y-1 flex-col"
        >
          <div className="text-3xl font-extrabold tracking-tight font-sans text-zinc-900 select-none">
            RP2P
          </div>
          <p className="text-sm font-medium text-zinc-500 font-sans">
            An anonymous peer-to-peer message exchange.
          </p>
        </motion.div>
      </header>

      {/* --- MAIN CORE STAGE --- */}
      <main className="flex-grow flex flex-col items-center justify-center space-y-12 w-full max-w-lg mx-auto">
        
        {isGuestMode && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-zinc-50 border border-zinc-200/60 rounded-xl p-3.5 text-xs text-zinc-600 font-sans font-medium text-center flex items-center justify-center gap-2 shadow-xs"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-500"></span>
            </span>
            <span>Running in <strong className="font-semibold text-zinc-800">Local Guest Mode</strong>. Your data remains secure on your device.</span>
          </motion.div>
        )}

        {/* SECTION A: THE STRANGER'S MESSAGE CARD */}
        <div className="w-full">
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-xs text-zinc-500 font-sans font-medium flex items-center gap-1.5 select-none">
              Random Message
            </p>
            
            {/* Readability & Theme Controls */}
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
                {/* Visual block detail */}
                <div className={`absolute top-0 left-0 w-full h-1 transition-colors duration-150 ${cardLineClass}`}></div>
 
                {/* Message Text */}
                <div className="my-auto py-4">
                  <p className={`${fontSizeClass} ${cardTextClass} break-words transition-colors duration-150`}>
                    "{currentStrangerMessage.text}"
                  </p>
                </div>
 
                {/* Footer of the card */}
                <div className={`transition-colors duration-150 ${cardDividerClass}`}>
                  <span className="flex items-center gap-1.5 select-none text-xs text-zinc-400 font-medium">
                    {currentStrangerMessage.createdAt 
                      ? "Active Message"
                      : "System Message"}
                  </span>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => fetchRandomMessage(user?.uid || "")}
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

        {/* SECTION B: ACTIONS / FORM COMPOSER */}
        <div className="w-full">
          <AnimatePresence mode="wait">
            
            {/* SUCCESS VIEW ANIMATION */}
            {success ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-white border border-zinc-200 p-8 rounded-2xl text-center space-y-4 shadow-sm"
              >
                <div className="w-10 h-10 bg-zinc-50 border border-zinc-100 rounded-full flex items-center justify-center mx-auto text-zinc-600">
                  <Send className="w-4 h-4 stroke-[1.5]" />
                </div>
                <h3 className="text-base font-semibold text-zinc-800 tracking-tight font-sans">Message Sent</h3>
                <p className="text-xs text-zinc-500 font-medium leading-relaxed font-sans">
                  Your anonymous message has been added to the pool and will be shown to a random peer tomorrow.
                </p>
              </motion.div>
            ) : hasSentToday ? (
              
              /* DAILY COOLDOWN STATE */
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

                {/* Show the user's own sent message */}
                {lastUserMessage && (
                  <div className="w-full border-t border-zinc-100 pt-5 text-left mt-2">
                    <p className="text-xs text-zinc-400 font-sans font-medium mb-2">
                      Your message today:
                    </p>
                    <div className="p-4 bg-zinc-50/50 border border-zinc-100/80 rounded-xl text-xs text-zinc-600 font-medium break-words leading-relaxed">
                      "{lastUserMessage.text}"
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              
              /* WRITE MESSAGE COMPOSER */
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
                    
                    {/* Character count ring/text */}
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
        
        {/* Simple, clean inline metadata */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-400 select-none">
          <span>Active minds: <strong className="font-semibold text-zinc-600">{totalMessagesCount !== null ? totalMessagesCount : '—'}</strong></span>
          <span className="text-zinc-200">•</span>
          <span>Messages sent: <strong className="font-semibold text-zinc-600">{stats.sentCount}</strong></span>
          <span className="text-zinc-200">•</span>
          <span>Messages read: <strong className="font-semibold text-zinc-600">{stats.receivedCount}</strong></span>
        </div>

        {/* Minimal concept notes */}
        <div className="max-w-xs text-xs text-zinc-400 leading-relaxed font-normal">
          A minimal text space. No profiles, no trackers, no social features. Just one anonymous message shared per day.
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-400 font-sans font-medium">
          <span>Signed in as <strong className="font-medium text-zinc-600">{user.email?.split('@')[0]}</strong></span>
          <span className="text-zinc-200">•</span>
          <button 
            onClick={handleSignOut}
            className="hover:text-red-500 hover:underline transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>

        {/* Footer linkages */}
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
