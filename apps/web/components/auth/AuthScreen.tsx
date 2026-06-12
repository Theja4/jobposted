"use client";

import { useCallback, useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2, Send, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/landing/Logo";
import { GoogleSignIn } from "./GoogleSignIn";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";

type Mode = "signup" | "signin";
type Status = "idle" | "submitting" | "confirm" | "error";

const EASE = [0.22, 1, 0.36, 1] as const;

export function AuthScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();

  const [mode, setMode] = useState<Mode>(params.get("mode") === "signin" ? "signin" : "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>(params.get("error") === "oauth" ? "error" : "idle");
  const [message, setMessage] = useState(
    params.get("error") === "oauth" ? "Google sign-in didn't complete. Please try again." : "",
  );
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const busy = status === "submitting";
  const submitting = busy;

  const handleGoogleError = useCallback((m: string) => {
    setStatus("error");
    setMessage(m);
  }, []);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setStatus("idle");
    setMessage("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (!email || !password) {
      setStatus("error");
      setMessage("Enter your email and a password to continue.");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setStatus("error");
      setMessage("Use at least 8 characters for your password.");
      return;
    }
    if (!supabase) {
      setStatus("error");
      setMessage("Accounts aren't connected yet. Please try again shortly.");
      return;
    }

    setStatus("submitting");
    setMessage("");

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        track("auth_signup", { email_domain: email.split("@")[1] ?? null });
        // Email-confirmation projects return a user but no active session.
        if (data.session) {
          router.push("/dashboard" as Route);
          router.refresh();
          return;
        }
        setStatus("confirm");
        setMessage("Check your inbox to confirm your email, then sign in.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      track("auth_signin", { email_domain: email.split("@")[1] ?? null });
      router.push("/");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
    }
  }

  return (
    <main className="relative grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel reduce={Boolean(reduce)} />

      {/* ── Form side ─────────────────────────────────────────── */}
      <div className="relative flex flex-col bg-panel px-5 py-8 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(34rem_22rem_at_80%_-10%,rgba(47,125,244,0.1),transparent_60%)]"
        />

        <div className="relative flex items-center justify-between">
          <Link href="/" className="inline-flex lg:hidden" aria-label="JobPosted home">
            <Logo />
          </Link>
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold text-muted transition-colors hover:bg-white hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
        </div>

        <div className="relative flex flex-1 items-center justify-center py-10">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="liquid-glass w-full max-w-md rounded-[2rem] p-6 sm:p-8"
          >
            <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-ink">
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              {mode === "signup"
                ? "Queue tailored applications and confirm every send. Your first five are free."
                : "Pick up your queue right where you left it."}
            </p>

            {/* Mode toggle */}
            <div className="glass-chip mt-6 grid grid-cols-2 gap-1 rounded-full p-1">
              {(["signup", "signin"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  aria-pressed={mode === m}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-bold transition-colors duration-150",
                    mode === m
                      ? "bg-ink text-white shadow-[0_6px_14px_rgba(7,26,51,0.22)]"
                      : "text-muted hover:text-ink",
                  )}
                >
                  {m === "signup" ? "Create account" : "Sign in"}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {status === "confirm" ? (
                <motion.div
                  key="confirm"
                  initial={reduce ? false : { opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="mt-6 flex items-start gap-3 rounded-2xl bg-white/70 p-5 ring-1 ring-inset ring-white"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                  <div>
                    <p className="text-sm font-extrabold text-ink">Almost there</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{message}</p>
                    <button
                      type="button"
                      onClick={() => switchMode("signin")}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 hover:text-brand-800"
                    >
                      Go to sign in <ArrowRight className="size-4" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.form
                  key={mode}
                  onSubmit={onSubmit}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -10 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="mt-6 space-y-4"
                  noValidate
                >
                  <GoogleSignIn onError={handleGoogleError} />
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-ink/10" />
                    <span className="text-xs font-bold tracking-wide text-muted uppercase">
                      or
                    </span>
                    <span className="h-px flex-1 bg-ink/10" />
                  </div>

                  <div>
                    <label htmlFor="email" className="mb-1.5 block text-sm font-bold text-ink">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      inputMode="email"
                      placeholder="you@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={busy}
                      className="h-12 w-full rounded-xl bg-white/80 px-4 text-sm text-ink outline-none ring-1 ring-inset ring-white placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="mb-1.5 block text-sm font-bold text-ink">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={busy}
                        className="h-12 w-full rounded-xl bg-white/80 pr-12 pl-4 text-sm text-ink outline-none ring-1 ring-inset ring-white placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:bg-white hover:text-ink"
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  {status === "error" && (
                    <p className="text-sm font-semibold text-red-600" role="alert">
                      {message}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-bold text-white shadow-[0_14px_30px_rgba(31,100,224,0.3)] transition-[transform,background-color,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:bg-brand-700 active:translate-y-0 active:bg-brand-800 disabled:pointer-events-none disabled:opacity-60"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {mode === "signup" ? "Creating account…" : "Signing in…"}
                      </>
                    ) : (
                      <>
                        {mode === "signup" ? "Get started" : "Sign in"}
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </button>

                  <p className="text-center text-sm text-muted">
                    {mode === "signup" ? (
                      <>
                        Already have an account?{" "}
                        <button
                          type="button"
                          onClick={() => switchMode("signin")}
                          className="font-bold text-brand-700 hover:text-brand-800"
                        >
                          Sign in
                        </button>
                      </>
                    ) : (
                      <>
                        New to JobPosted?{" "}
                        <button
                          type="button"
                          onClick={() => switchMode("signup")}
                          className="font-bold text-brand-700 hover:text-brand-800"
                        >
                          Create an account
                        </button>
                      </>
                    )}
                  </p>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        <p className="relative text-center text-xs leading-5 text-muted">
          By continuing you agree to our{" "}
          <Link href="/terms" className="font-semibold text-ink/70 hover:text-ink">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-semibold text-ink/70 hover:text-ink">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

/** Left brand panel — the blue liquid-glass scene mirroring the landing hero. */
function BrandPanel({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative hidden overflow-hidden text-white lg:block">
      <div className="absolute inset-0 bg-[linear-gradient(155deg,#082555_0%,#11408f_34%,#1f64e0_62%,#4f9cf7_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(50rem_28rem_at_82%_-6%,rgba(125,200,255,0.38),transparent_60%),radial-gradient(40rem_24rem_at_6%_112%,rgba(94,228,255,0.22),transparent_60%)]" />
      <div className="absolute top-[10%] left-[8%] h-44 w-64 opacity-40 [background-image:radial-gradient(rgba(255,255,255,0.5)_1.5px,transparent_1.5px)] [background-size:20px_20px]" />
      <span className="absolute top-[14%] right-[12%] aspect-square w-[28%] rounded-full border border-white/12" />
      <span className="absolute top-[20%] right-[18%] aspect-square w-[16%] rounded-full border border-dashed border-white/20" />

      <div className="relative flex h-full flex-col justify-between p-12">
        <Link href="/" aria-label="JobPosted home" className="w-fit">
          <Logo className="text-white [&_span]:!text-white" />
        </Link>

        <div>
          <motion.span
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="glass-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white"
            style={{ background: "rgba(255,255,255,0.14)" }}
          >
            <ShieldCheck className="size-3.5" />
            Applies automatically — you acknowledge each day
          </motion.span>

          <motion.h2
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: EASE }}
            className="mt-6 max-w-md text-4xl font-extrabold tracking-[-0.04em] text-balance xl:text-5xl"
          >
            Your job applications, sent for you every day.
          </motion.h2>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16, ease: EASE }}
            className="mt-5 max-w-md text-base leading-7 text-pretty text-white/75"
          >
            JobPosted finds matching roles, tailors your resume to each one, and submits the
            application automatically. You just acknowledge each day&apos;s batch.
          </motion.p>
        </div>

        {/* Floating mini cards */}
        <div className="relative h-40">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24, rotate: -6 }}
            animate={{ opacity: 1, y: 0, rotate: -6 }}
            transition={{ duration: 0.6, delay: 0.24, ease: EASE }}
            className="liquid-glass-dark soft-float absolute bottom-4 left-0 w-72 rounded-3xl p-4"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(150deg,#ffd98a,#f8b84e)] text-sm font-black text-[#3d2c05]">
                S
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold">Senior Product Designer</p>
                <p className="truncate text-xs font-semibold text-white/65">Stripe · Remote</p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-brand-700">
                96% fit
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24, rotate: 5 }}
            animate={{ opacity: 1, y: 0, rotate: 5 }}
            transition={{ duration: 0.6, delay: 0.34, ease: EASE }}
            className="liquid-glass-dark soft-float-slow absolute right-2 bottom-16 flex items-center gap-3 rounded-full py-2.5 pr-2.5 pl-5"
          >
            <span className="text-sm font-extrabold">Application sent</span>
            <span className="grid size-8 place-items-center rounded-full bg-white text-brand-700">
              <Send className="size-4" />
            </span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

