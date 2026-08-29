import {
  Car,
  Clapperboard,
  Fuel,
  HeartPulse,
  MoreHorizontal,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Utensils,
  Wallet,
} from "lucide-react";

export const debitCategories = [
  { name: "Food", icon: Utensils },
  { name: "Entertainment", icon: Clapperboard },
  { name: "Petrol", icon: Fuel },
  { name: "Transport", icon: Car },
  { name: "Lifestyle", icon: ShoppingBag },
  { name: "Health", icon: HeartPulse },
  { name: "Shopping", icon: ShoppingCart },
  { name: "Grocery", icon: ShoppingCart },
  { name: "Bills", icon: Receipt },
  { name: "Rent", icon: Receipt },
  { name: "Bills/Rent", icon: Receipt },
  { name: "Misc", icon: MoreHorizontal },
  { name: "Other", icon: MoreHorizontal },
] as const;

export const creditCategories = [
  { name: "Income", icon: Wallet },
  { name: "Salary", icon: Wallet },
  { name: "Refund", icon: Wallet },
  { name: "Transfer", icon: Wallet },
  { name: "Interest", icon: Wallet },
  { name: "Other", icon: MoreHorizontal },
] as const;

export const categories = [
  ...debitCategories,
  ...creditCategories.filter((credit) => !debitCategories.some((debit) => debit.name === credit.name)),
] as const;

export function categoryIcon(category: string | null) {
  return categories.find((item) => item.name === category)?.icon ?? MoreHorizontal;
}
