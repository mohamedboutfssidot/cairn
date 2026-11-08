import { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useJobs } from "../JobsContext";
import JobCard from "../JobCard";
import JobDetail from "../JobDetail";
import { Segmented, StepSlider, FacetBars, RemovableChip, FilterSection } from "../ui";
import { activityText } from "../progressText";
import { STATUSES, STATUS_LABEL, LEVEL_LABEL, LANG_LABEL, SALARY_STEPS, salaryLabel } from "../trackingMeta";

const PAGE_SIZE = 100;

const PERIOD_STEPS = [
  { value: "", label: "Tout" },
  { value: "90", label: "90 j" },
  { value: "30", label: "30 j" },
  { value: "7", label: "7 j" },
  { value: "1", label: "24 h" },
];
const PERIOD_LABEL = { 90: "90 derniers jours", 30: "30 derniers jours", 7: "7 derniers jours", 1: "Dernières 24 h" };

const SORT_OPTIONS = [
  { value: "date_desc", label: "Récentes" },
  { value: "date_asc", label: "Anciennes" },
];
const SORT_WITH_SCORE = [{ value: "score_desc", label: "Pertinence" }, ...SORT_OPTIONS];

const SCORE_STEPS = [
  { value: "", label: "Tous" },
  { value: "45", label: "≥ 45" },
  { value: "70", label: "≥ 70" },
];

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "";
}

export default function JobsPage() {
  const {
    displayedJobs, count, sources, filters, meta, loading, error, isSearching,
    q, setQ, source, setSource, daysMax, setDaysMax, sort, setSort,
    remote, setRemote, country, setCountry, city, setCity,
    status, setStatus, minScore, setMinScore, onlyNew, setOnlyNew, hasProfile,
    level, setLevel, lang, setLang, visa, setVisa, salaryMin, setSalaryMin, resetFilters,
    savedSearches, refresh, refreshAll, clearStock, showHidden, setShowHidden,
    searchPhase, sourceStates, searchSummary,
  } = useJobs();

  const [selected, setSelected] = useState(null);
  // Écrans étroits : liste OU détail (le détail s'ouvre au clic, bouton Retour).
  const [detailOpen, setDetailOpen] = useState(false);
  // Écrans moyens/étroits : la colonne de filtres devient un tiroir.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (displayedJobs.length > 0) {
      setSelected((prev) => displayedJobs.find((j) => prev && j.url === prev.url) || displayedJobs[0]);
    } else {
      setSelected(null);
    }
  }, [displayedJobs]);

  const countryItems = useMemo(
    () => filters.countries.map((c) => ({ key: c.country, label: c.country, count: c.count })),
    [filters.countries]
  );
  const cityItems = useMemo(
    () => (filters.cities || []).map((c) => ({ key: c.city, label: c.city, count: c.count })),
    [filters.cities]
  );
  const sourceItems = useMemo(
    () => sources.map((s) => ({ key: s.source, label: s.source, count: s.count })),
    [sources]
  );
  const levelItems = useMemo(
    () => (filters.levels || []).map((l) => ({ key: l.level, label: LEVEL_LABEL[l.level] || l.level, count: l.count })),
    [filters.levels]
  );
  const langItems = useMemo(
    () => (filters.langs || []).map((l) => ({ key: l.lang, label: LANG_LABEL[l.lang] || l.lang, count: l.count })),
    [filters.langs]
  );
  const statusItems = useMemo(
    () => STATUSES.filter((s) => (filters.statuses || {})[s.id]).map((s) => ({ key: s.id, label: s.label, count: filters.statuses[s.id] })),
    [filters.statuses]
  );
  const trackedTotal = statusItems.reduce((n, i) => n + i.count, 0);
  const salarySteps = useMemo(
    () => SALARY_STEPS.map((s) => ({ ...s, label: s.value ? s.label : "Tous" })),
    []
  );

  const activeChips = [];
  if (onlyNew) activeChips.push({ id: "new", label: "Nouvelles", clear: () => setOnlyNew(false) });
  if (status) activeChips.push({ id: "status", label: status === "tracked" ? "Suivies" : status === "none" ? "Non suivies" : STATUS_LABEL[status], clear: () => setStatus("") });
  if (minScore) activeChips.push({ id: "score", label: `Pertinence ≥ ${minScore}`, clear: () => setMinScore("") });
  if (q) activeChips.push({ id: "q", label: `« ${q} »`, clear: () => setQ("") });
  if (remote === "true") activeChips.push({ id: "remote", label: "Remote", clear: () => setRemote("") });
  if (remote === "false") activeChips.push({ id: "onsite", label: "Sur site", clear: () => setRemote("") });
  if (daysMax) activeChips.push({ id: "days", label: PERIOD_LABEL[daysMax] || `${daysMax} j`, clear: () => setDaysMax("") });
  if (country) activeChips.push({ id: "country", label: country, clear: () => { setCountry(""); setCity(""); } });
  if (city) activeChips.push({ id: "city", label: city, clear: () => setCity("") });
  if (level) activeChips.push({ id: "level", label: LEVEL_LABEL[level] || level, clear: () => setLevel("") });
  if (lang) activeChips.push({ id: "lang", label: LANG_LABEL[lang] || lang, clear: () => setLang("") });
  if (visa) activeChips.push({ id: "visa", label: visa === "yes" ? "Visa possible" : "Sans visa", clear: () => setVisa("") });
  if (salaryMin) activeChips.push({ id: "salary", label: `Salaire ${salaryLabel(salaryMin)}`, clear: () => setSalaryMin("") });
  if (showHidden) activeChips.push({ id: "hidden", label: "Offres masquées", clear: () => setShowHidden(false) });
  if (source) activeChips.push({ id: "source", label: source, clear: () => setSource("") });

  // Longues listes : 100 cartes à la fois ("Afficher plus"), sinon la page
  // ralentit. La limite repart à 100 dès qu'un filtre change.
  const filterKey = JSON.stringify([q, source, daysMax, remote, country, city, sort, status, minScore, onlyNew, level, lang, visa, salaryMin, showHidden]);
  const [lim, setLim] = useState({ key: "", n: PAGE_SIZE });
  const limit = lim.key === filterKey ? lim.n : PAGE_SIZE;
  const shownJobs = displayedJobs.slice(0, limit);

  const refreshing = Boolean(refresh.running);
  async function onRefresh() {
    setRefreshError(null);
    try { await refreshAll(); } catch (e) { setRefreshError(e.message); }
  }
  async function onClear() {
    if (window.confirm("Vider le stock d'offres ? Tes candidatures suivies sont conservées.")) {
      try { await clearStock(); } catch (e) { setRefreshError(e.message); }
    }
  }

  const subtitle = useMemo(() => {
    if (isSearching) return activityText(searchPhase, sourceStates, searchSummary);
    if (refreshing) return `Actualisation ${refresh.index || 0}/${refresh.total || "?"}${refresh.label ? ` · ${refresh.label}` : ""}`;
    if (!meta || !meta.exists) return "Stock vide — lance une recherche pour le remplir";
    return `${meta.total} offres en stock · mis à jour le ${formatDate(meta.last_updated)}`;
  }, [meta, isSearching, refreshing, refresh]);

  return (
    <div className="page page--jobs">
      <header className="page__header">
        <div>
          <h1>Offres</h1>
          <p className="page__subtitle">{subtitle}</p>
        </div>
        <div className="page__header-right">
          <button
            type="button"
            className={`refresh-btn ${refreshing ? "refresh-btn--busy" : ""}`}
            onClick={onRefresh}
            disabled={refreshing || savedSearches.length === 0}
            title={savedSearches.length === 0 ? "Enregistre d'abord une recherche (page Recherche)" : "Relancer toutes tes recherches enregistrées"}
          >
            <span className="refresh-btn__icon" aria-hidden="true">↻</span>
            {refreshing ? "Actualisation…" : "Actualiser"}
          </button>
          <button type="button" className="filters-btn" onClick={() => setDrawerOpen(true)}>
            Filtres{activeChips.length > 0 && <span className="filters-btn__n">{activeChips.length}</span>}
          </button>
          <div className="page__count">
            {(isSearching || refreshing) && <span className="live-indicator" />}
            {count} offre{count === 1 ? "" : "s"}
          </div>
        </div>
      </header>

      <div className="commandbar">
        <div className="commandbar__search">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="text"
            placeholder="Titre, entreprise, mot-clé…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Rechercher dans les offres"
          />
          {q && <button type="button" className="commandbar__clear" onClick={() => setQ("")} aria-label="Effacer">×</button>}
        </div>
        <Segmented options={hasProfile ? SORT_WITH_SCORE : SORT_OPTIONS} value={sort} onChange={setSort} ariaLabel="Tri" size="sm" />
      </div>

      {activeChips.length > 0 && (
        <div className="activechips">
          {activeChips.map((c) => <RemovableChip key={c.id} label={c.label} onRemove={c.clear} />)}
          <button type="button" className="activechips__reset" onClick={resetFilters}>Tout effacer</button>
        </div>
      )}

      {error && <div className="page__error">{error}</div>}
      {refreshError && <div className="page__error">{refreshError}</div>}
      {refresh.error && !refreshing && <div className="page__error">Dernière actualisation : {refresh.error}</div>}

      <div className="jobs-layout">
        {drawerOpen && <div className="filter-backdrop" onClick={() => setDrawerOpen(false)} />}
        <aside className={`filter-rail ${drawerOpen ? "filter-rail--open" : ""}`} aria-label="Filtres">
          <div className="filter-rail__head">
            <span>Filtres</span>
            <button type="button" className="filter-rail__close" onClick={() => setDrawerOpen(false)} aria-label="Fermer les filtres">×</button>
          </div>

          <button type="button" className={`newtoggle ${onlyNew ? "newtoggle--on" : ""}`} aria-pressed={onlyNew} onClick={() => setOnlyNew(!onlyNew)}>
            <span className="newtoggle__dot" />
            <span>Nouvelles offres seulement</span>
          </button>

          <FilterSection title="Mode de travail">
            <Segmented
              size="sm"
              ariaLabel="Télétravail"
              value={remote}
              onChange={setRemote}
              options={[
                { value: "", label: "Tous" },
                { value: "true", label: "Remote", count: filters.remote.true },
                { value: "false", label: "Site", count: filters.remote.false },
              ]}
            />
          </FilterSection>

          {hasProfile ? (
            <FilterSection title="Pertinence" hint={minScore ? `≥ ${minScore}` : "toutes"}>
              <StepSlider steps={SCORE_STEPS} value={minScore} onChange={setMinScore} ariaLabel="Pertinence minimale" />
            </FilterSection>
          ) : (
            <Link to="/profile" className="profile-nudge">
              <strong>Score de pertinence</strong>
              <span>Renseigne ton profil pour trier les offres par pertinence →</span>
            </Link>
          )}

          {(statusItems.length > 0 || status) && (
            <FilterSection title="Suivi" hint={trackedTotal ? String(trackedTotal) : ""}>
              <FacetBars
                items={statusItems}
                value={["tracked", "none"].includes(status) ? "" : status}
                onChange={setStatus}
                tone="blue"
                limit={5}
              />
              <div className="trk-quick">
                <button type="button" className={status === "tracked" ? "on" : ""} onClick={() => setStatus(status === "tracked" ? "" : "tracked")}>Suivies</button>
                <button type="button" className={status === "none" ? "on" : ""} onClick={() => setStatus(status === "none" ? "" : "none")}>Non suivies</button>
              </div>
            </FilterSection>
          )}

          <FilterSection title="Publiée" hint={daysMax ? PERIOD_LABEL[daysMax] : "toutes dates"}>
            <StepSlider steps={PERIOD_STEPS} value={daysMax} onChange={setDaysMax} ariaLabel="Ancienneté maximale" />
          </FilterSection>

          <FilterSection title="Pays" hint={countryItems.length ? String(countryItems.length) : ""}>
            <FacetBars
              items={countryItems}
              value={country}
              onChange={(v) => { setCountry(v); setCity(""); }}
              emptyLabel="Pays détectés après une recherche"
            />
          </FilterSection>

          <FilterSection title="Ville / région" hint={cityItems.length ? String(cityItems.length) : ""}>
            <FacetBars
              items={cityItems}
              value={city}
              onChange={setCity}
              searchable
              limit={8}
              tone="blue"
              emptyLabel="Villes détectées après une recherche"
            />
          </FilterSection>

          <FilterSection title="Niveau" hint={levelItems.length ? String(levelItems.length) : ""}>
            <FacetBars items={levelItems} value={level} onChange={setLevel} limit={6} emptyLabel="Niveau non précisé dans les offres" />
          </FilterSection>

          <FilterSection title="Langue" hint={langItems.length ? String(langItems.length) : ""} defaultOpen={false}>
            <FacetBars items={langItems} value={lang} onChange={setLang} tone="blue" limit={6} emptyLabel="Langue non détectée" />
          </FilterSection>

          <FilterSection title="Visa / relocation" hint={visa ? (visa === "yes" ? "oui" : "non") : ""} defaultOpen={false}>
            <Segmented
              size="sm"
              ariaLabel="Visa"
              value={visa}
              onChange={setVisa}
              options={[
                { value: "", label: "Tous" },
                { value: "yes", label: "Oui", count: filters.visa?.yes ?? 0 },
                { value: "no", label: "Non", count: filters.visa?.no ?? 0 },
              ]}
            />
            <p className="facet-note">Détecté dans le texte de l'offre ; « Tous » inclut les offres qui n'en parlent pas.</p>
          </FilterSection>

          <FilterSection title="Salaire annuel" hint={salaryMin ? salaryLabel(salaryMin) : ""} defaultOpen={false}>
            <StepSlider steps={salarySteps} value={salaryMin} onChange={setSalaryMin} ariaLabel="Salaire minimal" />
            <p className="facet-note">En USD, converti approximativement. Seules les offres qui indiquent un salaire sont comptées.</p>
          </FilterSection>

          <FilterSection title="Source" hint={sourceItems.length ? String(sourceItems.length) : ""} defaultOpen={false}>
            <FacetBars items={sourceItems} value={source} onChange={setSource} tone="warm" limit={8} />
          </FilterSection>

          <button type="button" className="filter-rail__apply" onClick={() => setDrawerOpen(false)}>
            Voir {count} offre{count === 1 ? "" : "s"}
          </button>
          {(filters.hidden > 0 || showHidden) && (
            <button type="button" className={`hidden-toggle ${showHidden ? "hidden-toggle--on" : ""}`} aria-pressed={showHidden} onClick={() => setShowHidden(!showHidden)}>
              {showHidden ? "← Retour aux offres" : `Voir les offres masquées (${filters.hidden})`}
            </button>
          )}
          <button type="button" className="stock-clear" onClick={onClear}>Vider le stock d'offres</button>
        </aside>

        <div className={`jobs-body ${detailOpen ? "jobs-body--detail" : ""}`}>
          <div className="job-list" ref={listRef}>
            {loading && !isSearching && displayedJobs.length === 0 && <div className="job-list__loading">Chargement…</div>}
            {!loading && displayedJobs.length === 0 && !error && (
              <div className="job-list__empty">
                {isSearching || refreshing
                  ? "En attente des premiers résultats…"
                  : meta && meta.exists
                    ? "Aucune offre ne correspond à ces filtres."
                    : <>Le stock est vide. <Link to="/search">Lance une première recherche</Link> : les offres y resteront et se mettront à jour.</>}
                {!isSearching && activeChips.length > 0 && (
                  <button className="facet-reset" onClick={resetFilters}>Réinitialiser les filtres</button>
                )}
              </div>
            )}
            {shownJobs.map((job, i) => (
              <JobCard
                key={job.url || i}
                job={job}
                selected={selected && selected.url === job.url}
                onClick={() => { setSelected(job); setDetailOpen(true); }}
                isNew={isSearching && i < 3}
              />
            ))}
            {displayedJobs.length > limit && (
              <button
                className="job-list__more"
                onClick={() => setLim({ key: filterKey, n: limit + PAGE_SIZE })}
              >
                Afficher plus ({displayedJobs.length - limit} restantes)
              </button>
            )}
          </div>

          <JobDetail job={selected} onBack={() => setDetailOpen(false)} />
        </div>
      </div>
    </div>
  );
}