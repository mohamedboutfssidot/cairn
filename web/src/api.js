// Appels au serveur local (server.py) : rien ne sort de ta machine.
export const BASE_URL = "http://localhost:5000";

async function call(path, { method = "GET", body, query } = {}) {
  let url = BASE_URL + path;
  if (query) {
    const p = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== "" && v != null && v !== false) p.set(k, v === true ? "1" : v);
    });
    const s = p.toString();
    if (s) url += "?" + s;
  }
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Erreur serveur (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// --- Offres -----------------------------------------------------------------
export const fetchJobs = (query = {}) => call("/api/jobs", { query: { sort: "score_desc", limit: 5000, ...query } });
export const fetchJob = (url) => call("/api/job", { query: { url } });
export const fetchSources = () => call("/api/sources");
export const fetchAvailableSources = () => call("/api/sources/available");
export const fetchFilters = () => call("/api/filters");
export const fetchMeta = () => call("/api/meta");
export const fetchDashboard = () => call("/api/dashboard");
export const clearStore = () => call("/api/store", { method: "DELETE" });

// --- Recherche (flux SSE) -----------------------------------------------------
export const startSearch = (p = {}) =>
  call("/api/search/start", {
    method: "POST",
    body: {
      keywords: p.keywords || null, sites: p.sites || null, source_ids: p.sourceIds || null,
      location: p.location || null, jobicy_geo: p.jobicyGeo || null, country_indeed: p.countryIndeed || null,
      mode: p.mode || null, clean: p.clean || undefined,
    },
  });

export function streamSearch(onEvent, onClose) {
  const es = new EventSource(`${BASE_URL}/api/search/stream`);
  es.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)); } catch { /* ligne malformée ignorée */ }
  };
  es.addEventListener("close", () => { es.close(); onClose?.(); });
  es.onerror = () => { es.close(); onClose?.(); };
  return () => es.close();
}

// --- Recherches enregistrées et actualisation ----------------------------------
export const fetchSearches = () => call("/api/searches");
export const saveSearch = (params, label) => call("/api/searches", { method: "POST", body: { params, label } });
export const deleteSearch = (id) => call(`/api/searches/${encodeURIComponent(id)}`, { method: "DELETE" });
// Progression de la recherche en cours : sources, offres trouvées, tick.
export const fetchProgress = () => call("/api/progress");
export const fetchRefresh = () => call("/api/refresh");
// mode : "fast" (API + ATS + Jobicy), "deep" (JobSpy + datasets HF), ou absent = tout
export const startRefresh = (ids, mode) => call("/api/refresh", { method: "POST", body: { ...(ids ? { ids } : {}), ...(mode ? { mode } : {}) } });

// --- Suivi ---------------------------------------------------------------------
export const fetchTracking = () => call("/api/tracking");
export const putTracking = (body) => call("/api/tracking", { method: "PUT", body });
export const deleteTracking = (url) => call("/api/tracking", { method: "DELETE", query: { url } });
export const hideJob = (url, company, scope = "job") => call("/api/hidden", { method: "POST", body: { url, company, scope } });
export const unhide = ({ url, company }) => call("/api/hidden", { method: "DELETE", query: url ? { url } : { company } });

// --- Profil de recherche, fiche candidat, assistant ----------------------------
export const fetchProfile = () => call("/api/profile");
export const saveProfile = (p) => call("/api/profile", { method: "PUT", body: p });
export const fetchCandidate = () => call("/api/candidate");
export const saveCandidate = (c) => call("/api/candidate", { method: "PUT", body: c });
export const fetchKitSettings = () => call("/api/kit/settings");
export const saveKitSettings = (s) => call("/api/kit/settings", { method: "PUT", body: s });
export const buildKit = (body) => call("/api/kit", { method: "POST", body });
export const saveKitDraft = (url, drafts) => call("/api/kit/draft", { method: "PUT", body: { url, drafts } });
export const improveKit = (body) => call("/api/kit/improve", { method: "POST", body });

// --- Alertes --------------------------------------------------------------------
export const fetchAlerts = () => call("/api/alerts");
export const saveAlerts = (cfg) => call("/api/alerts", { method: "PUT", body: cfg });
export const testAlerts = () => call("/api/alerts/test", { method: "POST", body: {} });
export const runAlertsNow = () => call("/api/alerts/run", { method: "POST", body: {} });