"use client";

import { useEffect } from "react";
import { syncData } from "../lib/sync";

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void syncData().then(() => window.dispatchEvent(new Event("expense-data-changed")));
    const sync = () => void syncData().then(() => window.dispatchEvent(new Event("expense-data-changed")));
    const persistLocalChanges = () => { if (navigator.onLine) void syncData(); };
    window.addEventListener("online", sync);
    window.addEventListener("expense-data-changed", persistLocalChanges);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("expense-data-changed", persistLocalChanges);
    };
  }, []);
  return children;
}
