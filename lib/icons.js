// Small inline SVG icons (rendered with <%- icon('name') %>). Decorative, so aria-hidden.
const stroke = (inner) =>
  `<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;

const badge = (text) =>
  `<svg class="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><rect width="24" height="24" rx="6" fill="currentColor"/><text x="12" y="16.6" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${text.length > 1 ? 11 : 15}" fill="var(--badge-ink, #fff)">${text}</text></svg>`;

const icons = {
  sun: stroke(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
  ),
  moon: stroke('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  menu: stroke('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  close: stroke('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: stroke('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  upload: stroke('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  download: stroke('<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1"/>'),
  folder: stroke('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  shield: stroke('<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  users: stroke(
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .6 3.2 2.3 3.5 5.2"/>'
  ),
  heart: stroke('<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/>'),
  linkedin: badge('in'),
  facebook: badge('f'),
};

// The daffodil mark: six petals and a corona.
const logo = (size = 30) => {
  let petals = '';
  for (let i = 0; i < 6; i++) {
    petals += `<ellipse cx="16" cy="7.6" rx="4.1" ry="7.2" transform="rotate(${i * 60} 16 16)" fill="#f2b705"/>`;
  }
  return `<svg class="logo" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" focusable="false">${petals}<circle cx="16" cy="16" r="5.2" fill="#e8820c"/><circle cx="16" cy="16" r="2.4" fill="#fff1bd"/></svg>`;
};

module.exports = { icon: (name) => icons[name] || '', logo };
