"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export function MonthSelector({ month, onChange }: { month: Date; onChange: (month: Date) => void }) {
  const label = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const move = (amount: number) => onChange(new Date(month.getFullYear(), month.getMonth() + amount, 1));
  return <div className="flex min-w-0 items-center justify-center gap-2">
    <button type="button" aria-label="Previous month" onClick={() => move(-1)} className="rounded-full p-2 text-[#8E8E93] hover:bg-white/10"><ChevronLeft /></button>
    <label className="relative cursor-pointer text-2xl font-bold sm:text-3xl"><span>{label}</span><input aria-label="Choose month" type="month" value={`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`} onChange={(event) => { if (event.target.value) { const [year, selectedMonth] = event.target.value.split("-").map(Number); onChange(new Date(year, selectedMonth - 1, 1)); } }} className="absolute inset-0 cursor-pointer opacity-0" /></label>
    <button type="button" aria-label="Next month" onClick={() => move(1)} className="rounded-full p-2 text-[#8E8E93] hover:bg-white/10"><ChevronRight /></button>
  </div>;
}
