"use client";

import { useEffect, useState, useCallback } from "react";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            photo_url?: string;
          };
        };
        themeParams: Record<string, string>;
        colorScheme: "light" | "dark";
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        HapticFeedback?: {
          impactOccurred: (
            style: "light" | "medium" | "heavy" | "rigid" | "soft"
          ) => void;
          notificationOccurred: (type: "error" | "success" | "warning") => void;
          selectionChanged: () => void;
        };
      };
    };
  }
}

export interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export function useTelegram() {
  const [isReady, setIsReady] = useState(false);
  const [initData, setInitData] = useState<string>("");
  const [user, setUser] = useState<TelegramWebAppUser | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      setInitData(tg.initData || "");
      setUser(tg.initDataUnsafe?.user || null);

      if (tg.setHeaderColor) {
        tg.setHeaderColor("#020617"); // Match slate-950
      }
      if (tg.setBackgroundColor) {
        tg.setBackgroundColor("#020617");
      }
    }
    setIsReady(true);
  }, []);

  const triggerHaptic = useCallback(
    (type: "impact" | "notification" | "selection" = "selection") => {
      const haptic = window.Telegram?.WebApp?.HapticFeedback;
      if (!haptic) return;

      if (type === "impact") {
        haptic.impactOccurred("medium");
      } else if (type === "notification") {
        haptic.notificationOccurred("success");
      } else {
        haptic.selectionChanged();
      }
    },
    []
  );

  const getAuthHeaders = useCallback((): HeadersInit => {
    const tg = window.Telegram?.WebApp;
    const currentInitData = tg?.initData || initData;

    if (currentInitData) {
      return {
        Authorization: `tma ${currentInitData}`,
        "Content-Type": "application/json",
      };
    }

    return {
      "Content-Type": "application/json",
    };
  }, [initData]);

  return {
    isReady,
    initData,
    user,
    webApp: typeof window !== "undefined" ? window.Telegram?.WebApp : undefined,
    triggerHaptic,
    getAuthHeaders,
  };
}
