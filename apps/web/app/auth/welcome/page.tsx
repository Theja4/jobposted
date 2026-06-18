import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { AuthWelcomeClient } from "./AuthWelcomeClient";
import { sanitizeInternalPath } from "@/lib/auth/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Opening JobPosted",
  description: "Your JobPosted workspace is opening.",
  robots: { index: false, follow: false },
};

type AuthWelcomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function displayNameFromMetadata(metadata: Record<string, unknown>, email?: string) {
  const directName =
    metadata.full_name ?? metadata.name ?? metadata.user_name ?? metadata.preferred_username;
  if (typeof directName === "string" && directName.trim()) return directName.trim();
  return email?.split("@")[0] ?? "there";
}

export default async function AuthWelcomePage({ searchParams }: AuthWelcomePageProps) {
  const params = await searchParams;
  const nextPath = sanitizeInternalPath(first(params.next));
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/get-started?mode=signin" as Route);
  }

  const metadata = user.user_metadata as Record<string, unknown>;

  return (
    <AuthWelcomeClient
      displayName={displayNameFromMetadata(metadata, user.email)}
      nextPath={nextPath}
    />
  );
}
