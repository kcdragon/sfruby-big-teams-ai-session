const strokeIcon = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${paths}</svg>`

export const ICONS = {
  Code: strokeIcon('<polyline points="8 6 2 12 8 18"/><polyline points="16 6 22 12 16 18"/>'),
  Star: strokeIcon('<polygon points="12 2 15 9 22 9.5 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9.5 9 9"/>'),
  Wrench: strokeIcon('<path d="M14.5 3.5a5 5 0 0 0-4.8 6.6L3 16.8V21h4.2l6.7-6.7a5 5 0 0 0 6.6-4.8l-3 3-3.6-.9-.9-3.6z"/>'),
  Check: strokeIcon('<polyline points="4 12 10 18 20 6"/>'),
  Users: strokeIcon('<circle cx="9" cy="8" r="4"/><path d="M1 21v-1a7 7 0 0 1 14 0v1"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M19 14a6 6 0 0 1 4 6v1"/>'),
  Lightbulb: strokeIcon('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z"/>'),
}

export function renderIcons(root) {
  root.querySelectorAll("x-icon").forEach((icon) => {
    icon.innerHTML = ICONS[icon.getAttribute("name")] ?? ""
  })
}
