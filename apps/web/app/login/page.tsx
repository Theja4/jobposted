import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/landing/Logo";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to JobPosted.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center" aria-label="JobPosted home">
          <Logo className="text-xl" />
        </Link>

        <div className="rounded-2xl border border-zinc-100 bg-white p-7 shadow-sm">
          <h1 className="text-center text-xl font-bold text-ink">Sign in to JobPosted</h1>
          <p className="mt-1.5 mb-6 text-center text-sm text-muted">
            Apply to the right jobs while you sleep.
          </p>

          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">
              Sign-in failed. Please try again.
            </p>
          )}

          <LoginForm next={next} />
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          By continuing you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
