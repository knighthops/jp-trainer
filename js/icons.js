// Inline line icons. They inherit colour from the surrounding text.
const svg = (d) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

export const icons = {
  today: svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
  practice: svg('<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1ZM14.5 6.5l3 3"/>'),
  kanji: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 4v16M4 12h16" stroke-dasharray="2 3"/>'),
  settings: svg('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  chevron: svg('<path d="m9 6 6 6-6 6"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  repeat: svg('<path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5"/>'),
  spark: svg('<path d="M12 4v5M12 15v5M4 12h5M15 12h5"/><circle cx="12" cy="12" r="1.2"/>'),
  blocks: svg('<rect x="3" y="4" width="8" height="7" rx="2"/><rect x="13" y="4" width="8" height="7" rx="2"/><rect x="8" y="13" width="8" height="7" rx="2"/>'),
  ear: svg('<path d="M7 10a5 5 0 0 1 10 0c0 3-3 4-3.5 6.5A2.5 2.5 0 0 1 9 16"/>'),
  info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>'),
  speaker: svg('<path d="M4 10v4h3.5L12 18V6L7.5 10H4ZM15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2.5"/>'),
  play: svg('<path d="M7 5v14l11-7L7 5Z"/>'),
  download: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
  upload: svg('<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>'),
  voice: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  bulb: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2.2h5.2c0-1 .4-1.7 1-2.2A6 6 0 0 0 12 3Z"/>'),
};
