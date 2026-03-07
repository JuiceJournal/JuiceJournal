'use client';

const ICONS = {
  sigil: (
    <>
      <path d="M12 2.5 19.5 7v10L12 21.5 4.5 17V7Z" />
      <path d="M12 6.5 16 9v6l-4 2.5L8 15V9Z" />
      <path d="M12 2.5v19" />
    </>
  ),
  atlas: (
    <>
      <path d="M4.5 7.5 12 3l7.5 4.5v9L12 21l-7.5-4.5Z" />
      <path d="M12 3v18" />
      <path d="M4.5 7.5 12 12l7.5-4.5" />
    </>
  ),
  sessions: (
    <>
      <path d="M5 5.5h14v13H5Z" />
      <path d="M5 9.5h14" />
      <path d="M9 9.5v9" />
      <path d="M12.5 13h4" />
      <path d="M12.5 16h4" />
    </>
  ),
  market: (
    <>
      <path d="M5 18.5h14" />
      <path d="M7 18.5V9.5" />
      <path d="M12 18.5V5.5" />
      <path d="M17 18.5v-6" />
      <path d="M5 12.5 9.5 8 13 10.5 19 4.5" />
    </>
  ),
  ladder: (
    <>
      <path d="M6.5 18.5h11" />
      <path d="M8 18.5v-5h2.5v5" />
      <path d="M11.25 18.5v-8h2.5v8" />
      <path d="M14.5 18.5v-11H17v11" />
      <path d="M12 3.5 13.25 6h2.75l-2.25 1.75.75 2.75L12 9l-2.5 1.5.75-2.75L8 6h2.75Z" />
    </>
  ),
  vault: (
    <>
      <path d="M4.5 7.5h15v11h-15Z" />
      <path d="M4.5 11.5h15" />
      <path d="M9 7.5V5h6v2.5" />
      <circle cx="12" cy="15" r="1.25" />
    </>
  ),
  route: (
    <>
      <path d="M6 6.5h.01" />
      <path d="M18 8.5h.01" />
      <path d="M9 17.5h.01" />
      <path d="M6 6.5 18 8.5 9 17.5 16.5 18" />
    </>
  ),
  pulse: (
    <>
      <path d="M4.5 12h3l2-4 3 8 2.5-5h4.5" />
      <path d="M4.5 5.5h15v13h-15Z" />
    </>
  ),
  gate: (
    <>
      <path d="M6 19V5.5h8L18 9v10Z" />
      <path d="M14 5.5V9h4" />
      <path d="M9.5 12.5h4" />
    </>
  ),
};

export default function PoeChromeIcon({
  type = 'sigil',
  size = 18,
  className = '',
  strokeWidth = 1.7,
}) {
  const icon = ICONS[type];
  if (!icon) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {icon}
    </svg>
  );
}
