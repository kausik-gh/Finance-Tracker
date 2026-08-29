"use client";

import { useEffect, useState } from "react";
import { checkSession } from "../lib/auth";
import { User } from "../lib/types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => { void checkSession().then(setUser); }, []);
  return { user, setUser };
}
