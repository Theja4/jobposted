"use client";

import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";

/**
 * "Continue with Google" with two modes:
 *
 * 1. NEXT_PUBLIC_GOOGLE_CLIENT_ID set → Google Identity Services ID-token flow using a
 *    JobPosted-owned Google client. The consent screen shows JobPosted's branding. The
 *    ID token is exchanged via supabase.auth.signInWithIdToken; that client id must be
 *    in Supabase → Auth → Google → "Authorized Client IDs".
 *
 * 2. Not set → falls back to supabase.auth.signInWithOAuth through the shared Supabase
 *    Google client (works today, but the consent screen shows whatever that client is
 *    branded as — currently "Rezoomed"). Lets the button work before the dedicated
 *    client is provisioned; set the env var to upgrade the branding.
 */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

interface CredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    nonce?: string;
    use_fedcm_for_prompt?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      logo_alignment?: "left" | "center";
      width?: number;
    },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

export function GoogleSignIn({ onError }: { onError: (message: string) => void }) {
  if (GOOGLE_CLIENT_ID) return <GoogleIdTokenButton onError={onError} />;
  return <GoogleOAuthFallback onError={onError} />;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Mode 1 — GIS ID-token flow with a JobPosted-owned client (JobPosted branding). */
function GoogleIdTokenButton({ onError }: { onError: (message: string) => void }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!scriptReady || !el || !window.google) return;

    let cancelled = false;

    (async () => {
      // A nonce binds the token to this attempt: Google sees the SHA-256 hash,
      // Supabase verifies against the raw value we pass to signInWithIdToken.
      const rawNonce = crypto.randomUUID();
      const hashedNonce = await sha256Hex(rawNonce);
      if (cancelled || !window.google) return;

      const supabase = createClient();

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        nonce: hashedNonce,
        use_fedcm_for_prompt: true,
        callback: async (response) => {
          if (!response.credential) {
            onError("Google sign-in didn't return a token. Please try again.");
            return;
          }
          const { error } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: response.credential,
            nonce: rawNonce,
          });
          if (error) {
            onError(error.message);
            return;
          }
          track("auth_google");
          router.push("/dashboard" as Route);
          router.refresh();
        },
      });

      el.replaceChildren();
      const width = Math.min(el.offsetWidth || 360, 400);
      window.google.accounts.id.renderButton(el, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        logo_alignment: "center",
        width,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [scriptReady, router, onError]);

  return (
    <>
      <Script
        id="google-gsi"
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      {/* GIS renders a light-themed button; pin color-scheme so it stays legible. */}
      <div ref={containerRef} className="flex min-h-12 justify-center [color-scheme:light]" />
    </>
  );
}

/** Mode 2 — Supabase web OAuth via the shared client (works without a dedicated client). */
function GoogleOAuthFallback({ onError }: { onError: (message: string) => void }) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (loading) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      track("auth_google");
      // Success redirects the browser to Google.
    } catch (err) {
      setLoading(false);
      onError(err instanceof Error ? err.message : "Couldn't start Google sign-in.");
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-white text-sm font-bold text-ink ring-1 ring-inset ring-zinc-200 transition-[transform,background-color,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:bg-brand-50/60 hover:ring-brand-200 active:translate-y-0 disabled:pointer-events-none disabled:opacity-60"
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon className="size-5" />}
      Continue with Google
    </button>
  );
}

/** Google "G" mark in its brand colors. */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.82-.07-1.6-.21-2.36H12v4.46h6.46a5.52 5.52 0 0 1-2.4 3.62v3.01h3.88c2.27-2.09 3.58-5.17 3.58-8.73z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.28a12 12 0 0 0 0 10.78l4.01-3.11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.11C6.23 6.86 8.88 4.75 12 4.75z"
      />
    </svg>
  );
}
