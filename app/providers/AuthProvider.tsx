"use client";

import { createClient } from "@/app/lib/supabase/client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";

export type UserRole = "manager" | "student";

export interface UserProfile {
  id: string;
  role: UserRole;
  full_name: string;
  avatar_url: string | null;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isManager: boolean;
  isStudent: boolean;
  isAuthenticated: boolean;
  signUp: (email: string, password: string, fullName: string, role: UserRole, inviteToken?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ user: User; profile: UserProfile }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const initRef = useRef(false);
  const supabaseRef = useRef(createClient());

  const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabaseRef.current
        .from("profiles")
        .select("id, role, full_name, avatar_url")
        .eq("id", userId)
        .single();
      if (error) {
        console.warn("[AuthProvider] fetchProfile error:", error.message);
        return null;
      }
      return data as UserProfile;
    } catch (err) {
      console.error("[AuthProvider] fetchProfile unexpected error:", err);
      return null;
    }
  }, []);

  // Init: check session ONCE on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    supabaseRef.current.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const p = await fetchProfile(session.user.id);
        setUser(session.user);
        setProfile(p);
      }
      setLoading(false);
    });
  }, [fetchProfile]);

  const signUp = useCallback(async (email: string, password: string, fullName: string, role: UserRole, inviteToken?: string) => {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, fullName, role, inviteToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur lors de l'inscription");
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabaseRef.current.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);

    // Poll for profile creation (DB trigger may take time after first signup)
    let p: UserProfile | null = null;
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i++) {
      p = await fetchProfile(data.user.id);
      if (p) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!p) {
      throw new Error("Profil non créé. Veuillez réessayer.");
    }

    setUser(data.user);
    setProfile(p);
    setLoading(false);
    return { user: data.user, profile: p };
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabaseRef.current.auth.signOut();
    setUser(null);
    setProfile(null);
    setLoading(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const p = await fetchProfile(user.id);
    setProfile(p);
  }, [user, fetchProfile]);

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    isManager: profile?.role === "manager",
    isStudent: profile?.role === "student",
    isAuthenticated: !!user,
    signUp,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
