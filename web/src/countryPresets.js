// Mode "Recherche par pays" : on choisit un pays d'abord, l'app propose
// ensuite une liste de postes IA/ML pertinents à cocher, puis la recherche
// se lance avec CES postes comme mots-clés.
//
// RÈGLE (demande explicite de l'utilisateur, confirmée via question de
// clarification -> réponse "Oui, les deux combinés") : choisir un pays ne
// doit jamais REMPLACER le remote par du sur-site. Les résultats doivent
// montrer le remote ET les offres ciblées sur ce pays, ENSEMBLE, dans la
// même liste. Chaque champ ci-dessous (location/jobicyGeo/countryIndeed)
// n'est donc PAS envoyé à la place des sources remote existantes, mais en
// PLUS -> voir search_engine.py::_make_sources(), qui ajoute des sources
// "jobspy_country"/"jobicy_country" en complément de "jobspy"/"jobicy"
// (qui restent toujours remote).
//
// - location       : lieu envoyé à JobSpy (sert surtout pour LinkedIn/
//                     ZipRecruiter — texte libre, nom de pays usuel).
// - countryIndeed  : nom de pays EXACT attendu par JobSpy pour Indeed et
//                     Glassdoor (liste fermée différente de `location` —
//                     voir jobspy_source.fetch_jobspy / README officiel
//                     JobSpy). Sans lui, Indeed/Glassdoor ignorent le pays.
// - jobicyGeo      : slug de la taxonomie Jobicy (confirmé via l'API live
//                     /api/v2/remote-jobs?get=locations) ; `null` quand ce
//                     pays n'existe pas dans cette taxonomie (ex. Morocco,
//                     India) -> dans ce cas on n'ajoute pas "jobicy_country"
//                     pour ce pays (voir _make_sources, qui vérifie
//                     jobicy_geo avant d'ajouter cette source), seul
//                     "jobspy_country" tourne en plus du remote.
export const COUNTRY_PRESETS = [
  { id: "usa", label: "USA", location: "United States", countryIndeed: "USA", jobicyGeo: "usa" },
  { id: "canada", label: "Canada", location: "Canada", countryIndeed: "Canada", jobicyGeo: null },
  { id: "uk", label: "UK", location: "United Kingdom", countryIndeed: "UK", jobicyGeo: "uk" },
  { id: "germany", label: "Germany", location: "Germany", countryIndeed: "Germany", jobicyGeo: "germany" },
  { id: "france", label: "France", location: "France", countryIndeed: "France", jobicyGeo: "france" },
  { id: "spain", label: "Spain", location: "Spain", countryIndeed: "Spain", jobicyGeo: "spain" },
  { id: "portugal", label: "Portugal", location: "Portugal", countryIndeed: "Portugal", jobicyGeo: "portugal" },
  { id: "netherlands", label: "Netherlands", location: "Netherlands", countryIndeed: "Netherlands", jobicyGeo: "netherlands" },
  { id: "poland", label: "Poland", location: "Poland", countryIndeed: "Poland", jobicyGeo: "poland" },
  { id: "india", label: "India", location: "India", countryIndeed: "India", jobicyGeo: null },
  { id: "morocco", label: "Morocco", location: "Morocco", countryIndeed: "Morocco", jobicyGeo: null },
  { id: "brazil", label: "Brazil", location: "Brazil", countryIndeed: "Brazil", jobicyGeo: "brazil" },
  { id: "mexico", label: "Mexico", location: "Mexico", countryIndeed: "Mexico", jobicyGeo: "mexico" },
  { id: "argentina", label: "Argentina", location: "Argentina", countryIndeed: "Argentina", jobicyGeo: "argentina" },
  { id: "philippines", label: "Philippines", location: "Philippines", countryIndeed: "Philippines", jobicyGeo: "philippines" },
  { id: "australia", label: "Australia", location: "Australia", countryIndeed: "Australia", jobicyGeo: "australia" },
  { id: "singapore", label: "Singapore", location: "Singapore", countryIndeed: "Singapore", jobicyGeo: "singapore" },
  { id: "worldwide", label: "Worldwide / Anywhere", location: null, countryIndeed: null, jobicyGeo: null },
];

// Postes suggérés par pays : le même socle IA/ML partout (ce sont les postes
// que ce projet cible, voir config.CANDIDATE_PROFILE), avec un poids légèrement
// différent selon ce qui se recrute le plus dans ce marché d'après le marché
// observé via ce même outil (jobFamily.js) — reste une suggestion de DÉPART,
// pas une vérité absolue : l'utilisateur décoche/ajoute ce qu'il veut avant
// de lancer la recherche.
const CORE_TITLES = [
  "AI Engineer",
  "Machine Learning Engineer",
  "ML Engineer",
  "Data Scientist",
  "MLOps Engineer",
  "LLM Engineer",
  "NLP Engineer",
  "Computer Vision Engineer",
  "Data Engineer",
  "AI Research Scientist",
  "Applied AI Engineer",
];

// Marchés avec un vocabulaire ou une priorité légèrement différente -> liste
// réordonnée/étendue plutôt qu'une liste figée différente ; garde les mêmes
// intitulés que CORE_TITLES pour rester cohérent avec FAMILY_RULES
// (jobFamily.js) et avec les filtres déjà utilisés ailleurs dans l'app.
const COUNTRY_OVERRIDES = {
  usa: ["AI Engineer", "Machine Learning Engineer", "Data Scientist", "LLM Engineer", "MLOps Engineer", "AI Research Scientist", "Computer Vision Engineer", "NLP Engineer", "Data Engineer", "Applied AI Engineer"],
  india: ["Machine Learning Engineer", "Data Scientist", "AI Engineer", "Data Engineer", "NLP Engineer", "Computer Vision Engineer", "MLOps Engineer"],
  germany: ["Machine Learning Engineer", "Data Engineer", "Data Scientist", "AI Engineer", "MLOps Engineer", "Computer Vision Engineer"],
  worldwide: CORE_TITLES,
};

// --- Groupes de postes affichés dans le sélecteur ---------------------------
// Chaque poste coché est cherché séparément sur chaque site (voir
// config.JOBSPY_COUNTRY_MAX_TERMS). Les marchés locaux (Maroc...) recrutent
// surtout en "développeur / systèmes" et en français : on propose donc ces
// intitulés EN PLUS du socle IA/Data, décochés par défaut sauf quelques-uns.
const DEV_EN = ["Software Engineer", "Full Stack Developer", "Backend Developer", "Frontend Developer", "Python Developer", "Java Developer", ".NET Developer", "Mobile Developer"];
const SYS_EN = ["DevOps Engineer", "Cloud Engineer", "Systems Administrator", "Network Engineer", "Cybersecurity Engineer", "IT Support Engineer", "Data Analyst", "Business Intelligence Developer"];
const FR_TITLES = [
  "Ingénieur IA", "Ingénieur Machine Learning", "Ingénieur Data", "Data Scientist",
  "Développeur", "Développeur Full Stack", "Développeur Python", "Développeur Java",
  "Ingénieur Logiciel", "Administrateur Système", "Ingénieur Systèmes et Réseaux",
  "Ingénieur DevOps", "Ingénieur Cloud", "Analyste de données", "Ingénieur Cybersécurité",
  "Chef de projet informatique",
];

// Pays où l'on propose aussi des intitulés en français.
const FRENCH_MARKETS = new Set(["morocco", "france"]);

// Postes pré-cochés (le reste est proposé, décoché).
const PRESELECTED_EXTRA = {
  morocco: [
    "AI Engineer", "Data Scientist", "Data Engineer", "Software Engineer", "Full Stack Developer",
    "DevOps Engineer", "Systems Administrator",
    "Ingénieur IA", "Développeur", "Ingénieur Data", "Administrateur Système",
  ],
  france: ["Ingénieur IA", "Ingénieur Data", "Développeur"],
};

export function titleGroupsFor(countryId) {
  const ai = COUNTRY_OVERRIDES[countryId] || CORE_TITLES;
  const groups = [
    { label: "IA / Data", titles: ai },
    { label: "Développement (EN)", titles: DEV_EN },
    { label: "Systèmes / Cloud / Sécurité (EN)", titles: SYS_EN },
  ];
  if (FRENCH_MARKETS.has(countryId)) {
    groups.push({ label: "Intitulés en français", titles: FR_TITLES });
  }
  return groups;
}

// Postes pré-cochés quand on choisit un pays.
export function suggestedTitlesFor(countryId) {
  if (PRESELECTED_EXTRA[countryId] && countryId === "morocco") {
    return PRESELECTED_EXTRA.morocco;
  }
  const ai = COUNTRY_OVERRIDES[countryId] || CORE_TITLES;
  return [...ai, ...(PRESELECTED_EXTRA[countryId] || [])];
}