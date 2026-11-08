import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as api from "./api.js";
import { COUNTRIES, countryKey, daysSince, defaultTitles, isDue, rememberMode, todayIso, wizCalc } from "./meta.js";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const EMPTY_CAND = { name: "", headline: "", email: "", phone: "", location: "", linkedin: "", github: "", website: "", summary: "", skills: [], experiences: [], education: [], languages: [] };
export const EMPTY_PROFILE = { titles: [], must: [], nice: [], exclude: [], countries: [], remote: "any", visa: false };
export const EMPTY_F = { source: "", remote: "", level: "", lang: "", visa: "", salary: 0, minScore: 0, hidden: false, country: "", city: "", period: 0 };
export const newWiz = (country = null) => ({ step: 1, country, extra: [], cats: ["ai"], edited: false, picked: [], custom: [], save: true, q: "", fam: { ai: true } });

const norm = (j) => ({ ...j, id: j.url, days: daysSince(j.posted_date), sources: j.sources?.length ? j.sources : [j.source].filter(Boolean), reasons: j.reasons || [], langs: j.langs || [], follow: j.follow_up || null, city: j.city || j.location || "" });

export function AppProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const [hiddenJobs, setHiddenJobs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [total, setTotal] = useState(0);   // vrai total du stock (la liste affichée est plafonnée à 5000)
  const [offline, setOffline] = useState(false);
  const [meta, setMeta] = useState({});
  const [searches, setSearches] = useState([]);
  const [refresh, setRefresh] = useState({ running: false });
  const [cand, setCand] = useState(EMPTY_CAND);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [alerts, setAlerts] = useState(null);
  const [kitSettings, setKitSettings] = useState({ has_key: false, model: "" });
  const [run, setRun] = useState(null);
  const [modal, setModal] = useState(null); // {type, ...}
  const [toast, setToast] = useState("");
  const [theme, setThemeState] = useState(() => { try { return localStorage.getItem("cairn-theme") || ""; } catch { return ""; } });
  // état de la page Offres
  const [view, setView] = useState("foryou");
  const [q, setQ] = useState("");
  const [f, setF] = useState(EMPTY_F);
  const [sort, setSort] = useState("score");
  const [wiz, setWiz] = useState(newWiz());
  const [ob, setOb] = useState({ step: 1, skip: false });
  const toastTimer = useRef(null);

  const say = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3800);
  }, []);

  const setTheme = (t) => {
    setThemeState(t);
    try { t ? localStorage.setItem("cairn-theme", t) : localStorage.removeItem("cairn-theme"); } catch { /* stockage indisponible */ }
  };
  useEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }, [theme]);
  const isDark = theme ? theme === "dark" : typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  // --- chargement ---------------------------------------------------------
  const loadJobs = useCallback(async () => {
    const [j, m] = await Promise.all([api.fetchJobs(), api.fetchMeta().catch(() => ({}))]);
    setJobs((j.jobs || []).map(norm));
    setTotal(j.count ?? (j.jobs || []).length);
    setMeta(m || {});
    setLoaded(true);
    setOffline(false);
  }, []);
  const loadHidden = useCallback(async () => {
    const j = await api.fetchJobs({ hidden: "only" });
    setHiddenJobs((j.jobs || []).map((x) => ({ ...norm(x), hidden: true })));
  }, []);
  const loadSearches = useCallback(async () => {
    const r = await api.fetchSearches().catch(() => null);
    if (r) { setSearches(r.searches || []); if (r.refresh) setRefresh(r.refresh); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadJobs();
      } catch {
        setOffline(true); setLoaded(true);
      }
      loadSearches();
      api.fetchCandidate().then((c) => setCand({ ...EMPTY_CAND, ...c })).catch(() => {});
      api.fetchProfile().then((p) => setProfile({ ...EMPTY_PROFILE, ...p })).catch(() => {});
      api.fetchAlerts().then(setAlerts).catch(() => {});
      api.fetchKitSettings().then(setKitSettings).catch(() => {});
    })();
  }, [loadJobs, loadSearches]);

  useEffect(() => { if (f.hidden) loadHidden().catch(() => {}); }, [f.hidden, loadHidden]);

  // --- progression en direct (sondage de /api/progress toutes les secondes) ------
  // Chaque lot d'offres enregistré par le serveur change `tick` : on recharge alors la liste,
  // donc les offres apparaissent dans « Offres » dès qu'une source les renvoie.
  const [progress, setProgress] = useState(null);
  const lastTick = useRef(-1);
  const lastLoad = useRef(0);
  const loading = useRef(false);
  const live = useRef({});
  live.current = { run, refresh };
  const busy = !!run || !!refresh.running || !!progress?.running;

  const reloadSoon = useCallback(() => {
    const now = Date.now();
    if (loading.current || now - lastLoad.current < 1500) return;
    loading.current = true; lastLoad.current = now;
    loadJobs().catch(() => {}).finally(() => { loading.current = false; });
  }, [loadJobs]);

  const finishing = useRef(false);
  const finishRun = useCallback(async (cur, p) => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      await loadJobs().catch(() => {});
      if (p.error) say("La recherche a échoué : " + p.error);
      else {
        if (cur.save) { await api.saveSearch(cur.params, cur.label).catch(() => {}); await loadSearches(); }
        say(`Recherche terminée : ${p.stock ?? p.total ?? 0} offres dans ta liste.`);
      }
    } finally { setRun(null); finishing.current = false; }
  }, [loadJobs, loadSearches, say]);

  useEffect(() => {
    if (!busy) return undefined;
    let stop = false;
    const step = async () => {
      try {
        const p = await api.fetchProgress();
        if (stop) return;
        setProgress(p);
        if (p.tick !== lastTick.current) { lastTick.current = p.tick; reloadSoon(); }
        const { run: cur, refresh: ref } = live.current;
        if (ref.running) {
          const r = await api.fetchRefresh();
          if (stop) return;
          setRefresh(r);
          if (!r.running) {
            await loadJobs().catch(() => {}); await loadSearches();
            if (r.error) say("Actualisation terminée avec une erreur : " + r.error);
            else say(r.new ? `${r.new} nouvelle${r.new > 1 ? "s" : ""} offre${r.new > 1 ? "s" : ""}.` : "Tout est à jour.");
          }
        } else if (cur && !p.running && p.search_id === cur.id) {
          await finishRun(cur, p);
        } else if (!cur && !p.running) {
          await loadJobs().catch(() => {});   // recherche reprise après un rechargement de la page
        }
      } catch { /* serveur momentanément indisponible : on réessaie au prochain passage */ }
    };
    const id = setInterval(step, 1000);
    step();
    return () => { stop = true; clearInterval(id); };
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Au chargement : reprend l'affichage d'une recherche déjà en cours (page rechargée).
  useEffect(() => { api.fetchProgress().then((p) => p.running && setProgress(p)).catch(() => {}); }, []);

  const refreshAll = async (ids, mode = "fast") => {
    try {
      rememberMode(mode);
      await api.startRefresh(ids, mode);
      lastTick.current = -1;
      setRefresh({ running: true, index: 0, total: ids?.length || searches.length, label: "", mode });
    } catch (e) { say(e.message); }
  };
  // Demande « rapide ou approfondie ? » avant chaque actualisation.
  const askRefresh = (ids) => setModal({ type: "refresh", ids: ids || null });
  // À l'ouverture de l'application : une seule fois par session, s'il y a des recherches enregistrées.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !loaded || offline || !searches.length || refresh.running) return;
    let seen = false;
    try { seen = sessionStorage.getItem("cairn-asked") === "1"; sessionStorage.setItem("cairn-asked", "1"); } catch { /* stockage indisponible */ }
    asked.current = true;
    if (!seen) setModal({ type: "refresh", ids: null, atOpen: true });
  }, [loaded, offline, searches.length, refresh.running]);

  // --- lancer une recherche : les offres arrivent en direct dans la liste ----------
  const buildParams = (w) => {
    const co = COUNTRIES.find((c) => c.id === w.country);
    return { keywords: w.picked, location: co?.location || "", jobicy_geo: co?.jobicyGeo || "", country_indeed: co?.countryIndeed || "" };
  };
  const launchSearch = async (w, kind = "search", mode = "fast", clean = false) => {
    const k = wizCalc(w);
    const picked = w.edited ? w.picked : defaultTitles(w, k.fams);
    const wz = { ...w, picked };
    if (!picked.length || !k.co) return false;
    const params = buildParams(wz);
    let id;
    try {
      rememberMode(mode === "deep" ? "deep" : "fast");
      const r = await api.startSearch({ keywords: params.keywords, location: params.location, jobicyGeo: params.jobicy_geo, countryIndeed: params.country_indeed, mode: mode === "all" ? null : mode, clean });
      id = r.search_id;
    } catch (e) {
      say(e.status === 409 ? "Une recherche est déjà en cours." : e.message);
      return false;
    }
    lastTick.current = -1;
    setView("all"); setQ("");   // pour voir toutes les offres arriver, pas seulement « Pour toi »
    if (clean) loadJobs().catch(() => {});   // la liste a été nettoyée au démarrage : on l'affiche tout de suite
    setRun({ id, kind, mode, save: wz.save, params, label: `${k.co.label} · ${picked.length} poste${picked.length > 1 ? "s" : ""}` });
    return true;
  };

  // Retire les offres non suivies ; les offres suivies (tous statuts) restent.
  const cleanList = async () => {
    try { const r = await api.clearStore(); await loadJobs(); say(`${r.cleared ?? 0} offres retirées. Tes offres suivies sont conservées.`); } catch (e) { say(e.message); }
  };

  // --- suivi -------------------------------------------------------------------
  const patch = (url, p) => {
    const fn = (arr) => arr.map((j) => (j.url === url ? { ...j, ...p } : j));
    setJobs(fn); setHiddenJobs(fn);
  };
  const findJob = (url) => jobs.find((j) => j.url === url) || hiddenJobs.find((j) => j.url === url) || null;
  const setStatus = async (job, status) => {
    patch(job.url, { status });
    try {
      const body = { url: job.url, status, job: { title: job.title, company: job.company, location: job.location, source: job.source } };
      if (status === "applied" && !job.follow_up) { const dt = new Date(); dt.setDate(dt.getDate() + 7); body.follow_up = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; patch(job.url, { follow_up: body.follow_up, follow: body.follow_up }); }
      await api.putTracking(body);
    } catch (e) { say(e.message); patch(job.url, { status: job.status }); }
  };
  const untrack = async (job) => {
    patch(job.url, { status: null, note: "", follow_up: null, follow: null });
    await api.deleteTracking(job.url).catch((e) => say(e.message));
  };
  const saveNote = (job, note) => { patch(job.url, { note }); return api.putTracking({ url: job.url, note }).catch(() => {}); };
  const setFollow = async (job, iso) => {
    patch(job.url, { follow_up: iso || null, follow: iso || null });
    await api.putTracking(iso ? { url: job.url, follow_up: iso } : { url: job.url, clear_follow_up: true }).catch((e) => say(e.message));
  };
  const hide = async (job, scope = "job") => {
    await api.hideJob(job.url, job.company, scope).catch((e) => say(e.message));
    await loadJobs(); if (f.hidden) loadHidden();
    say(scope === "company" ? `${job.company} est masquée.` : "Offre masquée.");
  };
  const unhide = async (job) => {
    await api.unhide({ url: job.url }).catch((e) => say(e.message));
    await loadJobs(); loadHidden();
  };

  // --- profil, candidat, alertes -----------------------------------------------
  const saveCand = async (c) => { setCand(c); try { await api.saveCandidate(c); } catch (e) { say(e.message); } };
  const saveProf = async (p) => { setProfile(p); try { await api.saveProfile(p); loadJobs(); } catch (e) { say(e.message); } };
  const saveAl = async (cfg) => { try { const r = await api.saveAlerts(cfg); setAlerts(r); return r; } catch (e) { say(e.message); return null; } };

  // --- dérivés -------------------------------------------------------------------
  const tracked = useMemo(() => jobs.filter((j) => j.status), [jobs]);
  const due = useMemo(() => tracked.filter(isDue).sort((a, b) => (a.follow_up < b.follow_up ? -1 : 1)), [tracked]);
  const fresh = useMemo(() => jobs.filter((j) => j.is_new && !j.status).sort((a, b) => (b.score ?? -1) - (a.score ?? -1)), [jobs]);
  const counts = useMemo(() => {
    const c = { saved: 0, applied: 0, interview: 0, offer: 0, rejected: 0 };
    tracked.forEach((j) => { if (c[j.status] != null) c[j.status]++; });
    return c;
  }, [tracked]);
  // Pays de référence pour la vue « Local » : celui de la dernière recherche, sinon du profil, sinon le plus fréquent.
  const home = useMemo(() => {
    const last = [...searches].reverse().find((s) => s.params?.location);
    const fromSearch = last ? COUNTRIES.find((c) => c.location === last.params.location)?.label : "";
    const fromWiz = COUNTRIES.find((c) => c.id === wiz.country)?.label;
    const fromProfile = (profile.countries || [])[0];
    if (fromSearch || fromWiz || fromProfile) return fromSearch || fromWiz || fromProfile;
    const m = new Map();
    jobs.forEach((j) => { if (j.country && j.remote !== true) m.set(j.country, (m.get(j.country) || 0) + 1); });
    return [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || "";
  }, [searches, wiz.country, profile.countries, jobs]);
  const isNewcomer = loaded && !offline && jobs.length === 0 && tracked.length === 0 && searches.length === 0 && !run;

  const value = {
    jobs, hiddenJobs, total, cleanList, progress, busy, loaded, offline, meta, searches, refresh, cand, profile, alerts, kitSettings, run, modal, toast,
    view, q, f, sort, wiz, ob, home, isDark, theme, tracked, due, fresh, counts, isNewcomer,
    setView, setQ, setF, setSort, setWiz, setOb, setModal, setKitSettings, setAlerts, say, toggleTheme, setTheme,
    loadJobs, loadSearches, refreshAll, askRefresh, launchSearch, findJob, setStatus, untrack, saveNote, setFollow, hide, unhide,
    saveCand, saveProf, saveAl, patch, api,
    deleteSearch: async (id) => { await api.deleteSearch(id).catch((e) => say(e.message)); loadSearches(); },
    today: todayIso(),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}