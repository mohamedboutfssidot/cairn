import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { addSearch } from "./api";
import { activityText } from "./progressText";
import { useJobs } from "./JobsContext";
import { COUNTRY_PRESETS } from "./countryPresets";
import { LANGS, CATEGORIES, ROLES, languagesFor, variantsOf, recommend } from "./roleEngine";
import { Segmented, LangTag } from "./ui";
import { SITES } from "./sites";

const DEFAULT_COUNT = 12;   // nombre de postes proposé par défaut (réglable, sans plafond)
const STORE_KEY = "jd.searchConfig.v2";

const CODES = {
  usa: "US", canada: "CA", uk: "GB", germany: "DE", france: "FR", spain: "ES",
  portugal: "PT", netherlands: "NL", poland: "PL", india: "IN", morocco: "MA",
  brazil: "BR", mexico: "MX", argentina: "AR", philippines: "PH", australia: "AU",
  singapore: "SG", worldwide: "∞",
};

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}

const MODE_OPTIONS = [
  { value: "country", label: "Par pays" },
  { value: "custom", label: "Mots-clés" },
  { value: "default", label: "Par défaut" },
];
const MODE_HINT = {
  country: "Offres locales + remote d'un pays, postes adaptés à sa langue",
  custom: "Tes propres mots-clés, sur les sources remote",
  default: "Mots-clés de config.py, sur les sources remote",
};
const PHASE_LABEL = { idle: "En veille", running: "En cours", done: "Terminée", error: "Erreur" };

function splitKeywords(text) {
  return text.split(/[,\n;]/).map((k) => k.trim()).filter(Boolean);
}

export default function SearchPanel() {
  const {
    launchSearch, searchPhase: phase, sourceStates,
    searchSummary: summary, searchError: globalError,
    savedSearches, reloadSearches, removeSearch, refreshAll, refresh,
  } = useJobs();

  const saved = useMemo(loadConfig, []);
  const [mode, setMode] = useState(saved.mode || "country");
  const [customText, setCustomText] = useState(saved.customText || "");
  const [selectedCountry, setSelectedCountry] = useState(saved.country || null);
  const [langs, setLangs] = useState(() => new Set(saved.langs || []));
  const [cats, setCats] = useState(() => new Set(saved.cats || ["ai"]));
  const [selectedTitles, setSelectedTitles] = useState(() => new Set(saved.titles || []));
  const [customTitles, setCustomTitles] = useState(saved.customTitles || []);
  const [edited, setEdited] = useState(Boolean(saved.edited));
  const [titleFilter, setTitleFilter] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [scheduled, setScheduled] = useState(null); // null | libellé | "error"
  const [wanted, setWanted] = useState(saved.wanted || DEFAULT_COUNT);   // nombre de postes souhaité
  const [showLangs, setShowLangs] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        mode, customText, country: selectedCountry,
        langs: [...langs], cats: [...cats], edited, wanted,
        titles: [...selectedTitles], customTitles,
      }));
    } catch { /* stockage indisponible : on ignore */ }
  }, [mode, customText, selectedCountry, langs, cats, edited, wanted, selectedTitles, customTitles]);

  const preset = COUNTRY_PRESETS.find((c) => c.id === selectedCountry) || null;
  const customKeywords = useMemo(() => splitKeywords(customText), [customText]);
  const countryLangWeights = selectedCountry ? languagesFor(selectedCountry) : {};
  const activeLangs = useMemo(() => [...langs], [langs]);
  const activeCats = useMemo(() => [...cats], [cats]);

  // Recalcule la sélection recommandée (sauf si l'utilisateur a modifié la
  // sélection à la main : on respecte alors ses choix).
  function suggest(country, l, c, custom = customTitles, n = wanted) {
    const rec = recommend(country, { langs: [...l], cats: [...c], limit: n });
    setSelectedTitles(new Set([...rec, ...custom]));
  }

  function pickCountry(id) {
    const l = new Set(Object.keys(languagesFor(id)));
    setSelectedCountry(id);
    setLangs(l);
    setEdited(false);
    suggest(id, l, cats);
  }

  function toggleLang(code) {
    const next = new Set(langs);
    if (next.has(code)) { if (next.size > 1) next.delete(code); } else next.add(code);
    setLangs(next);
    if (!edited && selectedCountry) suggest(selectedCountry, next, cats);
  }

  function changeWanted(n) {
    setWanted(n);
    if (!edited && selectedCountry) suggest(selectedCountry, langs, cats, customTitles, n);
  }

  function toggleCat(id) {
    const next = new Set(cats);
    if (next.has(id)) { if (next.size > 1) next.delete(id); } else next.add(id);
    setCats(next);
    if (!edited && selectedCountry) suggest(selectedCountry, langs, next);
  }

  function resetSuggestions() {
    setEdited(false);
    if (selectedCountry) suggest(selectedCountry, langs, cats);
  }

  function toggleTitle(title) {
    setEdited(true);
    setSelectedTitles((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  }

  function addCustomTitle() {
    const t = newTitle.trim();
    if (!t) return;
    setCustomTitles((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setSelectedTitles((prev) => new Set(prev).add(t));
    setNewTitle("");
  }

  function removeCustomTitle(t) {
    setCustomTitles((prev) => prev.filter((x) => x !== t));
    setSelectedTitles((prev) => { const n = new Set(prev); n.delete(t); return n; });
  }

  // Cartes "concept" : un rôle, ses variantes dans les langues actives.
  const concepts = useMemo(() => {
    if (!selectedCountry) return [];
    const f = titleFilter.trim().toLowerCase();
    const weights = languagesFor(selectedCountry);
    const score = (role) => role.w * Math.max(...activeLangs.map((l) => weights[l] ?? 0.4), 0.4);
    return ROLES
      .filter((r) => cats.has(r.cat))
      .map((role) => ({ role, variants: variantsOf(role, selectedCountry, activeLangs) }))
      .map((c) => ({ ...c, variants: f ? c.variants.filter((v) => v.title.toLowerCase().includes(f)) : c.variants }))
      .filter((c) => c.variants.length > 0)
      .sort((a, b) => score(b.role) - score(a.role));
  }, [selectedCountry, activeLangs, cats, titleFilter]);

  const keywordCount = mode === "country" ? selectedTitles.size : mode === "custom" ? customKeywords.length : 0;
  // Nombre de postes disponibles pour ce pays / ces langues / ces orientations.
  const maxAvail = useMemo(
    () => (selectedCountry ? recommend(selectedCountry, { langs: activeLangs, cats: activeCats, limit: 999 }).length : 0),
    [selectedCountry, activeLangs, activeCats]
  );
  const sliderMax = Math.max(4, maxAvail);
  const estRequests = keywordCount * SITES.length;

  const canLaunch =
    phase !== "running" &&
    !(mode === "country" && (!selectedCountry || selectedTitles.size === 0)) &&
    !(mode === "custom" && customKeywords.length === 0);

  function buildParams() {
    let keywords = null;
    let location = null;
    let jobicyGeo = null;
    let countryIndeed = null;
    if (mode === "custom" && customKeywords.length > 0) {
      keywords = customKeywords;
    } else if (mode === "country" && selectedCountry) {
      keywords = selectedTitles.size > 0 ? [...selectedTitles] : null;
      if (preset) {
        location = preset.location;
        jobicyGeo = preset.jobicyGeo;
        countryIndeed = preset.countryIndeed;
      }
    }
    // Tous les sites sont toujours interrogés : plus de choix de sources.
    return { keywords, sourceIds: null, location, jobicyGeo, countryIndeed };
  }

  function launch() {
    launchSearch(buildParams());
  }

  // Enregistre la configuration courante : elle sera relancée par « Actualiser »
  // (page Offres) et par la planification (page Alertes).
  async function schedule() {
    const p = buildParams();
    const label = mode === "country" && preset
      ? `${preset.label} · ${p.keywords ? p.keywords.length : 0} postes`
      : mode === "custom" ? `Mots-clés · ${p.keywords ? p.keywords.length : 0}` : "Recherche par défaut";
    try {
      await addSearch(
        { keywords: p.keywords, source_ids: p.sourceIds, location: p.location, jobicy_geo: p.jobicyGeo, country_indeed: p.countryIndeed },
        label
      );
      await reloadSearches();
      setScheduled(label);
    } catch {
      setScheduled("error");
    }
  }

  const sourceEntries = Object.entries(sourceStates);
  const runningCount = sourceEntries.filter(([, s]) => s.status === "running").length;
  const doneCount = sourceEntries.filter(([, s]) => s.status === "done").length;
  const errorCount = sourceEntries.filter(([, s]) => s.status === "error").length;
  const progressPct = sourceEntries.length
    ? Math.round(((doneCount + errorCount) / sourceEntries.length) * 100)
    : 0;
  const showProgress = (phase === "running" || phase === "done") && sourceEntries.length > 0;
  const activity = activityText(phase, sourceStates, summary);

  // Langues proposées : celles du pays d'abord (mises en avant), puis les autres.
  const langOrder = useMemo(() => {
    const own = Object.keys(countryLangWeights).sort((a, b) => countryLangWeights[b] - countryLangWeights[a]);
    return [...own, ...Object.keys(LANGS).filter((l) => !own.includes(l))];
  }, [countryLangWeights]);

  return (
    <div className="sx">
      <div className="sx-bar">
        <div className="sx-bar__summary">
          <span className={`status-dot status-dot--${phase}`} />
          <span className="sx-bar__phase">{PHASE_LABEL[phase]}</span>
          {phase !== "idle" && activity && (
            <span className="sx-activity">{activity}{phase === "running" && <span className="dots" aria-hidden="true"><i /><i /><i /></span>}</span>
          )}
          {mode === "country" && <span className="sx-chip">{preset ? preset.label : "aucun pays"}</span>}
          {mode !== "default" && (
            <span className="sx-chip">
              {keywordCount} poste{keywordCount > 1 ? "s" : ""}
              {estRequests > 0 ? ` · ≈ ${estRequests} requêtes` : ""}
            </span>
          )}
          <span className="sx-chip">{SITES.length} sites</span>
        </div>
        <div className="sx-bar__actions">
          <button type="button" className="sx-schedule" onClick={schedule} disabled={!canLaunch && phase !== "running"} title="Garder cette recherche : « Actualiser » la relance en un clic et l'app la met à jour automatiquement">
            ＋ Enregistrer
          </button>
          <button className="sx-launch" onClick={launch} disabled={!canLaunch}>
            {phase === "running" ? "Recherche en cours…" : "Lancer la recherche"}
          </button>
        </div>
      </div>

      {globalError && <div className="search-panel__error">{globalError}</div>}
      {scheduled && (
        <div className={`sx-scheduled ${scheduled === "error" ? "sx-scheduled--error" : ""}`}>
          {scheduled === "error"
            ? "Impossible d'enregistrer : le serveur local répond-il ?"
            : <>Recherche enregistrée (« {scheduled} »). Utilise « Actualiser » sur la page <Link to="/jobs">Offres</Link>, ou planifie la mise à jour automatique dans <Link to="/alerts">Alertes</Link>.</>}
        </div>
      )}

      <div className="sx-grid">
        {/* 1 · Où */}
        <section className="sx-card sx-card--where">
          <h2 className="sx-card__title">1 · Où chercher</h2>
          <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} ariaLabel="Type de recherche" />
          <p className="sx-note">{MODE_HINT[mode]}</p>

          {mode === "country" && (
            <div className="ctiles">
              {COUNTRY_PRESETS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`ctile ${selectedCountry === c.id ? "ctile--on" : ""}`}
                  aria-pressed={selectedCountry === c.id}
                  onClick={() => pickCountry(c.id)}
                >
                  <span className="ctile__code">{CODES[c.id] || c.label.slice(0, 2).toUpperCase()}</span>
                  <span className="ctile__name">{c.label}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 2 · Quoi */}
        <section className="sx-card sx-card--titles">
          <h2 className="sx-card__title">
            2 · {mode === "custom" ? "Mots-clés" : "Postes"}
            {mode === "country" && <span className="sx-card__count">{selectedTitles.size}</span>}
          </h2>

          {mode === "default" && <p className="sx-empty">Rien à choisir ici en mode « Par défaut ».</p>}

          {mode === "custom" && (
            <>
              <textarea
                className="sx-textarea"
                rows={5}
                placeholder={"Un par ligne ou séparés par des virgules\nex. Data Engineer, Computer Vision, Développeur Python"}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
              />
              <div className="sx-tags">
                {customKeywords.map((k, i) => <span key={`${k}-${i}`} className="sx-tag">{k}</span>)}
              </div>
            </>
          )}

          {mode === "country" && !selectedCountry && (
            <p className="sx-empty">Choisis un pays : les postes seront adaptés à sa langue.</p>
          )}

          {mode === "country" && selectedCountry && (
            <>
              <div className="ro-block">
                <span className="ro-label">Langues détectées (selon le pays)</span>
                <div className="ro-auto">
                  {[...langs].map((code) => (
                    <span key={code} className="ro-auto__lang">{LANGS[code].short} · {LANGS[code].label}</span>
                  ))}
                  <button type="button" className="sx-mini" onClick={() => setShowLangs((v) => !v)}>
                    {showLangs ? "Masquer" : "Modifier"}
                  </button>
                </div>
                {showLangs && (
                  <div className="ro-langs">
                    {langOrder.map((code) => {
                      const own = countryLangWeights[code] !== undefined;
                      const on = langs.has(code);
                      return (
                        <button
                          key={code}
                          type="button"
                          className={`ro-lang ${on ? "ro-lang--on" : ""} ${own ? "ro-lang--own" : ""}`}
                          aria-pressed={on}
                          title={own ? `${LANGS[code].label} — langue des offres de ce pays` : LANGS[code].label}
                          onClick={() => toggleLang(code)}
                        >
                          <span className="ro-lang__code">{LANGS[code].short}</span>
                          <span className="ro-lang__name">{LANGS[code].label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="ro-block">
                <span className="ro-label">Nombre de postes souhaité <strong className="ro-count">{wanted}</strong></span>
                <input
                  type="range"
                  className="ro-range"
                  min={4}
                  max={sliderMax}
                  step={1}
                  value={Math.min(wanted, sliderMax)}
                  onChange={(e) => changeWanted(Number(e.target.value))}
                  aria-label="Nombre de postes souhaité"
                />
                <div className="ro-range__scale"><span>4</span><span>{maxAvail} disponibles</span></div>
              </div>

              <div className="ro-block">
                <span className="ro-label">Orientation</span>
                <div className="ro-cats">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`ro-cat ${cats.has(c.id) ? "ro-cat--on" : ""}`}
                      aria-pressed={cats.has(c.id)}
                      onClick={() => toggleCat(c.id)}
                    >
                      <strong>{c.label}</strong>
                      <span>{c.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="sx-tools">
                <input
                  className="sx-input"
                  type="search"
                  placeholder="Filtrer les postes…"
                  value={titleFilter}
                  onChange={(e) => setTitleFilter(e.target.value)}
                />
                <button type="button" className="sx-mini sx-mini--accent" onClick={resetSuggestions} title="Revenir à la sélection recommandée">
                  ✦ Suggestions
                </button>
                <button type="button" className="sx-mini" onClick={() => { setEdited(true); setSelectedTitles(new Set()); }}>Vider</button>
              </div>

              <form className="sx-add" onSubmit={(e) => { e.preventDefault(); addCustomTitle(); }}>
                <input
                  className="sx-input"
                  type="text"
                  placeholder="Ajouter un poste (ex. SRE, Ingénieur QA…)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
                <button type="submit" className="sx-mini sx-mini--accent" disabled={!newTitle.trim()}>Ajouter</button>
              </form>

              {customTitles.length > 0 && (
                <div className="sx-chips">
                  {customTitles.map((t) => (
                    <span key={t} className="sx-titlechip-wrap">
                      <button type="button" className={`sx-titlechip ${selectedTitles.has(t) ? "sx-titlechip--on" : ""}`} aria-pressed={selectedTitles.has(t)} onClick={() => toggleTitle(t)}>{t}</button>
                      <button type="button" className="sx-titlechip__remove" aria-label={`Supprimer ${t}`} onClick={() => removeCustomTitle(t)}>×</button>
                    </span>
                  ))}
                </div>
              )}

              <p className="sx-note">
                {selectedTitles.size} poste{selectedTitles.size > 1 ? "s" : ""} sélectionné{selectedTitles.size > 1 ? "s" : ""} · ≈ {estRequests} requêtes
                {estRequests > 150 ? " — la recherche sera plus longue, mais aucune limite n'est appliquée." : "."}
              </p>

              <div className="ro-concepts">
                {concepts.map(({ role, variants }) => (
                  <div key={role.id} className="ro-concept">
                    <div className="ro-concept__variants">
                      {variants.map((v) => (
                        <button
                          key={v.title}
                          type="button"
                          className={`ro-var ${selectedTitles.has(v.title) ? "ro-var--on" : ""}`}
                          aria-pressed={selectedTitles.has(v.title)}
                          onClick={() => toggleTitle(v.title)}
                        >
                          <span>{v.title}</span>
                          {v.langs.map((l) => <LangTag key={l} code={LANGS[l].short} active={selectedTitles.has(v.title)} />)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {concepts.length === 0 && <p className="sx-empty">Aucun poste ne correspond au filtre.</p>}
              </div>
            </>
          )}
        </section>

        {/* 3 · Sources + progression */}
        <div className="sx-col">
          <section className="sx-card sx-card--sites">
            <h2 className="sx-card__title">3 · Sites interrogés <span className="sx-card__count">{SITES.length}</span></h2>
            <p className="sx-note">Tout est cherché automatiquement. Chaque offre garde son site d'origine.</p>
            <div className="sitechips">
              {SITES.map((n) => <span key={n} className="sitechip">{n}</span>)}
            </div>
          </section>

          <section className="sx-card sx-card--saved">
            <h2 className="sx-card__title">
              Mes recherches
              <span className="sx-card__count">{savedSearches.length}</span>
            </h2>
            {savedSearches.length === 0 ? (
              <p className="sx-empty">Clique sur « Enregistrer » pour garder une recherche : l'app la relancera pour mettre le stock à jour.</p>
            ) : (
              <>
                <ul className="saved-list">
                  {savedSearches.map((x) => (
                    <li key={x.id} className="saved-item">
                      <div className="saved-item__main">
                        <strong>{x.label}</strong>
                        <span>
                          {x.last_run ? `${x.last_total ?? 0} offres · ${x.last_new ?? 0} nouvelles` : "jamais lancée"}
                          {x.last_error ? " · erreur" : ""}
                        </span>
                      </div>
                      <button type="button" className="sx-mini" disabled={refresh.running} onClick={() => refreshAll([x.id])}>Lancer</button>
                      <button type="button" className="sx-mini" aria-label={`Supprimer ${x.label}`} onClick={() => removeSearch(x.id)}>×</button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="sx-mini sx-mini--accent" disabled={refresh.running} onClick={() => refreshAll()}>
                  ↻ Tout actualiser
                </button>
              </>
            )}
          </section>

          {(showProgress || summary) && (
            <section className="sx-card sx-card--progress">
              <h2 className="sx-card__title">Progression</h2>
              {showProgress && (
                <>
                  <div className="search-progress__bar-track">
                    <div className="search-progress__bar-fill" style={{ width: `${progressPct}%` }} />
                  </div>
                  <p className="sx-activity sx-activity--block">
                    {activity}{phase === "running" && <span className="dots" aria-hidden="true"><i /><i /><i /></span>}
                  </p>
                  {errorCount > 0 && <p className="sx-note">Certains sites n'ont pas répondu : ils seront réessayés à la prochaine actualisation.</p>}
                </>
              )}
              {summary && (
                <div className="search-panel__summary">
                  {summary.total} offres trouvées ({summary.totalRaw} avant déduplication)
                  {summary.added !== undefined && <> · <strong>{summary.added} nouvelle{summary.added > 1 ? "s" : ""}</strong></>}
                  {summary.stock !== undefined && <> · {summary.stock} en stock</>}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}