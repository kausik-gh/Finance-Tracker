"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Sheet } from "./Sheet";

export function DateRangeSheet({ initialStart, initialEnd, onApply, onClose }: { initialStart: string; initialEnd: string; onApply: (start: string, end: string) => void; onClose: () => void }) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const valid = Boolean(start && end && start <= end);
  return <Sheet title="Choose date range" onClose={onClose}>
    <div className="space-y-4">
      <label className="block text-sm text-[#8E8E93]">Start date<input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="glass mt-2 w-full rounded-2xl px-4 py-4 text-white outline-none" /></label>
      <label className="block text-sm text-[#8E8E93]">End date<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="glass mt-2 w-full rounded-2xl px-4 py-4 text-white outline-none" /></label>
      <button type="button" disabled={!valid} onClick={() => { onApply(start, end); onClose(); }} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white p-4 text-sm font-semibold text-black disabled:opacity-40"><Check size={16} />Apply range</button>
    </div>
  </Sheet>;
}
