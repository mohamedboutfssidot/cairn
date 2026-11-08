// Regroupement des offres « par poste » : rattachement précis d'un titre d'offre à un poste recherché
// ou à une famille, et statistiques par groupe.
import { CATS, ROLES, compat } from "./meta.js";

const strip = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Expressions remplacées avant le découpage en mots.
const PHRASES = [
  [/machine[\s-]*learning|apprentissage automatique|aprendizaje automatico|maschinelles lernen/g, " machinelearning "],
  [/\bml\b/g, " machinelearning "],
  [/artificial intelligence|intelligence artificielle|inteligencia artificial|kunstliche intelligenz/g, " ai "],
  [/computer vision|vision par ordinateur|vision artificielle|vision artificial/g, " computervision "],
  [/full[\s-]*stack/g, " fullstack "],
  [/back[\s-]*end/g, " backend "],
  [/front[\s-]*end/g, " frontend "],
  [/business intelligence/g, " bi "],
  [/site reliability/g, " sre "],
  [/data[\s-]*science/g, " data scientist "],
  [/cyber[\s-]*securite|cyber[\s-]*security|securite|sicherheit|seguridad/g, " security "],
  [/prompt[\s-]*engineer/g, " promptengineer "],
  [/chef de produit|gerente de producto|produktmanager/g, " product manager "],
  [/chef de projet|gerente de proyecto|projektmanager/g, " project manager "],
];
// Mots équivalents (toutes langues) -> un seul mot canonique.
const CANON = {
  ia: "ai", ki: "ai",
  ingenieur: "engineer", ingenieurin: "engineer", ingeniero: "engineer", ingeniera: "engineer",
  developer: "engineer", developpeur: "engineer", developpeuse: "engineer", desarrollador: "engineer", entwickler: "engineer", dev: "engineer", programmer: "engineer",
  analyste: "analyst", analista: "analyst", analytiker: "analyst",
  scientifique: "scientist", cientifico: "scientist", science: "scientist", sciences: "scientist", wissenschaftler: "scientist", chercheur: "researcher", investigador: "researcher", research: "researcher", forscher: "researcher",
  donnees: "data", datos: "data", daten: "data", dateningenieur: "data engineer",
  logiciel: "software", mobil: "mobile", movil: "mobile", produit: "product", producto: "product", produkt: "product",
  projet: "project", proyecto: "project", chef: "manager", gerente: "manager", responsable: "manager", gestionnaire: "manager",
  designer: "designer", conception: "design", diseñador: "designer", disenador: "designer",
  plateforme: "platform", plataforma: "platform", plattform: "platform", nuage: "cloud",
  bases: "database", base: "database", bdd: "database", administrateur: "administrator", administrador: "administrator",
  architecte: "architect", arquitecto: "architect", architekt: "architect",
};
const STOP = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "en", "et", "and", "of", "for", "the", "a", "an", "at", "in", "to", "y", "e", "und", "para", "pour", "con", "avec", "with",
  "senior", "sr", "junior", "jr", "lead", "principal", "staff", "intern", "internship", "stagiaire", "associate", "confirme", "experimente", "expert", "head",
  "ii", "iii", "iv", "i", "h", "f", "m", "w", "x", "remote", "hybrid", "hybride", "teletravail", "cdi", "cdd", "full", "time", "part", "fulltime", "parttime", "new"]);

export function tokens(title) {
  let s = strip(title).replace(/\([^)]*\)/g, " ").replace(/[/|,;:–—\-_.+#&@!?"'’]/g, " ");
  PHRASES.forEach(([re, to]) => { s = s.replace(re, to); });
  const out = new Set();
  s.split(/\s+/).forEach((w) => {
    if (!w || /^\d+$/.test(w)) return;
    const c = CANON[w] || w;
    c.split(" ").forEach((x) => { if (x && !STOP.has(x)) out.add(x); });
  });
  // « machinelearning » compte pour un seul mot
  return out;
}
const sig = (set) => [...set].sort().join(" ");

/** Poste recherché : un groupe par ensemble de mots canoniques (« Ingénieur Machine Learning » = « Machine Learning Engineer »). */
export function buildPostes(keywords) {
  const map = new Map();
  (keywords || []).forEach((k) => {
    const t = tokens(k);
    if (!t.size) return;
    const key = sig(t);
    if (!map.has(key)) map.set(key, { id: "p:" + key, label: String(k).trim(), variants: [String(k).trim()], tokens: t });
    else { const g = map.get(key); if (!g.variants.includes(String(k).trim())) g.variants.push(String(k).trim()); }
  });
  return [...map.values()];
}

/** Meilleur groupe pour un titre : tous les mots du poste doivent figurer dans le titre ; le plus spécifique gagne. */
export function assign(title, groups) {
  const jt = tokens(title);
  let best = null;
  groups.forEach((g) => {
    for (const w of g.tokens) if (!jt.has(w)) return;
    const extra = jt.size - g.tokens.size;         // moins de mots en trop = rattachement plus précis
    if (!best || g.tokens.size > best.g.tokens.size || (g.tokens.size === best.g.tokens.size && extra < best.extra)) best = { g, extra };
  });
  return best ? best.g : null;
}

// --- familles : mêmes titres que l'assistant de recherche, dans toutes les langues -----
let FAMS = null;
function families() {
  if (FAMS) return FAMS;
  FAMS = CATS.map((c) => {
    const keys = new Map();
    ROLES.filter((r) => r.cat === c.id).forEach((r) => Object.values(r.t).forEach((t) => { const tk = tokens(t); if (tk.size) keys.set(sig(tk), { tokens: tk }); }));
    return { id: "f:" + c.id, label: c.label, hint: c.hint, tokens: null, roles: [...keys.values()] };
  });
  return FAMS;
}
const FALLBACK = [
  ["ai", /\b(ai|machinelearning|llm|nlp|computervision|mlops|promptengineer|deep|genai|generative)\b/],
  ["data", /\b(data|bi|analytics|etl|dwh|sql)\b/],
  ["infra", /\b(devops|cloud|sre|security|platform|infrastructure|kubernetes|sysadmin|network)\b/],
  ["software", /\b(software|backend|frontend|fullstack|mobile|web|java|python|golang|react|qa|test)\b/],
  ["product", /\b(product|project|ux|ui|designer|scrum|agile)\b/],
];
export function familyOf(title) {
  const jt = tokens(title);
  let best = null;
  families().forEach((f) => f.roles.forEach((r) => {
    for (const w of r.tokens) if (!jt.has(w)) return;
    if (!best || r.tokens.size > best.n) best = { f, n: r.tokens.size };
  }));
  if (best) return best.f;
  const flat = [...jt].join(" ");
  for (const [id, re] of FALLBACK) if (re.test(flat)) return families().find((f) => f.id === "f:" + id);
  return null;
}

// --- statistiques d'un groupe -------------------------------------------------------
const mid = (j) => (j.sal_usd_min && j.sal_usd_max ? (j.sal_usd_min + j.sal_usd_max) / 2 : j.sal_usd_min || j.sal_usd_max || null);
const pct = (arr, p) => { const a = [...arr].sort((x, y) => x - y); const i = (a.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
const top = (jobs, get, n) => {
  const m = new Map();
  jobs.forEach((j) => [].concat(get(j) ?? []).forEach((v) => { if (v) m.set(v, (m.get(v) || 0) + 1); }));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => ({ k, c }));
};

export function statsOf(jobs) {
  const n = jobs.length;
  const dist = { 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 };
  jobs.forEach((j) => { dist[compat(j.score).n]++; });
  const scored = jobs.filter((j) => j.score != null);
  const best = [...jobs].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.days ?? 9999) - (b.days ?? 9999))[0] || null;
  const sal = jobs.map(mid).filter(Boolean);
  const salary = sal.length
    ? { n: sal.length, median: pct(sal, 0.5), lo: sal.length >= 5 ? pct(sal, 0.1) : Math.min(...sal), hi: sal.length >= 5 ? pct(sal, 0.9) : Math.max(...sal) }
    : null;
  return {
    n, fresh: jobs.filter((j) => j.is_new).length, remote: jobs.filter((j) => j.remote === true).length,
    tracked: jobs.filter((j) => j.status).length, dist, best,
    avg: scored.length ? Math.round(scored.reduce((s, j) => s + j.score, 0) / scored.length) : null,
    salary, levels: top(jobs, (j) => j.level, 3), langs: top(jobs, (j) => j.langs, 3),
  };
}

/** mode : "poste" (postes recherchés) ou "famille". -> [{id,label,hint?,variants?,jobs,stats}] triés, + « Autres » à la fin. */
export function groupJobs(jobs, mode, keywords) {
  const buckets = new Map();
  const others = [];
  let groups;
  if (mode === "poste") groups = buildPostes(keywords);
  const put = (g, j) => { if (!buckets.has(g.id)) buckets.set(g.id, { ...g, jobs: [] }); buckets.get(g.id).jobs.push(j); };
  jobs.forEach((j) => {
    const g = mode === "poste" ? assign(j.title, groups) : familyOf(j.title);
    if (g) put(g, j); else others.push(j);
  });
  if (mode === "poste") groups.forEach((g) => { if (!buckets.has(g.id)) buckets.set(g.id, { ...g, jobs: [] }); });
  const out = [...buckets.values()].map((g) => ({ id: g.id, label: g.label, hint: g.hint, variants: g.variants, jobs: g.jobs, stats: statsOf(g.jobs) }));
  out.sort((a, b) => b.stats.n - a.stats.n);
  if (others.length) out.push({ id: "other", label: "Autres postes", hint: "Offres qui ne correspondent à aucun poste ci-dessus", jobs: others, stats: statsOf(others), other: true });
  return out;
}