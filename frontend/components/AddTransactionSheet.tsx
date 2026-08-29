"use client";

import { Check, Delete } from "lucide-react";
import { useMemo, useState } from "react";
import { putSource, putTransaction } from "../lib/db";
import { creditCategories, debitCategories } from "../lib/categories";
import { buildMerchantTrie, categoryFrequency, categorySuggestion, CategoryMapping, normalizeMerchant, orderedCategorySuggestions } from "../lib/merchant-intelligence";
import { Source, Transaction, TransactionType } from "../lib/types";
import { Sheet } from "./Sheet";
import { CategoryPickerSheet } from "./CategoryPickerSheet";

function evaluateExpression(expression: string) {
  const tokens = expression.replaceAll("×", "*").replaceAll("−", "-").split(/([+\-*/])/).map((token) => token.trim()).filter(Boolean);
  if (!tokens.length || tokens.some((token) => !/^\d*\.?\d+$/.test(token) && !/[+\-*/]/.test(token))) return 0;
  const values: (number | string)[] = tokens.map((token) => /[+\-*/]/.test(token) ? token : Number(token));
  for (let index = 1; index < values.length - 1; index += 2) {
    const operator = values[index];
    if (operator === "*" || operator === "/") {
      const left = Number(values[index - 1]);
      const right = Number(values[index + 1]);
      values.splice(index - 1, 3, operator === "*" ? left * right : right ? left / right : 0);
      index -= 2;
    }
  }
  let result = Number(values[0]);
  for (let index = 1; index < values.length - 1; index += 2) result = values[index] === "+" ? result + Number(values[index + 1]) : result - Number(values[index + 1]);
  return Number.isFinite(result) ? result : 0;
}

export function AddTransactionSheet({
  sources,
  month,
  transactions,
  categoryMappings,
  userId,
  onLearnCategory,
  onClose,
}: {
  sources: Source[];
  month: Date;
  transactions: Transaction[];
  categoryMappings: CategoryMapping;
  userId: string;
  onLearnCategory: (merchant: string, category: string) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<TransactionType>("debit");
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [category, setCategory] = useState<string | null>(null);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [error, setError] = useState("");
  const [date, setDate] = useState(() => {
    const today = new Date();
    const selected = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth() ? today : month;
    return `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`;
  });
  const [showCategories, setShowCategories] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const source = sources.find((item) => item.id === sourceId);
  const merchantTrie = useMemo(() => buildMerchantTrie(transactions), [transactions]);
  const merchantSuggestions = useMemo(
    () => merchantTrie.suggest(merchant).filter((suggestion) => normalizeMerchant(suggestion) !== normalizeMerchant(merchant)),
    [merchant, merchantTrie],
  );
  const numericAmount = useMemo(() => evaluateExpression(amount), [amount]);
  const suggestedCategory = useMemo(
    () => categorySuggestion(merchant, numericAmount, type, categoryMappings),
    [categoryMappings, merchant, numericAmount, type],
  );
  const categorySuggestions = useMemo(
    () => orderedCategorySuggestions(
      categoryFrequency(transactions),
      suggestedCategory,
      (type === "credit" ? creditCategories : debitCategories).map((item) => item.name),
    ),
    [suggestedCategory, transactions, type],
  );
  const effectiveCategory = categoryTouched ? category ?? "Other" : suggestedCategory ?? "Other";
  const append = (value: string) => setAmount((current) => `${current}${value}`);
  const save = async () => {
    const numeric = numericAmount;
    if (!numeric || numeric <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!merchant.trim()) {
      setError("Enter a merchant or counterparty.");
      return;
    }
    if (!date) {
      setError("Choose a transaction date.");
      return;
    }
    if (!source && !userId) {
      setError("Choose a source before saving.");
      return;
    }
    try {
      const now = new Date().toISOString();
      const transaction: Transaction = { id: crypto.randomUUID(), user_id: source?.user_id ?? userId, unique_ref: `offline-${Date.now()}`, transaction_date: new Date(`${date}T12:00:00`).toISOString(), amount: numeric, type, merchant: merchant.trim(), category: effectiveCategory, description: null, balance_after: source ? source.balance + (type === "credit" ? numeric : -numeric) : null, source: source?.source_name ?? null, excludedFromCashFlow: false, created_at: now, updated_at: now, sync_status: "pending" };
      await putTransaction(transaction);
      if (source) {
        await putSource({ ...source, balance: transaction.balance_after ?? source.balance, updated_at: now, sync_status: "pending" });
      }
      window.dispatchEvent(new Event("expense-data-changed"));
      onClose();
    } catch (saveError) {
      console.error("Unable to save transaction", saveError);
      setError("Could not save this transaction. Please try again.");
    }
  };
  const chooseCategory = (value: string) => {
    setCategory(value);
    setCategoryTouched(true);
    if (merchant.trim()) onLearnCategory(merchant, value);
  };
  const chooseMerchant = (value: string) => {
    setMerchant(value);
    setCategoryTouched(false);
  };
  return <Sheet title="New Transaction" onClose={onClose}>
    <div className="mb-4 flex justify-end -mt-14"><button type="button" aria-label="Save transaction" onClick={() => void save()} className="rounded-full bg-white p-3 text-black shadow-[0_0_20px_rgba(255,255,255,.12)] active:scale-[0.96]"><Check size={20} /></button></div>
    <div className="mb-5 grid grid-cols-2 rounded-full bg-black/20 p-1">{(["credit", "debit"] as const).map((option) => <button type="button" key={option} onClick={() => setType(option)} className={`rounded-full py-2 text-sm capitalize ${type === option ? "bg-white/10 text-white" : "text-[#8E8E93]"}`}>{option}</button>)}</div>
    <div className="relative mb-4">
      <input value={merchant} onChange={(event) => chooseMerchant(event.target.value)} placeholder={type === "debit" ? "To / merchant" : "From / counterparty"} className="glass w-full rounded-2xl px-4 py-4 outline-none placeholder:text-[#8E8E93]" />
      {merchantSuggestions.length > 0 && <div className="popover glass absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-2xl p-1">
        {merchantSuggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => chooseMerchant(suggestion)} className="block w-full rounded-xl px-3 py-3 text-left text-sm hover:bg-white/10">{suggestion}</button>)}
      </div>}
    </div>
    <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="glass mb-4 w-full rounded-2xl px-4 py-4 text-white outline-none" />
    <div className="mb-5 grid grid-cols-2 gap-3">
      <button type="button" onClick={() => setShowCategories(true)} className="glass flex items-center justify-between rounded-2xl p-4 text-left text-sm"><span>{effectiveCategory || "Category"}</span>{suggestedCategory && !categoryTouched && <span className="text-xs text-[#FFD60A]">Suggested</span>}</button>
      <button type="button" onClick={() => setShowSources((current) => !current)} className="glass rounded-2xl p-4 text-left text-sm">{source?.source_name || "Source"}</button>
    </div>
    {showSources && <div className="mb-5 grid grid-cols-2 gap-2">{sources.map((item) => <button type="button" key={item.id} onClick={() => { setSourceId(item.id); setShowSources(false); }} className={`rounded-xl px-3 py-3 text-left text-sm ${sourceId === item.id ? "bg-white text-black" : "glass text-white"}`}>{item.source_name}</button>)}</div>}
    <div className="mb-5 text-center text-4xl font-bold">₹{amount || "0"}</div>
    <div className="grid grid-cols-4 gap-1">{["1","2","3","4","5","6","7","8","9","+","0",".","−","×","÷"].map((key) => <button key={key} onClick={() => append(key)} className="glass min-h-14 rounded-2xl text-lg active:scale-[0.96]">{key}</button>)}<button onClick={() => setAmount((current) => current.slice(0, -1))} className="glass min-h-14 rounded-2xl text-lg"><Delete size={19} className="mx-auto" /></button></div>
    {error && <p role="alert" className="mt-4 text-center text-sm text-[#ffb4b4]">{error}</p>}
    {showCategories && <CategoryPickerSheet value={effectiveCategory} type={type} suggestions={categorySuggestions} onSelect={chooseCategory} onClose={() => setShowCategories(false)} />}
  </Sheet>;
}
