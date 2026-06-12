"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
}

/** Client-side auth state for marketing-page UI (keeps those pages static-friendly). */
export function useAuthUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const map = (u: {
      id: string;
      email?: string;
      user_metadata?: Record<string, unknown>;
    } | null): AuthUser | null => {
      if (!u) return null;
      const meta = u.user_metadata ?? {};
      return {
        id: u.id,
        email: u.email,
        name: (meta.full_name as string) || (meta.name as string) || undefined,
        avatarUrl: (meta.avatar_url as string) || (meta.picture as string) || undefined,
      };
    };

    supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUser(map(data.user));
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(map(session?.user ?? null));
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
