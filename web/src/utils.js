export function parsePostedDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function daysAgo(value) {
  const d = parsePostedDate(value);
  if (!d) return null;
  const diffMs = Date.now() - d.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function formatAge(value) {
  const n = daysAgo(value);
  if (n === null) return "Date inconnue";
  if (n <= 0) return "Aujourd'hui";
  if (n === 1) return "Hier";
  if (n < 30) return `${n} jours`;
  if (n < 365) return `${Math.floor(n / 30)} mois`;
  return `${Math.floor(n / 365)} an(s)`;
}

export function stripHtml(html) {
  if (!html) return "";
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text;
}
