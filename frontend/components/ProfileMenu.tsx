"use client";

import { LogIn, LogOut, UserRound } from "lucide-react";
import { useState } from "react";
import { googleSignInUrl, signOut } from "../lib/auth";
import { syncData } from "../lib/sync";
import { User } from "../lib/types";

export function ProfileMenu({ user, onChange }: { user: User | null; onChange: (user: User | null) => void }) {
  const [open, setOpen] = useState(false);
  const initials = user?.display_name?.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <div className="relative">
    <button aria-label="Profile" onClick={() => setOpen(!open)} className="glass flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold active:scale-[0.96]">
      {initials || <UserRound size={16} className="text-[#8E8E93]" />}
    </button>
    {open && <div className="popover glass absolute right-0 top-14 z-40 min-w-32 rounded-2xl p-1">
      {user ? <button onClick={async () => { const backedUp = await syncData(); await signOut(backedUp); onChange(null); setOpen(false); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-white hover:bg-white/10"><LogOut size={16} />Sign out</button> : <a href={googleSignInUrl} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-white hover:bg-white/10"><LogIn size={16} />Sign in</a>}
    </div>}
  </div>;
}
