"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { IconType, Source } from "../lib/types";
import { Sheet } from "./Sheet";

const sourceOptions: { name: string; icon_type: IconType }[] = [
  { name: "Cash", icon_type: "cash" },
  { name: "GPay", icon_type: "gpay" },
  { name: "Bank", icon_type: "bank" },
  { name: "Visa", icon_type: "visa" },
  { name: "Mastercard", icon_type: "mastercard" },
  { name: "Other", icon_type: "other" },
];

export function AddSourceSheet({ userId, onSave, onClose }: { userId: string; onSave: (source: Source) => Promise<void>; onClose: () => void }) {
  const [selected, setSelected] = useState(sourceOptions[0]);
  const [balance, setBalance] = useState("");
  const save = async () => {
    const numericBalance = Number(balance);
    if (!userId || !Number.isFinite(numericBalance) || numericBalance < 0) return;
    await onSave({
      id: crypto.randomUUID(),
      user_id: userId,
      source_name: selected.name,
      icon_type: selected.icon_type,
      balance: numericBalance,
      updated_at: new Date().toISOString(),
      sync_status: "pending",
    });
    onClose();
  };
  return <Sheet title="Add source" onClose={onClose}>
    <div className="grid grid-cols-2 gap-3">{sourceOptions.map((option) => <button type="button" key={option.name} onClick={() => setSelected(option)} className={`glass rounded-2xl p-4 text-left text-sm ${selected.name === option.name ? "ring-1 ring-white/50" : ""}`}>{option.name}</button>)}</div>
    <input autoFocus={false} type="number" min="0" step="0.01" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="Current balance" className="glass mt-5 w-full rounded-2xl px-4 py-4 outline-none placeholder:text-[#8E8E93]" />
    <button type="button" onClick={() => void save()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-white p-4 text-sm font-semibold text-black"><Check size={16} />Save source</button>
  </Sheet>;
}
