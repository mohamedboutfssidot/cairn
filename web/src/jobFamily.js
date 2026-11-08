// Regroupe les offres par "famille de poste" normalisée : "Senior AI Engineer",
// "AI/ML Engineer (Remote)", "Lead Machine Learning Engineer" -> toutes sous
// une même famille lisible, pour l'onglet "Par poste". Heuristique simple par
// mots-clés — pas de ML, mais suffisant pour regrouper le vocabulaire réel du
// domaine (AI/ML/Applied AI Engineer, Data Scientist, MLOps, Research...).

const FAMILY_RULES = [
  { key: "applied-ai", label: "Applied AI Engineer", test: /\bapplied\s+ai\b/i },
  { key: "mlops", label: "MLOps Engineer", test: /\bml\s*ops\b/i },
  { key: "ai-research", label: "AI Research / Scientist", test: /\b(ai|machine learning|ml)\s+(research(er)?|scientist)\b/i },
  { key: "data-scientist", label: "Data Scientist", test: /\bdata\s+scientist\b/i },
  { key: "ml-engineer", label: "Machine Learning Engineer", test: /\bmachine\s+learning\s+engineer\b|\bml\s+engineer\b/i },
  { key: "ai-engineer", label: "AI Engineer", test: /\bai([\/\s-]*ml)?\s+engineer\b|\bartificial\s+intelligence\s+engineer\b/i },
  { key: "llm", label: "LLM / NLP Engineer", test: /\bllm\b|\bnlp\b|\bgenerative\s+ai\b/i },
  { key: "computer-vision", label: "Computer Vision Engineer", test: /\bcomputer\s+vision\b/i },
  { key: "data-engineer", label: "Data Engineer", test: /\bdata\s+engineer\b/i },
  { key: "product-ai", label: "Product (AI-focused)", test: /\bproduct\s+(manager|designer|engineer)\b/i },
  { key: "other-eng", label: "Autres postes techniques", test: /\bengineer\b|\bdeveloper\b/i },
];

function seniorityOf(title) {
  const t = title.toLowerCase();
  if (/\b(staff|principal)\b/.test(t)) return "Staff / Principal";
  if (/\b(lead|head of)\b/.test(t)) return "Lead";
  if (/\bsenior\b|\bsr\.?\b/.test(t)) return "Senior";
  if (/\bjunior\b|\bjr\.?\b|\bentry[\s-]level\b/.test(t)) return "Junior";
  return "Non précisé";
}

export function classifyJob(job) {
  const title = job.title || "";
  const rule = FAMILY_RULES.find((r) => r.test.test(title));
  return {
    familyKey: rule ? rule.key : "other",
    familyLabel: rule ? rule.label : "Autres",
    seniority: seniorityOf(title),
  };
}

export function groupByFamily(jobs) {
  const groups = new Map();
  for (const job of jobs) {
    const { familyKey, familyLabel } = classifyJob(job);
    if (!groups.has(familyKey)) {
      groups.set(familyKey, { key: familyKey, label: familyLabel, jobs: [] });
    }
    groups.get(familyKey).jobs.push(job);
  }
  return [...groups.values()].sort((a, b) => b.jobs.length - a.jobs.length);
}
