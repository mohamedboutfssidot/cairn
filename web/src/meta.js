// Constantes et petits utilitaires partagés par l'interface Cairn.

export const STATUSES = [
  { id: "saved", label: "À voir" },
  { id: "applied", label: "Postulé" },
  { id: "interview", label: "Entretien" },
  { id: "offer", label: "Offre" },
  { id: "rejected", label: "Refusé" },
];
export const STLABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));
export const LEVELS = { intern: "Stage", junior: "Junior", mid: "Confirmé", senior: "Senior", lead: "Lead" };
export const LANGN = { fr: "Français", en: "Anglais", de: "Allemand", es: "Espagnol", nl: "Néerlandais", pt: "Portugais", it: "Italien", ar: "Arabe", pl: "Polonais" };
export const SAL_STEPS = [[0, "Tous"], [30000, "30k"], [60000, "60k"], [90000, "90k"], [120000, "120k+"]];

// Deux façons d'actualiser (voir search_engine.py : FAST_SOURCE_IDS).
export const MODES = {
  fast: { id: "fast", label: "Rapide", short: "Rapide", sub: "LinkedIn, Indeed et d’autres grands sites d’emploi, les sites d’emploi à distance et les pages carrières d’entreprises.", time: "Quelques minutes" },
  deep: { id: "deep", label: "Approfondie", short: "Approfondie", sub: "Fouille en plus une très grande archive d’offres. Plus complète, mais plus lente : ces offres n’indiquent pas le nom de l’entreprise.", time: "Le plus long" },
};
export const lastMode = () => { try { return localStorage.getItem("cairn-mode") || "fast"; } catch { return "fast"; } };
export const rememberMode = (m) => { try { localStorage.setItem("cairn-mode", m); } catch { /* stockage indisponible */ } };

// Compatibilité : mots plutôt qu'un score brut.
export function compat(score) {
  if (score == null) return { n: 0, label: "Non évaluée" };
  if (score >= 80) return { n: 4, label: "Excellente" };
  if (score >= 65) return { n: 3, label: "Bonne" };
  if (score >= 45) return { n: 2, label: "Moyenne" };
  return { n: 1, label: "Faible" };
}

// --- Dates ----------------------------------------------------------------------
export const pad = (n) => (n < 10 ? "0" : "") + n;
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => isoOf(new Date());
export const addDaysIso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoOf(d); };
export const fmtD = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");

export function daysSince(dateStr) {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 864e5));
}
export const ago = (d) => (d == null ? "date inconnue" : d === 0 ? "aujourd’hui" : d === 1 ? "hier" : `il y a ${d} j`);
export function lateText(follow) {
  const n = Math.round((new Date(todayIso()) - new Date(follow)) / 864e5);
  return n <= 0 ? "aujourd’hui" : `en retard de ${n} j`;
}
export const isDue = (j) => !!j.follow_up && j.follow_up <= todayIso() && j.status !== "rejected" && j.status !== "offer";

export function stripHtml(html) {
  if (!html) return "";
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent || "").replace(/\s+\n/g, "\n").trim();
}

// --- Postes : familles et suggestions (assistant de recherche) ---------------------
// t = titre dans chaque langue, w = popularité (sert à classer les suggestions).
export const CATS = [
  { id: "ai", label: "IA", hint: "Machine learning, LLM, vision" },
  { id: "data", label: "Data", hint: "Analyse, ingénierie, BI" },
  { id: "software", label: "Développement", hint: "Backend, frontend, mobile" },
  { id: "infra", label: "Cloud et DevOps", hint: "Infrastructure, réseaux, plateforme" },
  { id: "security", label: "Cybersécurité", hint: "Sécurité, audit, conformité technique" },
  { id: "product", label: "Produit et projet", hint: "Produit, gestion de projet, agile" },
  { id: "design", label: "Design et création", hint: "UX, graphisme, vidéo, rédaction" },
  { id: "marketing", label: "Marketing et communication", hint: "Digital, contenu, réseaux sociaux, SEO" },
  { id: "sales", label: "Vente et business", hint: "Commercial, partenariats, comptes clés" },
  { id: "support", label: "Service client", hint: "Support, accueil, relation client" },
  { id: "finance", label: "Finance et comptabilité", hint: "Comptabilité, audit, contrôle de gestion" },
  { id: "hr", label: "Ressources humaines", hint: "Recrutement, paie, formation" },
  { id: "legal", label: "Juridique", hint: "Juriste, conformité, contrats" },
  { id: "ops", label: "Opérations et logistique", hint: "Supply chain, achats, transport, qualité" },
  { id: "engineering", label: "Ingénierie et industrie", hint: "Mécanique, électrique, civil, production" },
  { id: "energy", label: "Énergie et environnement", hint: "Énergies renouvelables, environnement, QHSE" },
  { id: "health", label: "Santé et sciences", hint: "Santé, pharma, recherche, laboratoire" },
  { id: "education", label: "Éducation et formation", hint: "Enseignement, formation, coaching" },
  { id: "admin", label: "Administration et gestion", hint: "Assistanat, gestion de bureau, direction" },
  { id: "consulting", label: "Conseil et stratégie", hint: "Conseil, analyse métier, transformation" },
  { id: "hospitality", label: "Hôtellerie, tourisme et restauration", hint: "Hôtel, voyage, événementiel" },
  { id: "retail", label: "Commerce et immobilier", hint: "Magasin, e-commerce, immobilier" },
];
export const ROLES = [
  { cat: "ai", w: 10, t: { en: "AI Engineer", fr: "Ingénieur IA", de: "KI-Ingenieur", es: "Ingeniero de IA" } },
  { cat: "ai", w: 10, t: { en: "Machine Learning Engineer", fr: "Ingénieur Machine Learning", de: "Machine-Learning-Ingenieur", es: "Ingeniero de Machine Learning" } },
  { cat: "ai", w: 9, t: { en: "Data Scientist", fr: "Data Scientist", de: "Data Scientist", es: "Científico de datos" } },
  { cat: "ai", w: 8, t: { en: "LLM Engineer", fr: "Ingénieur LLM", de: "LLM-Ingenieur", es: "Ingeniero LLM" } },
  { cat: "ai", w: 7, t: { en: "NLP Engineer", fr: "Ingénieur NLP", de: "NLP-Ingenieur", es: "Ingeniero NLP" } },
  { cat: "ai", w: 6, t: { en: "Computer Vision Engineer", fr: "Ingénieur Vision par ordinateur", de: "Computer-Vision-Ingenieur", es: "Ingeniero de visión artificial" } },
  { cat: "ai", w: 6, t: { en: "MLOps Engineer", fr: "Ingénieur MLOps", de: "MLOps-Ingenieur", es: "Ingeniero MLOps" } },
  { cat: "ai", w: 5, t: { en: "Research Scientist", fr: "Chercheur en IA", de: "Forschungswissenschaftler KI", es: "Investigador en IA" } },
  { cat: "ai", w: 5, t: { en: "Prompt Engineer", fr: "Prompt Engineer", de: "Prompt Engineer", es: "Prompt Engineer" } },
  { cat: "ai", w: 5, t: { en: "AI Product Manager", fr: "Chef de produit IA", de: "KI-Produktmanager", es: "Gerente de producto de IA" } },
  { cat: "data", w: 10, t: { en: "Data Analyst", fr: "Analyste de données", de: "Datenanalyst", es: "Analista de datos" } },
  { cat: "data", w: 9, t: { en: "Data Engineer", fr: "Ingénieur Data", de: "Dateningenieur", es: "Ingeniero de datos" } },
  { cat: "data", w: 8, t: { en: "Business Intelligence Analyst", fr: "Analyste BI", de: "BI-Analyst", es: "Analista de BI" } },
  { cat: "data", w: 7, t: { en: "Analytics Engineer", fr: "Analytics Engineer", de: "Analytics Engineer", es: "Analytics Engineer" } },
  { cat: "data", w: 6, t: { en: "Data Architect", fr: "Architecte Data", de: "Datenarchitekt", es: "Arquitecto de datos" } },
  { cat: "data", w: 5, t: { en: "Database Administrator", fr: "Administrateur de bases de données", de: "Datenbankadministrator", es: "Administrador de bases de datos" } },
  { cat: "data", w: 5, t: { en: "Statistician", fr: "Statisticien", de: "Statistiker", es: "Estadístico" } },
  { cat: "data", w: 4, t: { en: "Data Steward", fr: "Data Steward", de: "Data Steward", es: "Responsable de calidad de datos" } },
  { cat: "software", w: 10, t: { en: "Software Engineer", fr: "Ingénieur logiciel", de: "Softwareentwickler", es: "Ingeniero de software" } },
  { cat: "software", w: 9, t: { en: "Backend Developer", fr: "Développeur Backend", de: "Backend-Entwickler", es: "Desarrollador Backend" } },
  { cat: "software", w: 9, t: { en: "Frontend Developer", fr: "Développeur Frontend", de: "Frontend-Entwickler", es: "Desarrollador Frontend" } },
  { cat: "software", w: 8, t: { en: "Full Stack Developer", fr: "Développeur Full Stack", de: "Full-Stack-Entwickler", es: "Desarrollador Full Stack" } },
  { cat: "software", w: 6, t: { en: "Mobile Developer", fr: "Développeur mobile", de: "Mobile-Entwickler", es: "Desarrollador móvil" } },
  { cat: "software", w: 5, t: { en: "QA Engineer", fr: "Ingénieur QA", de: "QA-Ingenieur", es: "Ingeniero QA" } },
  { cat: "software", w: 5, t: { en: "Java Developer", fr: "Développeur Java", de: "Java-Entwickler", es: "Desarrollador Java" } },
  { cat: "software", w: 5, t: { en: "Python Developer", fr: "Développeur Python", de: "Python-Entwickler", es: "Desarrollador Python" } },
  { cat: "software", w: 4, t: { en: "Game Developer", fr: "Développeur de jeux vidéo", de: "Spieleentwickler", es: "Desarrollador de videojuegos" } },
  { cat: "software", w: 4, t: { en: "Embedded Software Engineer", fr: "Ingénieur logiciel embarqué", de: "Embedded-Software-Ingenieur", es: "Ingeniero de software embebido" } },
  { cat: "software", w: 4, t: { en: "Technical Lead", fr: "Lead technique", de: "Technical Lead", es: "Líder técnico" } },
  { cat: "infra", w: 10, t: { en: "DevOps Engineer", fr: "Ingénieur DevOps", de: "DevOps-Ingenieur", es: "Ingeniero DevOps" } },
  { cat: "infra", w: 8, t: { en: "Cloud Engineer", fr: "Ingénieur Cloud", de: "Cloud-Ingenieur", es: "Ingeniero Cloud" } },
  { cat: "infra", w: 7, t: { en: "Site Reliability Engineer", fr: "Ingénieur SRE", de: "Site Reliability Engineer", es: "Ingeniero SRE" } },
  { cat: "infra", w: 5, t: { en: "Platform Engineer", fr: "Ingénieur Plateforme", de: "Plattformingenieur", es: "Ingeniero de plataforma" } },
  { cat: "infra", w: 6, t: { en: "Systems Administrator", fr: "Administrateur système", de: "Systemadministrator", es: "Administrador de sistemas" } },
  { cat: "infra", w: 5, t: { en: "Network Engineer", fr: "Ingénieur réseau", de: "Netzwerkingenieur", es: "Ingeniero de redes" } },
  { cat: "infra", w: 4, t: { en: "IT Support Technician", fr: "Technicien support informatique", de: "IT-Support-Techniker", es: "Técnico de soporte informático" } },
  { cat: "infra", w: 4, t: { en: "Solutions Architect", fr: "Architecte solutions", de: "Lösungsarchitekt", es: "Arquitecto de soluciones" } },
  { cat: "security", w: 8, t: { en: "Security Engineer", fr: "Ingénieur cybersécurité", de: "Sicherheitsingenieur", es: "Ingeniero de seguridad" } },
  { cat: "security", w: 7, t: { en: "Security Analyst", fr: "Analyste cybersécurité", de: "Sicherheitsanalyst", es: "Analista de seguridad" } },
  { cat: "security", w: 6, t: { en: "Penetration Tester", fr: "Pentesteur", de: "Penetrationstester", es: "Pentester" } },
  { cat: "security", w: 5, t: { en: "Information Security Officer", fr: "Responsable sécurité des systèmes d'information", de: "Informationssicherheitsbeauftragter", es: "Responsable de seguridad de la información" } },
  { cat: "security", w: 5, t: { en: "Compliance Analyst", fr: "Analyste conformité", de: "Compliance-Analyst", es: "Analista de cumplimiento" } },
  { cat: "product", w: 9, t: { en: "Product Manager", fr: "Chef de produit", de: "Produktmanager", es: "Gerente de producto" } },
  { cat: "product", w: 7, t: { en: "Project Manager", fr: "Chef de projet", de: "Projektmanager", es: "Gerente de proyecto" } },
  { cat: "product", w: 6, t: { en: "Scrum Master", fr: "Scrum Master", de: "Scrum Master", es: "Scrum Master" } },
  { cat: "product", w: 6, t: { en: "Product Owner", fr: "Product Owner", de: "Product Owner", es: "Product Owner" } },
  { cat: "product", w: 5, t: { en: "Program Manager", fr: "Responsable de programme", de: "Programmmanager", es: "Gerente de programa" } },
  { cat: "product", w: 5, t: { en: "Business Analyst", fr: "Analyste métier", de: "Business Analyst", es: "Analista de negocio" } },
  { cat: "product", w: 4, t: { en: "Technical Project Manager", fr: "Chef de projet technique", de: "Technischer Projektleiter", es: "Jefe de proyecto técnico" } },
  { cat: "design", w: 8, t: { en: "UX Designer", fr: "Designer UX", de: "UX-Designer", es: "Diseñador UX" } },
  { cat: "design", w: 6, t: { en: "Product Designer", fr: "Product Designer", de: "Product Designer", es: "Diseñador de producto" } },
  { cat: "design", w: 6, t: { en: "UI Designer", fr: "Designer UI", de: "UI-Designer", es: "Diseñador UI" } },
  { cat: "design", w: 6, t: { en: "Graphic Designer", fr: "Graphiste", de: "Grafikdesigner", es: "Diseñador gráfico" } },
  { cat: "design", w: 5, t: { en: "Video Editor", fr: "Monteur vidéo", de: "Videoeditor", es: "Editor de vídeo" } },
  { cat: "design", w: 5, t: { en: "Content Writer", fr: "Rédacteur web", de: "Content-Autor", es: "Redactor de contenidos" } },
  { cat: "design", w: 5, t: { en: "Copywriter", fr: "Concepteur-rédacteur", de: "Texter", es: "Copywriter" } },
  { cat: "design", w: 4, t: { en: "Motion Designer", fr: "Motion Designer", de: "Motion Designer", es: "Diseñador de motion graphics" } },
  { cat: "design", w: 4, t: { en: "Translator", fr: "Traducteur", de: "Übersetzer", es: "Traductor" } },
  { cat: "marketing", w: 9, t: { en: "Digital Marketing Manager", fr: "Responsable marketing digital", de: "Digital-Marketing-Manager", es: "Responsable de marketing digital" } },
  { cat: "marketing", w: 7, t: { en: "SEO Specialist", fr: "Spécialiste SEO", de: "SEO-Spezialist", es: "Especialista SEO" } },
  { cat: "marketing", w: 7, t: { en: "Social Media Manager", fr: "Community manager", de: "Social-Media-Manager", es: "Community manager" } },
  { cat: "marketing", w: 6, t: { en: "Content Marketing Manager", fr: "Responsable marketing de contenu", de: "Content-Marketing-Manager", es: "Responsable de marketing de contenidos" } },
  { cat: "marketing", w: 6, t: { en: "Growth Marketer", fr: "Growth Marketer", de: "Growth Marketer", es: "Growth Marketer" } },
  { cat: "marketing", w: 5, t: { en: "Brand Manager", fr: "Chef de marque", de: "Markenmanager", es: "Gerente de marca" } },
  { cat: "marketing", w: 5, t: { en: "Communications Manager", fr: "Responsable communication", de: "Kommunikationsmanager", es: "Responsable de comunicación" } },
  { cat: "marketing", w: 4, t: { en: "Marketing Analyst", fr: "Analyste marketing", de: "Marketinganalyst", es: "Analista de marketing" } },
  { cat: "marketing", w: 4, t: { en: "Email Marketing Specialist", fr: "Spécialiste e-mailing", de: "E-Mail-Marketing-Spezialist", es: "Especialista en email marketing" } },
  { cat: "sales", w: 9, t: { en: "Sales Representative", fr: "Commercial", de: "Vertriebsmitarbeiter", es: "Representante de ventas" } },
  { cat: "sales", w: 8, t: { en: "Account Executive", fr: "Responsable grands comptes", de: "Account Executive", es: "Ejecutivo de cuentas" } },
  { cat: "sales", w: 7, t: { en: "Business Development Manager", fr: "Responsable développement commercial", de: "Business-Development-Manager", es: "Responsable de desarrollo de negocio" } },
  { cat: "sales", w: 6, t: { en: "Sales Development Representative", fr: "Business Developer", de: "Sales Development Representative", es: "Representante de desarrollo de ventas" } },
  { cat: "sales", w: 5, t: { en: "Customer Success Manager", fr: "Customer Success Manager", de: "Customer Success Manager", es: "Gerente de éxito del cliente" } },
  { cat: "sales", w: 5, t: { en: "Account Manager", fr: "Chargé de clientèle", de: "Kundenbetreuer", es: "Gestor de cuentas" } },
  { cat: "sales", w: 4, t: { en: "Sales Manager", fr: "Directeur commercial", de: "Vertriebsleiter", es: "Director comercial" } },
  { cat: "sales", w: 4, t: { en: "Partnership Manager", fr: "Responsable partenariats", de: "Partnership Manager", es: "Responsable de alianzas" } },
  { cat: "support", w: 8, t: { en: "Customer Support Specialist", fr: "Conseiller clientèle", de: "Kundenservice-Mitarbeiter", es: "Agente de atención al cliente" } },
  { cat: "support", w: 6, t: { en: "Customer Service Representative", fr: "Téléconseiller", de: "Kundenberater", es: "Representante de servicio al cliente" } },
  { cat: "support", w: 5, t: { en: "Technical Support Engineer", fr: "Ingénieur support technique", de: "Technischer Support Ingenieur", es: "Ingeniero de soporte técnico" } },
  { cat: "support", w: 4, t: { en: "Call Center Agent", fr: "Agent de centre d'appels", de: "Callcenter-Agent", es: "Agente de call center" } },
  { cat: "support", w: 4, t: { en: "Customer Support Team Lead", fr: "Responsable support client", de: "Teamleiter Kundenservice", es: "Líder de soporte al cliente" } },
  { cat: "finance", w: 9, t: { en: "Accountant", fr: "Comptable", de: "Buchhalter", es: "Contador" } },
  { cat: "finance", w: 8, t: { en: "Financial Analyst", fr: "Analyste financier", de: "Finanzanalyst", es: "Analista financiero" } },
  { cat: "finance", w: 6, t: { en: "Auditor", fr: "Auditeur", de: "Wirtschaftsprüfer", es: "Auditor" } },
  { cat: "finance", w: 6, t: { en: "Controller", fr: "Contrôleur de gestion", de: "Controller", es: "Controller financiero" } },
  { cat: "finance", w: 5, t: { en: "Investment Analyst", fr: "Analyste d'investissement", de: "Investmentanalyst", es: "Analista de inversiones" } },
  { cat: "finance", w: 5, t: { en: "Tax Specialist", fr: "Spécialiste fiscalité", de: "Steuerspezialist", es: "Especialista en impuestos" } },
  { cat: "finance", w: 4, t: { en: "Risk Analyst", fr: "Analyste risques", de: "Risikoanalyst", es: "Analista de riesgos" } },
  { cat: "finance", w: 4, t: { en: "Finance Manager", fr: "Responsable financier", de: "Finanzmanager", es: "Gerente de finanzas" } },
  { cat: "finance", w: 4, t: { en: "Payroll Specialist", fr: "Gestionnaire de paie", de: "Lohnbuchhalter", es: "Especialista en nóminas" } },
  { cat: "hr", w: 8, t: { en: "HR Manager", fr: "Responsable RH", de: "HR-Manager", es: "Gerente de recursos humanos" } },
  { cat: "hr", w: 8, t: { en: "Recruiter", fr: "Recruteur", de: "Recruiter", es: "Reclutador" } },
  { cat: "hr", w: 6, t: { en: "Talent Acquisition Specialist", fr: "Chargé de recrutement", de: "Talent-Acquisition-Spezialist", es: "Especialista en captación de talento" } },
  { cat: "hr", w: 5, t: { en: "HR Business Partner", fr: "HR Business Partner", de: "HR Business Partner", es: "HR Business Partner" } },
  { cat: "hr", w: 4, t: { en: "Learning and Development Specialist", fr: "Responsable formation", de: "Learning-and-Development-Spezialist", es: "Especialista en formación y desarrollo" } },
  { cat: "hr", w: 4, t: { en: "HR Assistant", fr: "Assistant RH", de: "HR-Assistent", es: "Asistente de recursos humanos" } },
  { cat: "legal", w: 7, t: { en: "Lawyer", fr: "Avocat", de: "Rechtsanwalt", es: "Abogado" } },
  { cat: "legal", w: 7, t: { en: "Legal Counsel", fr: "Juriste d'entreprise", de: "Syndikusanwalt", es: "Asesor jurídico" } },
  { cat: "legal", w: 5, t: { en: "Paralegal", fr: "Assistant juridique", de: "Rechtsanwaltsfachangestellter", es: "Asistente jurídico" } },
  { cat: "legal", w: 5, t: { en: "Contract Manager", fr: "Gestionnaire de contrats", de: "Vertragsmanager", es: "Gestor de contratos" } },
  { cat: "legal", w: 4, t: { en: "Data Protection Officer", fr: "Délégué à la protection des données", de: "Datenschutzbeauftragter", es: "Delegado de protección de datos" } },
  { cat: "ops", w: 8, t: { en: "Operations Manager", fr: "Responsable des opérations", de: "Betriebsleiter", es: "Gerente de operaciones" } },
  { cat: "ops", w: 8, t: { en: "Supply Chain Manager", fr: "Responsable supply chain", de: "Supply-Chain-Manager", es: "Gerente de cadena de suministro" } },
  { cat: "ops", w: 6, t: { en: "Logistics Coordinator", fr: "Coordinateur logistique", de: "Logistikkoordinator", es: "Coordinador de logística" } },
  { cat: "ops", w: 6, t: { en: "Procurement Specialist", fr: "Acheteur", de: "Einkaufsspezialist", es: "Especialista en compras" } },
  { cat: "ops", w: 5, t: { en: "Warehouse Manager", fr: "Responsable d'entrepôt", de: "Lagerleiter", es: "Jefe de almacén" } },
  { cat: "ops", w: 5, t: { en: "Quality Manager", fr: "Responsable qualité", de: "Qualitätsmanager", es: "Gerente de calidad" } },
  { cat: "ops", w: 4, t: { en: "Transport Planner", fr: "Planificateur transport", de: "Transportplaner", es: "Planificador de transporte" } },
  { cat: "engineering", w: 8, t: { en: "Mechanical Engineer", fr: "Ingénieur mécanique", de: "Maschinenbauingenieur", es: "Ingeniero mecánico" } },
  { cat: "engineering", w: 8, t: { en: "Electrical Engineer", fr: "Ingénieur électrique", de: "Elektroingenieur", es: "Ingeniero eléctrico" } },
  { cat: "engineering", w: 7, t: { en: "Civil Engineer", fr: "Ingénieur génie civil", de: "Bauingenieur", es: "Ingeniero civil" } },
  { cat: "engineering", w: 6, t: { en: "Industrial Engineer", fr: "Ingénieur industriel", de: "Wirtschaftsingenieur", es: "Ingeniero industrial" } },
  { cat: "engineering", w: 5, t: { en: "Production Manager", fr: "Responsable de production", de: "Produktionsleiter", es: "Jefe de producción" } },
  { cat: "engineering", w: 5, t: { en: "Maintenance Technician", fr: "Technicien de maintenance", de: "Instandhaltungstechniker", es: "Técnico de mantenimiento" } },
  { cat: "engineering", w: 5, t: { en: "Electronics Engineer", fr: "Ingénieur électronique", de: "Elektronikingenieur", es: "Ingeniero electrónico" } },
  { cat: "engineering", w: 4, t: { en: "Site Manager", fr: "Conducteur de travaux", de: "Bauleiter", es: "Jefe de obra" } },
  { cat: "engineering", w: 4, t: { en: "CAD Designer", fr: "Dessinateur projeteur", de: "CAD-Konstrukteur", es: "Delineante proyectista" } },
  { cat: "energy", w: 6, t: { en: "Renewable Energy Engineer", fr: "Ingénieur énergies renouvelables", de: "Ingenieur für erneuerbare Energien", es: "Ingeniero de energías renovables" } },
  { cat: "energy", w: 6, t: { en: "Environmental Engineer", fr: "Ingénieur environnement", de: "Umweltingenieur", es: "Ingeniero ambiental" } },
  { cat: "energy", w: 5, t: { en: "Sustainability Manager", fr: "Responsable développement durable", de: "Nachhaltigkeitsmanager", es: "Gerente de sostenibilidad" } },
  { cat: "energy", w: 5, t: { en: "HSE Officer", fr: "Responsable QHSE", de: "HSE-Beauftragter", es: "Responsable de seguridad y medio ambiente" } },
  { cat: "energy", w: 4, t: { en: "Energy Analyst", fr: "Analyste énergie", de: "Energieanalyst", es: "Analista de energía" } },
  { cat: "health", w: 8, t: { en: "Nurse", fr: "Infirmier", de: "Krankenpfleger", es: "Enfermero" } },
  { cat: "health", w: 6, t: { en: "Pharmacist", fr: "Pharmacien", de: "Apotheker", es: "Farmacéutico" } },
  { cat: "health", w: 6, t: { en: "Medical Representative", fr: "Délégué médical", de: "Pharmareferent", es: "Visitador médico" } },
  { cat: "health", w: 6, t: { en: "Clinical Research Associate", fr: "Attaché de recherche clinique", de: "Clinical Research Associate", es: "Monitor de investigación clínica" } },
  { cat: "health", w: 5, t: { en: "Laboratory Technician", fr: "Technicien de laboratoire", de: "Labortechniker", es: "Técnico de laboratorio" } },
  { cat: "health", w: 5, t: { en: "Biomedical Engineer", fr: "Ingénieur biomédical", de: "Biomedizintechniker", es: "Ingeniero biomédico" } },
  { cat: "health", w: 5, t: { en: "Bioinformatics Scientist", fr: "Bioinformaticien", de: "Bioinformatiker", es: "Bioinformático" } },
  { cat: "health", w: 4, t: { en: "Healthcare Administrator", fr: "Gestionnaire d'établissement de santé", de: "Krankenhausverwalter", es: "Administrador sanitario" } },
  { cat: "education", w: 7, t: { en: "Teacher", fr: "Enseignant", de: "Lehrer", es: "Profesor" } },
  { cat: "education", w: 6, t: { en: "Trainer", fr: "Formateur", de: "Trainer", es: "Formador" } },
  { cat: "education", w: 5, t: { en: "Instructional Designer", fr: "Ingénieur pédagogique", de: "Instruktionsdesigner", es: "Diseñador instruccional" } },
  { cat: "education", w: 5, t: { en: "Career Coach", fr: "Coach carrière", de: "Karrierecoach", es: "Coach de carrera" } },
  { cat: "education", w: 4, t: { en: "Language Teacher", fr: "Professeur de langues", de: "Sprachlehrer", es: "Profesor de idiomas" } },
  { cat: "education", w: 4, t: { en: "Academic Advisor", fr: "Conseiller pédagogique", de: "Studienberater", es: "Asesor académico" } },
  { cat: "admin", w: 8, t: { en: "Administrative Assistant", fr: "Assistant administratif", de: "Verwaltungsassistent", es: "Asistente administrativo" } },
  { cat: "admin", w: 7, t: { en: "Executive Assistant", fr: "Assistant de direction", de: "Assistent der Geschäftsleitung", es: "Asistente ejecutivo" } },
  { cat: "admin", w: 5, t: { en: "Office Manager", fr: "Office Manager", de: "Büroleiter", es: "Gerente de oficina" } },
  { cat: "admin", w: 5, t: { en: "Data Entry Clerk", fr: "Agent de saisie", de: "Dateneingabe-Sachbearbeiter", es: "Operador de entrada de datos" } },
  { cat: "admin", w: 4, t: { en: "Virtual Assistant", fr: "Assistant virtuel", de: "Virtueller Assistent", es: "Asistente virtual" } },
  { cat: "admin", w: 4, t: { en: "Receptionist", fr: "Réceptionniste", de: "Empfangsmitarbeiter", es: "Recepcionista" } },
  { cat: "consulting", w: 8, t: { en: "Management Consultant", fr: "Consultant en stratégie", de: "Unternehmensberater", es: "Consultor de gestión" } },
  { cat: "consulting", w: 7, t: { en: "IT Consultant", fr: "Consultant informatique", de: "IT-Berater", es: "Consultor informático" } },
  { cat: "consulting", w: 6, t: { en: "Business Consultant", fr: "Consultant métier", de: "Business Consultant", es: "Consultor de negocio" } },
  { cat: "consulting", w: 5, t: { en: "Strategy Analyst", fr: "Analyste stratégie", de: "Strategieanalyst", es: "Analista de estrategia" } },
  { cat: "consulting", w: 5, t: { en: "Digital Transformation Manager", fr: "Responsable transformation digitale", de: "Manager digitale Transformation", es: "Responsable de transformación digital" } },
  { cat: "consulting", w: 4, t: { en: "ERP Consultant", fr: "Consultant ERP", de: "ERP-Berater", es: "Consultor ERP" } },
  { cat: "hospitality", w: 6, t: { en: "Hotel Manager", fr: "Directeur d'hôtel", de: "Hoteldirektor", es: "Director de hotel" } },
  { cat: "hospitality", w: 5, t: { en: "Event Manager", fr: "Responsable événementiel", de: "Eventmanager", es: "Gerente de eventos" } },
  { cat: "hospitality", w: 5, t: { en: "Travel Consultant", fr: "Conseiller voyages", de: "Reiseberater", es: "Asesor de viajes" } },
  { cat: "hospitality", w: 5, t: { en: "Restaurant Manager", fr: "Responsable de restaurant", de: "Restaurantleiter", es: "Gerente de restaurante" } },
  { cat: "hospitality", w: 4, t: { en: "Chef", fr: "Chef de cuisine", de: "Koch", es: "Chef de cocina" } },
  { cat: "hospitality", w: 4, t: { en: "Front Desk Agent", fr: "Agent d'accueil hôtelier", de: "Rezeptionist", es: "Recepcionista de hotel" } },
  { cat: "retail", w: 6, t: { en: "Store Manager", fr: "Responsable de magasin", de: "Filialleiter", es: "Gerente de tienda" } },
  { cat: "retail", w: 6, t: { en: "E-commerce Manager", fr: "Responsable e-commerce", de: "E-Commerce-Manager", es: "Responsable de comercio electrónico" } },
  { cat: "retail", w: 5, t: { en: "Real Estate Agent", fr: "Agent immobilier", de: "Immobilienmakler", es: "Agente inmobiliario" } },
  { cat: "retail", w: 5, t: { en: "Merchandiser", fr: "Marchandiseur", de: "Merchandiser", es: "Merchandiser" } },
  { cat: "retail", w: 4, t: { en: "Property Manager", fr: "Gestionnaire immobilier", de: "Immobilienverwalter", es: "Administrador de propiedades" } },
  { cat: "retail", w: 4, t: { en: "Category Manager", fr: "Chef de catégorie", de: "Category Manager", es: "Gerente de categoría" } },
];

// Pays : réglages envoyés au serveur + langues des annonces. (Reprend les anciens préréglages.)
export const COUNTRIES = [
  { id: "maroc", label: "Maroc", langs: ["fr", "en"], location: "Morocco", countryIndeed: "morocco", jobicyGeo: "" },
  { id: "france", label: "France", langs: ["fr", "en"], location: "France", countryIndeed: "france", jobicyGeo: "france" },
  { id: "usa", label: "États-Unis", langs: ["en"], location: "United States", countryIndeed: "usa", jobicyGeo: "usa" },
  { id: "canada", label: "Canada", langs: ["en", "fr"], location: "Canada", countryIndeed: "canada", jobicyGeo: "canada" },
  { id: "uk", label: "Royaume-Uni", langs: ["en"], location: "United Kingdom", countryIndeed: "uk", jobicyGeo: "uk" },
  { id: "germany", label: "Allemagne", langs: ["de", "en"], location: "Germany", countryIndeed: "germany", jobicyGeo: "germany" },
  { id: "spain", label: "Espagne", langs: ["es", "en"], location: "Spain", countryIndeed: "spain", jobicyGeo: "spain" },
  { id: "portugal", label: "Portugal", langs: ["en"], location: "Portugal", countryIndeed: "portugal", jobicyGeo: "portugal" },
  { id: "netherlands", label: "Pays-Bas", langs: ["en"], location: "Netherlands", countryIndeed: "netherlands", jobicyGeo: "netherlands" },
  { id: "poland", label: "Pologne", langs: ["en"], location: "Poland", countryIndeed: "poland", jobicyGeo: "poland" },
  { id: "india", label: "Inde", langs: ["en"], location: "India", countryIndeed: "india", jobicyGeo: "india" },
  { id: "brazil", label: "Brésil", langs: ["en"], location: "Brazil", countryIndeed: "brazil", jobicyGeo: "brazil" },
  { id: "mexico", label: "Mexique", langs: ["es", "en"], location: "Mexico", countryIndeed: "mexico", jobicyGeo: "mexico" },
  { id: "argentina", label: "Argentine", langs: ["es", "en"], location: "Argentina", countryIndeed: "argentina", jobicyGeo: "argentina" },
  { id: "philippines", label: "Philippines", langs: ["en"], location: "Philippines", countryIndeed: "philippines", jobicyGeo: "" },
  { id: "australia", label: "Australie", langs: ["en"], location: "Australia", countryIndeed: "australia", jobicyGeo: "australia" },
  { id: "singapore", label: "Singapour", langs: ["en"], location: "Singapore", countryIndeed: "singapore", jobicyGeo: "singapore" },
  { id: "afghanistan", label: "Afghanistan", langs: ["en"], location: "Afghanistan", countryIndeed: "", jobicyGeo: "" },
  { id: "albania", label: "Albanie", langs: ["en"], location: "Albania", countryIndeed: "", jobicyGeo: "" },
  { id: "algeria", label: "Algérie", langs: ["fr", "en"], location: "Algeria", countryIndeed: "", jobicyGeo: "" },
  { id: "andorra", label: "Andorre", langs: ["fr", "en"], location: "Andorra", countryIndeed: "", jobicyGeo: "" },
  { id: "angola", label: "Angola", langs: ["en"], location: "Angola", countryIndeed: "", jobicyGeo: "" },
  { id: "armenia", label: "Arménie", langs: ["en"], location: "Armenia", countryIndeed: "", jobicyGeo: "" },
  { id: "austria", label: "Autriche", langs: ["de", "en"], location: "Austria", countryIndeed: "austria", jobicyGeo: "" },
  { id: "azerbaijan", label: "Azerbaïdjan", langs: ["en"], location: "Azerbaijan", countryIndeed: "", jobicyGeo: "" },
  { id: "bahamas", label: "Bahamas", langs: ["en"], location: "Bahamas", countryIndeed: "", jobicyGeo: "" },
  { id: "bahrain", label: "Bahreïn", langs: ["en"], location: "Bahrain", countryIndeed: "bahrain", jobicyGeo: "" },
  { id: "bangladesh", label: "Bangladesh", langs: ["en"], location: "Bangladesh", countryIndeed: "", jobicyGeo: "" },
  { id: "barbados", label: "Barbade", langs: ["en"], location: "Barbados", countryIndeed: "", jobicyGeo: "" },
  { id: "belarus", label: "Biélorussie", langs: ["en"], location: "Belarus", countryIndeed: "", jobicyGeo: "" },
  { id: "belgium", label: "Belgique", langs: ["fr", "en"], location: "Belgium", countryIndeed: "belgium", jobicyGeo: "" },
  { id: "benin", label: "Bénin", langs: ["fr", "en"], location: "Benin", countryIndeed: "", jobicyGeo: "" },
  { id: "bolivia", label: "Bolivie", langs: ["es", "en"], location: "Bolivia", countryIndeed: "", jobicyGeo: "" },
  { id: "bosnia", label: "Bosnie-Herzégovine", langs: ["en"], location: "Bosnia and Herzegovina", countryIndeed: "", jobicyGeo: "" },
  { id: "botswana", label: "Botswana", langs: ["en"], location: "Botswana", countryIndeed: "", jobicyGeo: "" },
  { id: "brunei", label: "Brunei", langs: ["en"], location: "Brunei", countryIndeed: "", jobicyGeo: "" },
  { id: "bulgaria", label: "Bulgarie", langs: ["en"], location: "Bulgaria", countryIndeed: "", jobicyGeo: "" },
  { id: "burkina", label: "Burkina Faso", langs: ["fr", "en"], location: "Burkina Faso", countryIndeed: "", jobicyGeo: "" },
  { id: "burundi", label: "Burundi", langs: ["fr", "en"], location: "Burundi", countryIndeed: "", jobicyGeo: "" },
  { id: "cambodia", label: "Cambodge", langs: ["en"], location: "Cambodia", countryIndeed: "", jobicyGeo: "" },
  { id: "cameroon", label: "Cameroun", langs: ["fr", "en"], location: "Cameroon", countryIndeed: "", jobicyGeo: "" },
  { id: "capeverde", label: "Cap-Vert", langs: ["en"], location: "Cape Verde", countryIndeed: "", jobicyGeo: "" },
  { id: "chad", label: "Tchad", langs: ["fr", "en"], location: "Chad", countryIndeed: "", jobicyGeo: "" },
  { id: "chile", label: "Chili", langs: ["es", "en"], location: "Chile", countryIndeed: "chile", jobicyGeo: "" },
  { id: "china", label: "Chine", langs: ["en"], location: "China", countryIndeed: "china", jobicyGeo: "" },
  { id: "colombia", label: "Colombie", langs: ["es", "en"], location: "Colombia", countryIndeed: "colombia", jobicyGeo: "" },
  { id: "congo", label: "Congo", langs: ["fr", "en"], location: "Congo", countryIndeed: "", jobicyGeo: "" },
  { id: "drc", label: "RD Congo", langs: ["fr", "en"], location: "Democratic Republic of the Congo", countryIndeed: "", jobicyGeo: "" },
  { id: "costarica", label: "Costa Rica", langs: ["es", "en"], location: "Costa Rica", countryIndeed: "costa rica", jobicyGeo: "" },
  { id: "croatia", label: "Croatie", langs: ["en"], location: "Croatia", countryIndeed: "", jobicyGeo: "" },
  { id: "cuba", label: "Cuba", langs: ["es", "en"], location: "Cuba", countryIndeed: "", jobicyGeo: "" },
  { id: "cyprus", label: "Chypre", langs: ["en"], location: "Cyprus", countryIndeed: "", jobicyGeo: "" },
  { id: "czech", label: "République tchèque", langs: ["en"], location: "Czech Republic", countryIndeed: "czech republic", jobicyGeo: "" },
  { id: "denmark", label: "Danemark", langs: ["en"], location: "Denmark", countryIndeed: "denmark", jobicyGeo: "" },
  { id: "djibouti", label: "Djibouti", langs: ["fr", "en"], location: "Djibouti", countryIndeed: "", jobicyGeo: "" },
  { id: "dominican", label: "République dominicaine", langs: ["es", "en"], location: "Dominican Republic", countryIndeed: "", jobicyGeo: "" },
  { id: "ecuador", label: "Équateur", langs: ["es", "en"], location: "Ecuador", countryIndeed: "ecuador", jobicyGeo: "" },
  { id: "egypt", label: "Égypte", langs: ["en"], location: "Egypt", countryIndeed: "egypt", jobicyGeo: "" },
  { id: "elsalvador", label: "Salvador", langs: ["es", "en"], location: "El Salvador", countryIndeed: "", jobicyGeo: "" },
  { id: "estonia", label: "Estonie", langs: ["en"], location: "Estonia", countryIndeed: "", jobicyGeo: "" },
  { id: "ethiopia", label: "Éthiopie", langs: ["en"], location: "Ethiopia", countryIndeed: "", jobicyGeo: "" },
  { id: "fiji", label: "Fidji", langs: ["en"], location: "Fiji", countryIndeed: "", jobicyGeo: "" },
  { id: "finland", label: "Finlande", langs: ["en"], location: "Finland", countryIndeed: "finland", jobicyGeo: "" },
  { id: "gabon", label: "Gabon", langs: ["fr", "en"], location: "Gabon", countryIndeed: "", jobicyGeo: "" },
  { id: "gambia", label: "Gambie", langs: ["en"], location: "Gambia", countryIndeed: "", jobicyGeo: "" },
  { id: "georgia", label: "Géorgie", langs: ["en"], location: "Georgia", countryIndeed: "", jobicyGeo: "" },
  { id: "ghana", label: "Ghana", langs: ["en"], location: "Ghana", countryIndeed: "", jobicyGeo: "" },
  { id: "greece", label: "Grèce", langs: ["en"], location: "Greece", countryIndeed: "greece", jobicyGeo: "" },
  { id: "guatemala", label: "Guatemala", langs: ["es", "en"], location: "Guatemala", countryIndeed: "", jobicyGeo: "" },
  { id: "guinea", label: "Guinée", langs: ["fr", "en"], location: "Guinea", countryIndeed: "", jobicyGeo: "" },
  { id: "haiti", label: "Haïti", langs: ["fr", "en"], location: "Haiti", countryIndeed: "", jobicyGeo: "" },
  { id: "honduras", label: "Honduras", langs: ["es", "en"], location: "Honduras", countryIndeed: "", jobicyGeo: "" },
  { id: "hongkong", label: "Hong Kong", langs: ["en"], location: "Hong Kong", countryIndeed: "hong kong", jobicyGeo: "" },
  { id: "hungary", label: "Hongrie", langs: ["en"], location: "Hungary", countryIndeed: "hungary", jobicyGeo: "" },
  { id: "iceland", label: "Islande", langs: ["en"], location: "Iceland", countryIndeed: "", jobicyGeo: "" },
  { id: "indonesia", label: "Indonésie", langs: ["en"], location: "Indonesia", countryIndeed: "indonesia", jobicyGeo: "" },
  { id: "iraq", label: "Irak", langs: ["en"], location: "Iraq", countryIndeed: "", jobicyGeo: "" },
  { id: "ireland", label: "Irlande", langs: ["en"], location: "Ireland", countryIndeed: "ireland", jobicyGeo: "" },
  { id: "israel", label: "Israël", langs: ["en"], location: "Israel", countryIndeed: "israel", jobicyGeo: "" },
  { id: "italy", label: "Italie", langs: ["en"], location: "Italy", countryIndeed: "italy", jobicyGeo: "" },
  { id: "ivorycoast", label: "Côte d'Ivoire", langs: ["fr", "en"], location: "Ivory Coast", countryIndeed: "", jobicyGeo: "" },
  { id: "jamaica", label: "Jamaïque", langs: ["en"], location: "Jamaica", countryIndeed: "", jobicyGeo: "" },
  { id: "japan", label: "Japon", langs: ["en"], location: "Japan", countryIndeed: "japan", jobicyGeo: "" },
  { id: "jordan", label: "Jordanie", langs: ["en"], location: "Jordan", countryIndeed: "", jobicyGeo: "" },
  { id: "kazakhstan", label: "Kazakhstan", langs: ["en"], location: "Kazakhstan", countryIndeed: "", jobicyGeo: "" },
  { id: "kenya", label: "Kenya", langs: ["en"], location: "Kenya", countryIndeed: "", jobicyGeo: "" },
  { id: "kuwait", label: "Koweït", langs: ["en"], location: "Kuwait", countryIndeed: "kuwait", jobicyGeo: "" },
  { id: "kyrgyzstan", label: "Kirghizistan", langs: ["en"], location: "Kyrgyzstan", countryIndeed: "", jobicyGeo: "" },
  { id: "laos", label: "Laos", langs: ["en"], location: "Laos", countryIndeed: "", jobicyGeo: "" },
  { id: "latvia", label: "Lettonie", langs: ["en"], location: "Latvia", countryIndeed: "", jobicyGeo: "" },
  { id: "lebanon", label: "Liban", langs: ["fr", "en"], location: "Lebanon", countryIndeed: "", jobicyGeo: "" },
  { id: "libya", label: "Libye", langs: ["en"], location: "Libya", countryIndeed: "", jobicyGeo: "" },
  { id: "lithuania", label: "Lituanie", langs: ["en"], location: "Lithuania", countryIndeed: "", jobicyGeo: "" },
  { id: "luxembourg", label: "Luxembourg", langs: ["fr", "en"], location: "Luxembourg", countryIndeed: "luxembourg", jobicyGeo: "" },
  { id: "madagascar", label: "Madagascar", langs: ["fr", "en"], location: "Madagascar", countryIndeed: "", jobicyGeo: "" },
  { id: "malawi", label: "Malawi", langs: ["en"], location: "Malawi", countryIndeed: "", jobicyGeo: "" },
  { id: "malaysia", label: "Malaisie", langs: ["en"], location: "Malaysia", countryIndeed: "malaysia", jobicyGeo: "" },
  { id: "mali", label: "Mali", langs: ["fr", "en"], location: "Mali", countryIndeed: "", jobicyGeo: "" },
  { id: "malta", label: "Malte", langs: ["en"], location: "Malta", countryIndeed: "", jobicyGeo: "" },
  { id: "mauritania", label: "Mauritanie", langs: ["fr", "en"], location: "Mauritania", countryIndeed: "", jobicyGeo: "" },
  { id: "mauritius", label: "Maurice", langs: ["fr", "en"], location: "Mauritius", countryIndeed: "", jobicyGeo: "" },
  { id: "moldova", label: "Moldavie", langs: ["en"], location: "Moldova", countryIndeed: "", jobicyGeo: "" },
  { id: "monaco", label: "Monaco", langs: ["fr", "en"], location: "Monaco", countryIndeed: "", jobicyGeo: "" },
  { id: "mongolia", label: "Mongolie", langs: ["en"], location: "Mongolia", countryIndeed: "", jobicyGeo: "" },
  { id: "montenegro", label: "Monténégro", langs: ["en"], location: "Montenegro", countryIndeed: "", jobicyGeo: "" },
  { id: "mozambique", label: "Mozambique", langs: ["en"], location: "Mozambique", countryIndeed: "", jobicyGeo: "" },
  { id: "myanmar", label: "Myanmar", langs: ["en"], location: "Myanmar", countryIndeed: "", jobicyGeo: "" },
  { id: "namibia", label: "Namibie", langs: ["en"], location: "Namibia", countryIndeed: "", jobicyGeo: "" },
  { id: "nepal", label: "Népal", langs: ["en"], location: "Nepal", countryIndeed: "", jobicyGeo: "" },
  { id: "newzealand", label: "Nouvelle-Zélande", langs: ["en"], location: "New Zealand", countryIndeed: "new zealand", jobicyGeo: "" },
  { id: "nicaragua", label: "Nicaragua", langs: ["es", "en"], location: "Nicaragua", countryIndeed: "", jobicyGeo: "" },
  { id: "niger", label: "Niger", langs: ["fr", "en"], location: "Niger", countryIndeed: "", jobicyGeo: "" },
  { id: "nigeria", label: "Nigeria", langs: ["en"], location: "Nigeria", countryIndeed: "nigeria", jobicyGeo: "" },
  { id: "northmacedonia", label: "Macédoine du Nord", langs: ["en"], location: "North Macedonia", countryIndeed: "", jobicyGeo: "" },
  { id: "norway", label: "Norvège", langs: ["en"], location: "Norway", countryIndeed: "norway", jobicyGeo: "" },
  { id: "oman", label: "Oman", langs: ["en"], location: "Oman", countryIndeed: "oman", jobicyGeo: "" },
  { id: "pakistan", label: "Pakistan", langs: ["en"], location: "Pakistan", countryIndeed: "pakistan", jobicyGeo: "" },
  { id: "palestine", label: "Palestine", langs: ["en"], location: "Palestine", countryIndeed: "", jobicyGeo: "" },
  { id: "panama", label: "Panama", langs: ["es", "en"], location: "Panama", countryIndeed: "panama", jobicyGeo: "" },
  { id: "paraguay", label: "Paraguay", langs: ["es", "en"], location: "Paraguay", countryIndeed: "", jobicyGeo: "" },
  { id: "peru", label: "Pérou", langs: ["es", "en"], location: "Peru", countryIndeed: "peru", jobicyGeo: "" },
  { id: "qatar", label: "Qatar", langs: ["en"], location: "Qatar", countryIndeed: "qatar", jobicyGeo: "" },
  { id: "romania", label: "Roumanie", langs: ["en"], location: "Romania", countryIndeed: "romania", jobicyGeo: "" },
  { id: "russia", label: "Russie", langs: ["en"], location: "Russia", countryIndeed: "", jobicyGeo: "" },
  { id: "rwanda", label: "Rwanda", langs: ["fr", "en"], location: "Rwanda", countryIndeed: "", jobicyGeo: "" },
  { id: "saudi", label: "Arabie saoudite", langs: ["en"], location: "Saudi Arabia", countryIndeed: "saudi arabia", jobicyGeo: "" },
  { id: "senegal", label: "Sénégal", langs: ["fr", "en"], location: "Senegal", countryIndeed: "", jobicyGeo: "" },
  { id: "serbia", label: "Serbie", langs: ["en"], location: "Serbia", countryIndeed: "", jobicyGeo: "" },
  { id: "seychelles", label: "Seychelles", langs: ["en"], location: "Seychelles", countryIndeed: "", jobicyGeo: "" },
  { id: "slovakia", label: "Slovaquie", langs: ["en"], location: "Slovakia", countryIndeed: "", jobicyGeo: "" },
  { id: "slovenia", label: "Slovénie", langs: ["en"], location: "Slovenia", countryIndeed: "", jobicyGeo: "" },
  { id: "somalia", label: "Somalie", langs: ["en"], location: "Somalia", countryIndeed: "", jobicyGeo: "" },
  { id: "southafrica", label: "Afrique du Sud", langs: ["en"], location: "South Africa", countryIndeed: "south africa", jobicyGeo: "" },
  { id: "southkorea", label: "Corée du Sud", langs: ["en"], location: "South Korea", countryIndeed: "south korea", jobicyGeo: "" },
  { id: "srilanka", label: "Sri Lanka", langs: ["en"], location: "Sri Lanka", countryIndeed: "", jobicyGeo: "" },
  { id: "sudan", label: "Soudan", langs: ["en"], location: "Sudan", countryIndeed: "", jobicyGeo: "" },
  { id: "sweden", label: "Suède", langs: ["en"], location: "Sweden", countryIndeed: "sweden", jobicyGeo: "" },
  { id: "switzerland", label: "Suisse", langs: ["fr", "de", "en"], location: "Switzerland", countryIndeed: "switzerland", jobicyGeo: "" },
  { id: "syria", label: "Syrie", langs: ["en"], location: "Syria", countryIndeed: "", jobicyGeo: "" },
  { id: "taiwan", label: "Taïwan", langs: ["en"], location: "Taiwan", countryIndeed: "taiwan", jobicyGeo: "" },
  { id: "tanzania", label: "Tanzanie", langs: ["en"], location: "Tanzania", countryIndeed: "", jobicyGeo: "" },
  { id: "thailand", label: "Thaïlande", langs: ["en"], location: "Thailand", countryIndeed: "thailand", jobicyGeo: "" },
  { id: "togo", label: "Togo", langs: ["fr", "en"], location: "Togo", countryIndeed: "", jobicyGeo: "" },
  { id: "trinidad", label: "Trinité-et-Tobago", langs: ["en"], location: "Trinidad and Tobago", countryIndeed: "", jobicyGeo: "" },
  { id: "tunisia", label: "Tunisie", langs: ["fr", "en"], location: "Tunisia", countryIndeed: "", jobicyGeo: "" },
  { id: "turkey", label: "Turquie", langs: ["en"], location: "Turkey", countryIndeed: "turkey", jobicyGeo: "" },
  { id: "uganda", label: "Ouganda", langs: ["en"], location: "Uganda", countryIndeed: "", jobicyGeo: "" },
  { id: "ukraine", label: "Ukraine", langs: ["en"], location: "Ukraine", countryIndeed: "ukraine", jobicyGeo: "" },
  { id: "uae", label: "Émirats arabes unis", langs: ["en"], location: "United Arab Emirates", countryIndeed: "united arab emirates", jobicyGeo: "" },
  { id: "uruguay", label: "Uruguay", langs: ["es", "en"], location: "Uruguay", countryIndeed: "uruguay", jobicyGeo: "" },
  { id: "uzbekistan", label: "Ouzbékistan", langs: ["en"], location: "Uzbekistan", countryIndeed: "", jobicyGeo: "" },
  { id: "venezuela", label: "Venezuela", langs: ["es", "en"], location: "Venezuela", countryIndeed: "venezuela", jobicyGeo: "" },
  { id: "vietnam", label: "Vietnam", langs: ["en"], location: "Vietnam", countryIndeed: "vietnam", jobicyGeo: "" },
  { id: "yemen", label: "Yémen", langs: ["en"], location: "Yemen", countryIndeed: "", jobicyGeo: "" },
  { id: "zambia", label: "Zambie", langs: ["en"], location: "Zambia", countryIndeed: "", jobicyGeo: "" },
  { id: "zimbabwe", label: "Zimbabwe", langs: ["en"], location: "Zimbabwe", countryIndeed: "", jobicyGeo: "" },
  { id: "bhutan", label: "Bhoutan", langs: ["en"], location: "Bhutan", countryIndeed: "", jobicyGeo: "" },
  { id: "belize", label: "Belize", langs: ["en"], location: "Belize", countryIndeed: "", jobicyGeo: "" },
  { id: "centralafrica", label: "République centrafricaine", langs: ["fr", "en"], location: "Central African Republic", countryIndeed: "", jobicyGeo: "" },
  { id: "comoros", label: "Comores", langs: ["fr", "en"], location: "Comoros", countryIndeed: "", jobicyGeo: "" },
  { id: "equatorialguinea", label: "Guinée équatoriale", langs: ["es", "fr", "en"], location: "Equatorial Guinea", countryIndeed: "", jobicyGeo: "" },
  { id: "eritrea", label: "Érythrée", langs: ["en"], location: "Eritrea", countryIndeed: "", jobicyGeo: "" },
  { id: "eswatini", label: "Eswatini", langs: ["en"], location: "Eswatini", countryIndeed: "", jobicyGeo: "" },
  { id: "guineabissau", label: "Guinée-Bissau", langs: ["en"], location: "Guinea-Bissau", countryIndeed: "", jobicyGeo: "" },
  { id: "guyana", label: "Guyana", langs: ["en"], location: "Guyana", countryIndeed: "", jobicyGeo: "" },
  { id: "iran", label: "Iran", langs: ["en"], location: "Iran", countryIndeed: "", jobicyGeo: "" },
  { id: "kosovo", label: "Kosovo", langs: ["en"], location: "Kosovo", countryIndeed: "", jobicyGeo: "" },
  { id: "lesotho", label: "Lesotho", langs: ["en"], location: "Lesotho", countryIndeed: "", jobicyGeo: "" },
  { id: "liberia", label: "Liberia", langs: ["en"], location: "Liberia", countryIndeed: "", jobicyGeo: "" },
  { id: "liechtenstein", label: "Liechtenstein", langs: ["de", "en"], location: "Liechtenstein", countryIndeed: "", jobicyGeo: "" },
  { id: "maldives", label: "Maldives", langs: ["en"], location: "Maldives", countryIndeed: "", jobicyGeo: "" },
  { id: "northkorea", label: "Corée du Nord", langs: ["en"], location: "North Korea", countryIndeed: "", jobicyGeo: "" },
  { id: "png", label: "Papouasie-Nouvelle-Guinée", langs: ["en"], location: "Papua New Guinea", countryIndeed: "", jobicyGeo: "" },
  { id: "sanmarino", label: "Saint-Marin", langs: ["en"], location: "San Marino", countryIndeed: "", jobicyGeo: "" },
  { id: "saotome", label: "Sao Tomé-et-Principe", langs: ["en"], location: "Sao Tome and Principe", countryIndeed: "", jobicyGeo: "" },
  { id: "sierraleone", label: "Sierra Leone", langs: ["en"], location: "Sierra Leone", countryIndeed: "", jobicyGeo: "" },
  { id: "southsudan", label: "Soudan du Sud", langs: ["en"], location: "South Sudan", countryIndeed: "", jobicyGeo: "" },
  { id: "suriname", label: "Suriname", langs: ["en"], location: "Suriname", countryIndeed: "", jobicyGeo: "" },
  { id: "tajikistan", label: "Tadjikistan", langs: ["en"], location: "Tajikistan", countryIndeed: "", jobicyGeo: "" },
  { id: "timorleste", label: "Timor oriental", langs: ["en"], location: "Timor-Leste", countryIndeed: "", jobicyGeo: "" },
  { id: "turkmenistan", label: "Turkménistan", langs: ["en"], location: "Turkmenistan", countryIndeed: "", jobicyGeo: "" },
  { id: "vatican", label: "Vatican", langs: ["en"], location: "Vatican City", countryIndeed: "", jobicyGeo: "" },
  { id: "worldwide", label: "Partout (remote)", langs: ["en"], location: "", countryIndeed: "", jobicyGeo: "" },
];

// Calcule l'état dérivé de l'assistant : suggestions classées par famille, titres choisis.
export function wizCalc(w) {
  const co = COUNTRIES.find((c) => c.id === w.country) || null;
  if (!co) return { all: [], fams: [], picked: w.picked, co: null, langs: [] };
  const langs = [...co.langs, ...w.extra.filter((l) => !co.langs.includes(l))];
  const seen = new Set();
  const all = [];
  const fams = CATS.map((c) => {
    const titles = [];
    ROLES.filter((r) => r.cat === c.id).sort((a, b) => b.w - a.w).forEach((r) => {
      langs.forEach((l) => {
        const t = r.t[l];
        if (t && !seen.has(t)) { seen.add(t); const o = { t, l }; titles.push(o); all.push(o); }
      });
    });
    return { ...c, titles };
  });
  return { all, fams, picked: w.picked, co, langs };
}
export function defaultTitles(w, fams) {
  const out = [];
  w.cats.forEach((cid) => (fams.find((f) => f.id === cid)?.titles.slice(0, 6) || []).forEach((x) => out.push(x.t)));
  return [...out, ...w.custom];
}

// --- Noms simples pour les sources (aucun terme technique à l'écran) -------------------
const GROUPS = {
  big: "LinkedIn, Indeed et autres grands sites",
  remote: "Sites d’emploi à distance",
  ats: "Pages carrières d’entreprises",
  archive: "Grande archive d’offres",
};
export function siteGroup(id = "", label = "") {
  const k = String(id).toLowerCase(), l = String(label).toLowerCase();
  if (/^jobspy/.test(k) || /jobspy/.test(l)) return { key: "big", name: GROUPS.big };
  if (["remoteok", "remotive", "wwr", "himalayas", "jobicy", "jobicy_country"].includes(k)) return { key: "remote", name: GROUPS.remote };
  if (k === "ats" || /\bats\b|greenhouse|lever|ashby/.test(l)) return { key: "ats", name: GROUPS.ats };
  if (/^hf/.test(k) || /hugging|dataset|jeu de donn/.test(l)) return { key: "archive", name: GROUPS.archive };
  return { key: k || l, name: label || id };
}
/** Nom d'un site tel que stocké sur une offre (LinkedIn, RemoteOK… restent, les noms techniques deviennent clairs). */
export function jobSite(name = "") {
  const l = String(name).toLowerCase();
  if (/hugging|dataset|^hf/.test(l)) return "Archive d’offres";
  if (/^ats|greenhouse|lever|ashby|workable|smartrecruiters/.test(l)) return "Page carrières d’entreprise";
  if (/jobspy/.test(l)) return "Grand site d’emploi";
  return name;
}
export const fmtDur = (s) => { s = Math.round(s || 0); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`; };

// --- Pays : comparaison tolérante (« Maroc », « Morocco », « maroc ») et vue « Local » ----------
const fold = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
export function countryKey(name) {
  const k = fold(name);
  if (!k) return "";
  const c = COUNTRIES.find((x) => fold(x.label) === k || fold(x.location) === k || x.id === k);
  return c ? c.id : k;
}
export const isLocal = (j, home) => !!home && countryKey(j.country) === countryKey(home);
export const PERIODS = [[0, "Toutes les dates"], [1, "Dernières 24 heures"], [3, "3 derniers jours"], [7, "Dernière semaine (7 jours)"], [14, "2 dernières semaines"], [30, "Dernier mois"], [60, "2 derniers mois"]];