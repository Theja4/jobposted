"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

type CompanyAvatarSize = "sm" | "md" | "lg";

type CompanyAvatarProps = {
  company: string;
  logoUrl?: string | null;
  colorSeed?: string | null;
  size?: CompanyAvatarSize;
  selected?: boolean;
  className?: string;
};

const SIZE_CLASSES: Record<CompanyAvatarSize, string> = {
  sm: "size-8 rounded-lg text-[11px]",
  md: "size-10 rounded-xl text-sm",
  lg: "size-12 rounded-2xl text-base",
};

const PALETTES = [
  { bg: "bg-slate-100", text: "text-slate-700" },
  { bg: "bg-emerald-50", text: "text-emerald-700" },
  { bg: "bg-amber-50", text: "text-amber-800" },
  { bg: "bg-rose-50", text: "text-rose-700" },
  { bg: "bg-cyan-50", text: "text-cyan-800" },
  { bg: "bg-lime-50", text: "text-lime-800" },
  { bg: "bg-orange-50", text: "text-orange-800" },
  { bg: "bg-zinc-100", text: "text-zinc-700" },
];

const AVATAR_SHADOW = "shadow-[0_12px_24px_-18px_rgba(15,23,42,0.42),0_2px_8px_-7px_rgba(15,23,42,0.18)]";

function hashCompany(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function initialsForCompany(company: string) {
  const words = company
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/i)
    .map((word) => word.trim())
    .filter(Boolean);
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  return (words[0]?.slice(0, 2) || "?").toUpperCase();
}

function proxiedLogoUrl(logoUrl: string) {
  return `/api/company-logo?url=${encodeURIComponent(logoUrl)}`;
}

export function CompanyAvatar({
  company,
  logoUrl,
  colorSeed,
  size = "md",
  selected = false,
  className,
}: CompanyAvatarProps) {
  const label = company.trim() || "Unknown company";
  const [failed, setFailed] = useState(false);
  const palette = useMemo(
    () => PALETTES[hashCompany(colorSeed || label) % PALETTES.length] ?? PALETTES[0]!,
    [colorSeed, label],
  );
  const canShowLogo = Boolean(logoUrl && !failed);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden font-black",
        SIZE_CLASSES[size],
        canShowLogo ? "bg-white text-ink" : [palette.bg, palette.text],
        selected
          ? "shadow-[0_0_0_3px_rgba(31,100,224,0.22),0_12px_24px_-18px_rgba(31,100,224,0.55)]"
          : AVATAR_SHADOW,
        className,
      )}
      title={label}
    >
      {canShowLogo ? (
        <img
          src={proxiedLogoUrl(logoUrl!)}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-4/5 w-4/5 object-contain"
        />
      ) : (
        initialsForCompany(label)
      )}
    </span>
  );
}
