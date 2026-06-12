function initials(email?: string) {
  if (!email) return "JP";
  const handle = email.split("@")[0] ?? "";
  const parts = handle.split(/[._-]+/).filter(Boolean);
  const base =
    parts.length >= 2 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : handle.slice(0, 2);
  return (base || "JP").toUpperCase();
}

export function Topbar({ email }: { email?: string }) {
  return (
    <header className="flex items-center justify-end gap-3">
      <div className="flex items-center gap-2.5 rounded-full bg-white/70 py-1.5 pr-4 pl-1.5 ring-1 ring-inset ring-white">
        <span className="grid size-8 place-items-center rounded-full bg-[linear-gradient(150deg,#2f7df4,#1f50c0)] text-xs font-black text-white">
          {initials(email)}
        </span>
        <span className="hidden max-w-[12rem] truncate text-sm font-bold text-ink sm:block">
          {email ?? "Your account"}
        </span>
      </div>
    </header>
  );
}
