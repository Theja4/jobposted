export function ChromeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d="M50,50 L50,0 A50,50 0 0,1 93.30,75 Z" fill="#EA4335" />
      <path d="M50,50 L93.30,75 A50,50 0 0,1 6.70,75 Z" fill="#FBBC05" />
      <path d="M50,50 L6.70,75 A50,50 0 0,1 50,0 Z" fill="#34A853" />
      <circle cx="50" cy="50" r="34" fill="#fff" />
      <circle cx="50" cy="50" r="27" fill="#4285F4" />
    </svg>
  );
}
