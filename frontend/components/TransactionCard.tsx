"use client";

import { createElement } from "react";
import { useRef, type PointerEvent } from "react";
import { Transaction } from "../lib/types";
import { categoryIcon } from "../lib/categories";

export function TransactionCard({ transaction, onCategory, onDetail, onLongPress }: { transaction: Transaction; onCategory: () => void; onDetail: () => void; onLongPress: (position: { x: number; y: number }) => void }) {
  const credit = transaction.type === "credit";
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const clearPress = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      onLongPress({ x: event.clientX, y: event.clientY });
    }, 550);
  };
  const handleClick = () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    onDetail();
  };
  return <article onClick={handleClick} onPointerDown={handlePointerDown} onPointerUp={clearPress} onPointerLeave={clearPress} onPointerCancel={clearPress} onContextMenu={(event) => event.preventDefault()} className={`glass rounded-3xl p-5 transition-transform duration-150 active:scale-[0.98] ${transaction.excludedFromCashFlow ? "opacity-50" : ""}`}>
    <div className="text-sm"><span className="text-[#8E8E93]">{credit ? "From:" : "To:"}</span> <span className="font-medium">{transaction.merchant || "Unknown"}</span></div>
    <div className="my-4 border-t border-white/10" />
    <div className="flex items-center justify-between gap-4"><strong className={`text-xl ${credit ? "text-[#30D158]" : "text-(--red)"}`}>{credit ? "+" : "−"}₹{transaction.amount.toLocaleString("en-IN")}</strong><button onClick={(event) => { event.stopPropagation(); onCategory(); }} className="flex w-fit items-center gap-2 rounded-full bg-[rgba(58,58,60,0.7)] px-3 py-2 text-xs text-white">{createElement(categoryIcon(transaction.category), { size: 15 })}{transaction.category || "Other"}</button></div>
  </article>;
}
