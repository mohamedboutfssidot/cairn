// Statuts du suivi de candidatures (mêmes identifiants que tracking.py).
export const STATUSES = [
  { id: "saved", label: "À voir", short: "À voir" },
  { id: "applied", label: "Postulé", short: "Postulé" },
  { id: "interview", label: "Entretien", short: "Entretien" },
  { id: "offer", label: "Offre", short: "Offre" },
  { id: "rejected", label: "Refusé", short: "Refusé" },
];

export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));

// Niveau de pertinence -> couleur (classe CSS score--high / mid / low).
export function scoreLevel(score) {
  if (score === null || score === undefined) return null;
  if (score >= 70) return "high";
  if (score >= 45) return "mid";
  return "low";
}

// Une relance est "due" si sa date est aujourd'hui ou passée.
export function followUpState(date) {
  if (!date) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) return "late";
  if (date === today) return "today";
  return "later";
}

// --- Données structurées extraites des offres (voir extract.py) ---------------
export const LEVEL_LABEL = {
  intern: "Stage / alternance",
  junior: "Junior",
  mid: "Confirmé",
  senior: "Senior",
  lead: "Lead / Principal",
  manager: "Management",
};

export const LANG_LABEL = {
  en: "Anglais", fr: "Français", de: "Allemand", es: "Espagnol",
  pt: "Portugais", nl: "Néerlandais", pl: "Polonais", ar: "Arabe",
};

// Seuils de salaire annuel en USD (valeurs en chaîne : ce sont des paramètres d'URL).
export const SALARY_STEPS = [
  { value: "", label: "Tous" },
  { value: "30000", label: "30k" },
  { value: "60000", label: "60k" },
  { value: "90000", label: "90k" },
  { value: "120000", label: "120k+" },
];

export function salaryLabel(v) {
  return v ? `≥ ${Math.round(Number(v) / 1000)}k $` : "";
}

export function formatSalary(min, max) {
  if (!min && !max) return null;
  const k = (n) => `${Math.round(n / 1000)}k`;
  return min && max && min !== max ? `${k(min)} – ${k(max)} $/an` : `${k(max || min)} $/an`;
}