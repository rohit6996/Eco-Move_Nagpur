import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import type { Session, User } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUpWithEmail: (email: string, password: string, fullName: string, mobile: string) => Promise<any>;
  signUpWithPhone: (phone: string, password: string, fullName: string, email: string) => Promise<any>;
  signInWithEmail: (email: string, password: string) => Promise<any>;
  signInWithPhone: (phone: string, password: string) => Promise<any>;
  verifyOtp: (phone: string, token: string) => Promise<any>;
  resetPassword: (email: string) => Promise<any>;
  updatePassword: (newPassword: string) => Promise<any>;
  signInWithGoogle: () => Promise<any>;
  signOut: () => Promise<any>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Get initial session from Supabase
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // 2. Listen for real-time auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Real Supabase Email Sign Up
  const signUpWithEmail = async (email: string, password: string, fullName: string, mobile: string) => {
    return await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          mobile: mobile,
        },
      },
    });
  };

  // Real Supabase Phone Sign Up
  const signUpWithPhone = async (phone: string, password: string, fullName: string, email: string) => {
    return await supabase.auth.signUp({
      phone,
      password,
      options: {
        data: {
          full_name: fullName,
          email: email,
        },
      },
    });
  };

  // Real Supabase Email Sign In
  const signInWithEmail = async (email: string, password: string) => {
    return await supabase.auth.signInWithPassword({
      email,
      password,
    });
  };

  // Real Supabase Phone Sign In
  const signInWithPhone = async (phone: string, password: string) => {
    return await supabase.auth.signInWithPassword({
      phone,
      password,
    });
  };

  // Real Supabase Verify OTP
  const verifyOtp = async (phone: string, token: string) => {
    return await supabase.auth.verifyOtp({
      phone,
      token,
      type: "signup",
    });
  };

  // Real Supabase Reset Password
  const resetPassword = async (email: string) => {
    return await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/update-password",
    });
  };

  // Real Supabase Update Password
  const updatePassword = async (newPassword: string) => {
    return await supabase.auth.updateUser({
      password: newPassword,
    });
  };

  // Google OAuth Sign In / Sign Up
  const signInWithGoogle = async () => {
    return await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/app",
      },
    });
  };

  // Real Supabase Sign Out
  const signOut = async () => {
    setUser(null);
    setSession(null);
    return await supabase.auth.signOut();
  };

  const value = {
    user,
    session,
    loading,
    signUpWithEmail,
    signUpWithPhone,
    signInWithEmail,
    signInWithPhone,
    verifyOtp,
    resetPassword,
    updatePassword,
    signInWithGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
