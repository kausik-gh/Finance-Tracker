"use client";

import { BarChart3, Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="glass fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 gap-2 rounded-full p-2">
      {[{ href: "/", label: "Home", icon: Home }, { href: "/analytics", label: "Analytics", icon: BarChart3 }].map((item) => {
        const active = path === item.href;
        const Icon = item.icon;
        return <Link key={item.href} href={item.href} className={`flex items-center gap-2 rounded-full px-5 py-3 text-sm transition-transform duration-150 active:scale-[0.96] ${active ? "bg-white/10 text-white" : "text-[#8E8E93]"}`}><Icon size={18} />{item.label}</Link>;
      })}
    </nav>
  );
}
