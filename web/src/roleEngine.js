// Moteur de postes suggérés.
//
// Idée : les offres d'un pays sont écrites dans SA langue (et souvent en
// anglais pour le tech). Chercher "Data Engineer" au Maroc ou en Allemagne
// rate donc une grande partie du marché : "Ingénieur Data" (Maroc, France) ou
// "Dateningenieur" / "Softwareentwickler" (Allemagne) sont ce que les
// recruteurs écrivent réellement.
//
// Le moteur combine :
//   - un catalogue de RÔLES (concepts) traduits dans plusieurs langues ;
//   - pour chaque pays, les langues des offres et leur POIDS (ex. Maroc :
//     français 1.0, anglais 0.85 ; Pays-Bas : anglais 1.0, néerlandais 0.7) ;
//   - une orientation (IA/Data, Développement, Systèmes) choisie par l'utilisateur.
// Il renvoie une sélection classée, limitée au nombre de requêtes que la
// recherche accepte (MAX_TERMS), plutôt qu'une liste figée.

export const LANGS = {
  en: { label: "English", short: "EN" },
  fr: { label: "Français", short: "FR" },
  de: { label: "Deutsch", short: "DE" },
  es: { label: "Español", short: "ES" },
  pt: { label: "Português", short: "PT" },
  nl: { label: "Nederlands", short: "NL" },
  pl: { label: "Polski", short: "PL" },
};

export const CATEGORIES = [
  { id: "ai", label: "IA / Data", hint: "ML, data science, LLM", bonus: 0.3 },
  { id: "dev", label: "Développement", hint: "Logiciel, web, mobile", bonus: 0.15 },
  { id: "sys", label: "Systèmes & Cloud", hint: "DevOps, réseaux, sécurité", bonus: 0 },
];

// Langues des offres par pays, avec leur poids (1 = langue dominante).
export const COUNTRY_LANGS = {
  usa: { en: 1 },
  uk: { en: 1 },
  canada: { en: 1, fr: 0.6 },
  australia: { en: 1 },
  singapore: { en: 1 },
  india: { en: 1 },
  philippines: { en: 1 },
  germany: { de: 1, en: 0.75 },
  france: { fr: 1, en: 0.6 },
  spain: { es: 1, en: 0.6 },
  portugal: { pt: 1, en: 0.85 },
  netherlands: { en: 1, nl: 0.7 },
  poland: { en: 1, pl: 0.8 },
  morocco: { fr: 1, en: 0.85 },
  brazil: { pt: 1, en: 0.6 },
  mexico: { es: 1, en: 0.7 },
  argentina: { es: 1, en: 0.6 },
  worldwide: { en: 1 },
};

// Rôles : cat = catégorie, w = fréquence relative dans les offres (1-10),
// en = titre anglais, puis une traduction par langue (absente = identique à l'anglais).
const R = (id, cat, w, en, tr = {}) => ({ id, cat, w, t: { en, ...tr } });

export const ROLES = [
  // --- IA / Data ---
  R("ai_engineer", "ai", 10, "AI Engineer", { fr: "Ingénieur IA", de: "KI-Ingenieur", es: "Ingeniero de IA", pt: "Engenheiro de IA", nl: "AI Engineer", pl: "Inżynier AI" }),
  R("data_scientist", "ai", 9, "Data Scientist", { es: "Científico de Datos", pt: "Cientista de Dados" }),
  R("ml_engineer", "ai", 9, "Machine Learning Engineer", { fr: "Ingénieur Machine Learning", de: "Machine Learning Ingenieur", es: "Ingeniero de Machine Learning", pt: "Engenheiro de Machine Learning", pl: "Inżynier Machine Learning" }),
  R("data_engineer", "ai", 8, "Data Engineer", { fr: "Ingénieur Data", de: "Dateningenieur", es: "Ingeniero de Datos", pt: "Engenheiro de Dados", pl: "Inżynier Danych" }),
  R("data_analyst", "ai", 7, "Data Analyst", { fr: "Analyste de données", de: "Datenanalyst", es: "Analista de Datos", pt: "Analista de Dados", pl: "Analityk danych" }),
  R("mlops", "ai", 6, "MLOps Engineer"),
  R("nlp_llm", "ai", 6, "LLM Engineer", { fr: "Ingénieur NLP" }),
  R("bi_dev", "ai", 5, "Business Intelligence Developer", { fr: "Développeur BI", de: "BI-Entwickler", es: "Desarrollador BI", pt: "Desenvolvedor BI", nl: "BI Developer", pl: "Programista BI" }),
  R("cv_engineer", "ai", 4, "Computer Vision Engineer", { fr: "Ingénieur Vision par ordinateur", de: "Computer-Vision-Ingenieur", es: "Ingeniero de Visión por Computador", pt: "Engenheiro de Visão Computacional", pl: "Inżynier Computer Vision" }),
  R("ai_researcher", "ai", 3, "AI Research Scientist", { fr: "Chercheur en IA", de: "KI-Forscher", es: "Investigador de IA", pt: "Pesquisador de IA", nl: "AI Researcher", pl: "Badacz AI" }),

  // --- Développement ---
  R("software_engineer", "dev", 9, "Software Engineer", { fr: "Ingénieur Logiciel", de: "Softwareentwickler", es: "Ingeniero de Software", pt: "Engenheiro de Software", pl: "Inżynier Oprogramowania" }),
  // "Developer" seul en anglais est trop générique (bruit) : variante EN ignorée (skipEn).
  { ...R("developer", "dev", 9, "Developer", { fr: "Développeur", de: "Entwickler", es: "Desarrollador", pt: "Desenvolvedor", nl: "Ontwikkelaar", pl: "Programista" }), skipEn: true },
  R("fullstack", "dev", 8, "Full Stack Developer", { fr: "Développeur Full Stack", de: "Full-Stack-Entwickler", es: "Desarrollador Full Stack", pt: "Desenvolvedor Full Stack", pl: "Programista Full Stack" }),
  R("python_dev", "dev", 8, "Python Developer", { fr: "Développeur Python", de: "Python-Entwickler", es: "Desarrollador Python", pt: "Desenvolvedor Python", pl: "Programista Python" }),
  R("backend", "dev", 7, "Backend Developer", { fr: "Développeur Backend", de: "Backend-Entwickler", es: "Desarrollador Backend", pt: "Desenvolvedor Backend", pl: "Programista Backend" }),
  R("frontend", "dev", 6, "Frontend Developer", { fr: "Développeur Frontend", de: "Frontend-Entwickler", es: "Desarrollador Frontend", pt: "Desenvolvedor Frontend", pl: "Programista Frontend" }),
  R("java_dev", "dev", 6, "Java Developer", { fr: "Développeur Java", de: "Java-Entwickler", es: "Desarrollador Java", pt: "Desenvolvedor Java", pl: "Programista Java" }),
  R("dotnet_dev", "dev", 5, ".NET Developer", { fr: "Développeur .NET", de: ".NET-Entwickler", es: "Desarrollador .NET", pt: "Desenvolvedor .NET", pl: "Programista .NET" }),
  R("mobile_dev", "dev", 5, "Mobile Developer", { fr: "Développeur Mobile", de: "Mobile-Entwickler", es: "Desarrollador Móvil", pt: "Desenvolvedor Mobile", pl: "Programista Mobile" }),
  R("qa_engineer", "dev", 5, "QA Engineer", { fr: "Ingénieur QA", de: "QA-Ingenieur", es: "Ingeniero QA", pt: "Engenheiro de QA", pl: "Inżynier QA" }),

  // --- Systèmes & Cloud ---
  R("devops", "sys", 7, "DevOps Engineer", { fr: "Ingénieur DevOps", es: "Ingeniero DevOps", pt: "Engenheiro DevOps", pl: "Inżynier DevOps" }),
  R("cloud_engineer", "sys", 6, "Cloud Engineer", { fr: "Ingénieur Cloud", de: "Cloud-Ingenieur", es: "Ingeniero Cloud", pt: "Engenheiro Cloud", pl: "Inżynier Cloud" }),
  R("sysadmin", "sys", 6, "Systems Administrator", { fr: "Administrateur Système", de: "Systemadministrator", es: "Administrador de Sistemas", pt: "Administrador de Sistemas", nl: "Systeembeheerder", pl: "Administrator Systemów" }),
  R("cyber", "sys", 6, "Cybersecurity Engineer", { fr: "Ingénieur Cybersécurité", de: "IT-Sicherheitsexperte", es: "Ingeniero de Ciberseguridad", pt: "Engenheiro de Cibersegurança", pl: "Specjalista ds. cyberbezpieczeństwa" }),
  R("network", "sys", 5, "Network Engineer", { fr: "Ingénieur Réseaux", de: "Netzwerkadministrator", es: "Ingeniero de Redes", pt: "Engenheiro de Redes", nl: "Netwerkbeheerder", pl: "Inżynier Sieci" }),
  R("it_support", "sys", 5, "IT Support Engineer", { fr: "Technicien Support Informatique", de: "IT-Support", es: "Soporte Técnico IT", pt: "Suporte Técnico de TI", nl: "IT Support Medewerker", pl: "Specjalista IT Support" }),
  R("it_pm", "sys", 5, "IT Project Manager", { fr: "Chef de projet informatique", de: "IT-Projektleiter", es: "Jefe de Proyecto TI", pt: "Gerente de Projetos de TI", nl: "IT Projectmanager", pl: "Kierownik Projektu IT" }),
];

// Portugal : "Programador" est plus courant que "Desenvolvedor" (brésilien).
const TITLE_OVERRIDES = {
  portugal: { developer: { pt: "Programador" }, fullstack: { pt: "Programador Full Stack" }, python_dev: { pt: "Programador Python" }, backend: { pt: "Programador Backend" }, frontend: { pt: "Programador Frontend" }, java_dev: { pt: "Programador Java" } },
};

export function languagesFor(countryId) {
  return COUNTRY_LANGS[countryId] || { en: 1 };
}

export function titleOf(role, lang, countryId) {
  return TITLE_OVERRIDES[countryId]?.[role.id]?.[lang] || role.t[lang] || role.t.en;
}

// Variantes d'un rôle dans les langues actives (sans doublons : "Data
// Scientist" en FR et en EN n'est qu'une seule variante).
export function variantsOf(role, countryId, langs) {
  const out = [];
  const seen = new Set();
  for (const lang of langs) {
    if (role.skipEn && lang === "en") continue;
    const title = titleOf(role, lang, countryId);
    const key = title.toLowerCase();
    if (seen.has(key)) {
      const prev = out.find((v) => v.title.toLowerCase() === key);
      if (prev && !prev.langs.includes(lang)) prev.langs.push(lang);
      continue;
    }
    seen.add(key);
    out.push({ title, langs: [lang] });
  }
  return out;
}

// Sélection recommandée : les `limit` meilleurs couples (rôle, langue).
// score = fréquence du rôle x poids de la langue dans ce pays (+ bonus de
// catégorie si plusieurs orientations sont choisies, pour garder l'ordre
// IA > Dev > Systèmes).
export function recommend(countryId, { langs, cats, limit = 12 } = {}) {
  const weights = languagesFor(countryId);
  const activeLangs = langs && langs.length ? langs : Object.keys(weights);
  const activeCats = cats && cats.length ? cats : ["ai"];
  const catBonus = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.bonus]));

  const best = new Map(); // titre (minuscule) -> {title, score}
  for (const role of ROLES) {
    if (!activeCats.includes(role.cat)) continue;
    for (const lang of activeLangs) {
      if (role.skipEn && lang === "en") continue;
      const title = titleOf(role, lang, countryId);
      const langW = weights[lang] ?? 0.4;
      const score = role.w * langW + (activeCats.length > 1 ? catBonus[role.cat] * 10 : 0);
      const key = title.toLowerCase();
      if (!best.has(key) || best.get(key).score < score) best.set(key, { title, score });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.title);
}