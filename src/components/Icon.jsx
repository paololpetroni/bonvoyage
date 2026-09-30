// Simple line icons drawn for Bonvoyage (24 x 24, stroke uses the current text colour)
const PATHS = {
  restaurants: <><path d="M6 3v6a2 2 0 0 0 4 0V3" /><path d="M8 11v10" /><path d="M17 3c-2 2-3 5-3 9h3v9" /></>,
  bars: <><path d="M5 4h14l-7 8z" /><path d="M12 12v7" /><path d="M8 20h8" /><path d="M8.5 7.5h7" /></>,
  hotels: <><path d="M3 19V6" /><path d="M3 15h18v4" /><path d="M21 15v-3a3 3 0 0 0-3-3h-7v6" /><circle cx="7" cy="11.5" r="1.8" /></>,
  sports: <><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z" /><path d="M14.5 7v2M14.5 11v2M14.5 15v2" /></>,
  sights: <><path d="M4 8.5h3.2L9 6h6l1.8 2.5H20V19H4z" /><circle cx="12" cy="13.5" r="3.2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  user: <><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></>,
  pin: <><path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  check: <><path d="M5 12.5l4.5 4.5L19 7.5" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" /></>,
  spark: <><path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" /></>,
};

export default function Icon({ name, size = 20, className = "", label }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-hidden={label ? undefined : true} aria-label={label}>
      {PATHS[name] || null}
    </svg>
  );
}
