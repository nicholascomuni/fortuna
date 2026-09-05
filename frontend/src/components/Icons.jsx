// Thin-stroke SVG icons (24×24 viewBox, stroke-based)
import { useId } from "react";

const base = "stroke-current fill-none stroke-2 stroke-linecap-round stroke-linejoin-round";

export function IconChart({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

export function IconPlus({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function IconRepeat({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

export function IconSun({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

export function IconMoon({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function IconLogOut({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function IconTrendingUp({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

export function IconTrendingDown({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
  );
}

export function IconWallet({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
    </svg>
  );
}

export function IconAlertTriangle({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function IconEdit({ className = "w-4 h-4" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function IconTrash({ className = "w-4 h-4" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function IconUser({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function IconDollarSign({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

export function IconFilter({ className = "w-4 h-4" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

export function IconX({ className = "w-4 h-4" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function IconCheck({ className = "w-4 h-4" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconChevronDown({ className = "w-4 h-4" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function IconFlask({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M9 3h6M9 3v7l-4.5 8.5A2 2 0 0 0 6.27 21h11.46a2 2 0 0 0 1.77-2.5L15 10V3" />
      <path d="M7.5 16h9" />
    </svg>
  );
}

export function IconSettings({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function IconDownload({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function IconUpload({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export function IconLock({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function IconGlobe({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function IconBarChart({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6"  y1="20" x2="6"  y2="14" />
      <line x1="2"  y1="20" x2="22" y2="20" />
    </svg>
  );
}

export function IconTarget({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

export function IconPiggyBank({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8.5 3.5 1.5 4.5 1 1.1 1.5 3.5 1.5 4.5h7s0-2 1-2 1 2 1 2h3s.5-4 2-6c.5-1 1-2 1-3C23 7.1 21.3 5 19 5z" />
      <path d="M9 14a1 1 0 1 0 2 0 1 1 0 0 0-2 0z" />
      <line x1="17" y1="8" x2="17" y2="8" />
    </svg>
  );
}

export function IconCreditCard({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

export function IconBank({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <polygon points="12 2 2 8 22 8" />
      <line x1="3" y1="21" x2="21" y2="21" />
      <line x1="5" y1="8" x2="5" y2="21" />
      <line x1="10" y1="8" x2="10" y2="21" />
      <line x1="14" y1="8" x2="14" y2="21" />
      <line x1="19" y1="8" x2="19" y2="21" />
    </svg>
  );
}

export function IconMaximize({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

export function IconPercent({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

export function IconMenu({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function IconUserCircle({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 19a5.5 5.5 0 0 1 11 0" />
    </svg>
  );
}

export function IconSparkles({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </svg>
  );
}

export function IconSend({ className = "w-5 h-5" }) {
  return (
    <svg className={`${base} ${className}`} viewBox="0 0 24 24">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

// Fortuna wordmark — a solid amber circle with a thick "F" punched out of
// it. The F is a true cutout (an SVG mask), not a fixed color, so whatever
// sits behind the icon shows through — the page background, the header bar,
// etc. — and it stays correct across light/dark theme without needing to
// know the exact color at render time. Self-contained (this IS the whole
// badge — no wrapping colored container needed around it).
export function IconFortuna({ className = "w-5 h-5" }) {
  const maskId = useId();
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" />
        <rect x="8" y="5" width="3.6" height="14" rx="1" fill="#000" />
        <rect x="8" y="5" width="8.5" height="3.6" rx="1" fill="#000" />
        <rect x="8" y="10.5" width="6" height="3.6" rx="1" fill="#000" />
      </mask>
      <circle cx="12" cy="12" r="11" fill="#fbbf24" mask={`url(#${maskId})`} />
    </svg>
  );
}
