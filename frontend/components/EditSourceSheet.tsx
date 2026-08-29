"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Source } from "../lib/types";
import { Sheet } from "./Sheet";

export function EditSourceSheet({ source, onSave, onClose }: { source: Source; onSave: (source: Source) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(source.source_name);
  const [balance, setBalance] = useState(String(source.balance));
  const save = async () => {
    const numericBalance = Number(balance);
    if (!name.trim() || !Number.isFinite(numericBalance) || numericBalance < 0) return;
    await onSave({ ...source, source_name: name.trim(), balance: numericBalance, sync_status: "pending", updated_at: new Date().toISOString() });
    onClose();
  };
  return <Sheet title="Edit source" onClose={onClose}>
    <div className="space-y-4">
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Source name" className="glass w-full rounded-2xl px-4 py-4 outline-none placeholder:text-[#8E8E93]" />
      <input type="number" min="0" step="0.01" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="Balance" className="glass w-full rounded-2xl px-4 py-4 outline-none placeholder:text-[#8E8E93]" />
      <button type="button" onClick={() => void save()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white p-4 text-sm font-semibold text-black"><Check size={16} />Save source</button>
    </div>
  </Sheet>;
}
