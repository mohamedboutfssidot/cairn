import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchJobs, fetchSources, fetchFilters, fetchMeta, startSearch, streamSearch,
  fetchProfile, saveProfile, saveTracking, deleteTracking,
  fetchSearches, deleteSearch, startRefresh, fetchRefresh, clearStore, hideJob, unhideJob,
} from "./api";

// État partagé entre toutes les pages. Il contient aussi TOUT le cycle de vie
// d'une recherche (lancement, flux SSE, progression) : ce provider reste monté
// pendant toute la navigation, donc changer de page ne coupe rien.
//
// Les offres vivent dans un STOCK PERMANENT côté serveur (store.py) : la liste
// affichée est toujours la réponse du serveur (filtres, scores, doublons fusionnés,
// compteurs cohérents). Pendant une recherche, le serveur enregistre les offres au
// fur et à mesure ; on recharge la liste à intervalles courts pour les voir arriver.
const JobsCtx = createContext(null);

const EMPTY_FILTERS = { hidden: 0, countries: [], cities: [], remote: { true: 0, false: 0, unknown: 0 }, statuses: {},
  levels: [], langs: [], visa: { yes: 0, no: 0, unknown: 0 }, salary: {} };

export function JobsProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const [count, setCount] = useState(0);
  const [sources, setSources] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [daysMax, setDaysMax] = useState("");
  const [sort, setSort] = useState("date_desc");
  const [remote, setRemote] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState("");     // "" | "tracked" | "none" | un statut
  const [minScore, setMinScore] = useState(""); // "" | "45" | "70"
  const [onlyNew, setOnlyNew] = useState(false);
  const [level, setLevel] = useState("");       // intern | junior | mid | senior | lead | manager
  const [lang, setLang] = useState("");         // en | fr | de ...
  const [visa, setVisa] = useState("");         // yes | no | unknown
  const [salaryMin, setSalaryMin] = useState(""); // USD / an
  const [showHidden, setShowHidden] = useState(false); // true = voir seulement les offres masquées
  const [profile, setProfile] = useState(null);

  // --- Recherche en cours -------------------------------------------------
  const [searchPhase, setSearchPhase] = useState("idle"); // idle | running | done | error
  const [sourceStates, setSourceStates] = useState({});   // id -> {label,status,count,error}
  const [searchSummary, setSearchSummary] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [searchDismissed, setSearchDismissed] = useState(false);
  const closeStreamRef = useRef(null);

  // --- Recherches enregistrées + actualisation -------------------------------
  const [savedSearches, setSavedSearches] = useState([]);
  const [refresh, setRefresh] = useState({ running: false });

  const isSearching = searchPhase === "running";

  const activeFilters = useMemo(
    () => ({ q, source, daysMax, remote, country, city, status, minScore, onlyNew, level, lang, visa, salaryMin, hidden: showHidden ? "only" : "" }),
    [q, source, daysMax, remote, country, city, status, minScore, onlyNew, level, lang, visa, salaryMin, showHidden]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJobs(activeFilters, sort);
      setJobs(data.jobs);
      setCount(data.count);
    } catch (e) {
      setError(e.message || "Le serveur local (server.py) ne répond pas. Vérifie qu'il tourne bien.");
    } finally {
      setLoading(false);
    }
  }, [activeFilters, sort]);

  // Les callbacks du flux SSE / du sondage sont créés une fois : ils doivent
  // appeler la version la plus récente de load() (filtres à jour).
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  // Compteurs des filtres : recalculés à chaque changement, en tenant compte
  // des autres filtres (voir server.py).
  useEffect(() => {
    fetchSources(activeFilters).then((d) => setSources(d.sources)).catch(() => {});
    fetchFilters(activeFilters).then(setFilters).catch(() => {});
    fetchMeta().then(setMeta).catch(() => {});
  }, [jobs, activeFilters]);

  // Rechargement espacé pendant une recherche / une actualisation (évite une
  // requête par lot d'offres reçu).
  const reloadTimer = useRef(null);
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) return;
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      loadRef.current();
    }, 1500);
  }, []);
  useEffect(() => () => {
    clearTimeout(reloadTimer.current);
    closeStreamRef.current?.();
  }, []);

  const resetFilters = useCallback(() => {
    setQ(""); setSource(""); setDaysMax(""); setRemote(""); setCountry(""); setCity("");
    setStatus(""); setMinScore(""); setOnlyNew(false); setLevel(""); setLang(""); setVisa(""); setSalaryMin(""); setShowHidden(false);
  }, []);

  const launchSearch = useCallback(async (params) => {
    closeStreamRef.current?.();
    // Nouvelle recherche = nouveau contexte : on retire les filtres de la
    // précédente (ex. "Morocco" actif alors qu'on cherche aux USA = liste vide).
    resetFilters();
    setSearchError(null);
    setSearchSummary(null);
    setSourceStates({});
    setSearchDismissed(false);
    setSearchPhase("running");

    try {
      await startSearch(params);
    } catch (e) {
      setSearchPhase("error");
      setSearchError(e.message);
      return;
    }

    closeStreamRef.current = streamSearch(
      (event) => {
        if (event.type === "source_event") {
          setSourceStates((prev) => ({
            ...prev,
            [event.source_id]: {
              label: event.label ?? prev[event.source_id]?.label,
              status: event.status,
              count: event.count,
              error: event.error,
            },
          }));
        } else if (event.type === "jobs_batch") {
          scheduleReload();   // le serveur vient d'enregistrer ces offres dans le stock
        } else if (event.type === "search_done") {
          setSearchSummary({ total: event.total, totalRaw: event.total_raw, added: event.new, stock: event.stock });
          setSearchPhase("done");
          loadRef.current();
        } else if (event.type === "search_error") {
          setSearchPhase("error");
          setSearchError(event.error);
        }
      },
      () => {
        // flux fermé côté serveur ; si on n'a jamais reçu search_done
        // (ex. erreur réseau en cours de route), on sort quand même de "running"
        setSearchPhase((p) => (p === "running" ? "done" : p));
      }
    );
  }, [resetFilters, scheduleReload]);

  const dismissSearch = useCallback(() => setSearchDismissed(true), []);

  // --- Recherches enregistrées / actualisation --------------------------------
  const reloadSearches = useCallback(async () => {
    try {
      const d = await fetchSearches();
      setSavedSearches(d.searches);
      setRefresh(d.refresh);
      return d;
    } catch {
      return null;
    }
  }, []);
  useEffect(() => { reloadSearches(); }, [reloadSearches]);

  const refreshRunning = Boolean(refresh.running);
  // Pendant une actualisation : état + liste rafraîchis toutes les 3 s.
  useEffect(() => {
    if (!refreshRunning) return undefined;
    const t = setInterval(async () => {
      try {
        const r = await fetchRefresh();
        setRefresh(r);
        loadRef.current();
        if (!r.running) reloadSearches();
      } catch { /* serveur arrêté : on réessaiera */ }
    }, 3000);
    return () => clearInterval(t);
  }, [refreshRunning, reloadSearches]);

  const refreshAll = useCallback(async (ids) => {
    await startRefresh(ids);
    setRefresh({ running: true, index: 0, total: ids ? ids.length : savedSearches.length, label: null });
  }, [savedSearches.length]);

  const removeSearch = useCallback(async (id) => {
    await deleteSearch(id);
    reloadSearches();
  }, [reloadSearches]);

  const clearStock = useCallback(async () => {
    await clearStore();
    loadRef.current();
  }, []);

  // --- Profil / suivi -------------------------------------------------------
  useEffect(() => { fetchProfile().then(setProfile).catch(() => {}); }, []);

  // Profil modifié -> le serveur recalcule les scores, on recharge la liste.
  const updateProfile = useCallback(async (next) => {
    const saved = await saveProfile(next);
    setProfile(saved);
    loadRef.current();
    return saved;
  }, []);

  // Suivi de candidature : crée/met à jour (patch = {status, note, follow_up...}).
  const track = useCallback(async (job, patch) => {
    const item = await saveTracking({ url: job.url, job, ...patch });
    loadRef.current();
    return item;
  }, []);
  const untrack = useCallback(async (job) => {
    await deleteTracking(job.url);
    loadRef.current();
  }, []);

  // Masquer / rétablir : le serveur retire l'offre (ou toute l'entreprise) de la liste.
  const hide = useCallback(async (job, scope = "job") => {
    await hideJob(job.url, job.company, scope);
    loadRef.current();
  }, []);
  const unhide = useCallback(async (job) => {
    await unhideJob(job.url, job.company);
    loadRef.current();
  }, []);

  const hasProfile = Boolean(profile && (profile.titles.length || profile.must.length || profile.nice.length
    || profile.exclude.length || profile.countries.length || profile.remote !== "any" || profile.visa));

  const value = useMemo(() => ({
    jobs, displayedJobs: jobs, count, sources, filters, meta,
    loading, error, isSearching,
    q, setQ, source, setSource, daysMax, setDaysMax, sort, setSort,
    remote, setRemote, country, setCountry, city, setCity,
    status, setStatus, minScore, setMinScore, onlyNew, setOnlyNew,
    level, setLevel, lang, setLang, visa, setVisa, salaryMin, setSalaryMin, resetFilters,
    showHidden, setShowHidden, hide, unhide,
    profile, hasProfile, updateProfile, track, untrack,
    savedSearches, reloadSearches, removeSearch, refresh, refreshAll, clearStock,
    searchPhase, sourceStates, searchSummary, searchError, searchDismissed,
    launchSearch, dismissSearch,
  }), [
    jobs, count, sources, filters, meta,
    loading, error, isSearching, q, source, daysMax, sort, remote, country, city, status, minScore, onlyNew,
    level, lang, visa, salaryMin, resetFilters, showHidden, hide, unhide,
    profile, hasProfile, updateProfile, track, untrack,
    savedSearches, reloadSearches, removeSearch, refresh, refreshAll, clearStock,
    searchPhase, sourceStates, searchSummary, searchError, searchDismissed,
    launchSearch, dismissSearch,
  ]);

  return <JobsCtx.Provider value={value}>{children}</JobsCtx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useJobs() {
  const ctx = useContext(JobsCtx);
  if (!ctx) throw new Error("useJobs() doit être utilisé sous <JobsProvider>");
  return ctx;
}