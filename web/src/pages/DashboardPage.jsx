import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchDashboard } from "../api";
import { useJobs } from "../JobsContext";
import { STATUSES, STATUS_LABEL, scoreLevel } from "../trackingMeta";
import { formatAge } from "../utils";
import { activityText } from "../progressText";

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function daysLate(date, today) {
  const d = Math.round((new Date(today) - new Date(date)) / 86400000);
  return d <= 0 ? "aujourd'hui" : `en retard de ${d} j`;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { refresh, refreshAll, savedSearches, isSearching, searchPhase, sourceStates, searchSummary, meta, resetFilters, setQ } = useJobs();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const refreshing = Boolean(refresh.running);

  // Rechargé à l'ouverture, puis quand une actualisation ou une recherche se termine.
  useEffect(() => {
    let alive = true;
    fetchDashboard()
      .then((x) => { if (alive) { setD(x); setError(null); } })
      .catch((e) => alive && setError(e.message || "Le serveur local ne répond pas."));
    return () => { alive = false; };
  }, [refreshing, isSearching, meta?.last_updated]);

  async function onRefresh() {
    setActionError(null);
    try { await refreshAll(); } catch (e) { setActionError(e.message); }
  }
  function openJob(j) { resetFilters(); setQ(j.title); navigate("/jobs"); }

  if (!d) {
    return (
      <div className="page page--dash">
        <header className="page__header"><h1>Accueil</h1></header>
        {error ? <div className="page__error">{error}</div> : <div className="job-list__loading">Chargement…</div>}
      </div>
    );
  }

  const busy = refreshing || isSearching;
  const empty = d.stock.total === 0;
  const errors = d.searches.filter((s) => s.last_error);
  const due = d.followups.due;
  const upcoming = d.followups.upcoming;
  const maxPipe = Math.max(1, ...Object.values(d.pipeline));

  return (
    <div className="page page--dash">
      <header className="page__header">
        <div>
          <h1>Accueil</h1>
          <p className="page__subtitle">
            {busy
              ? (isSearching ? activityText(searchPhase, sourceStates, searchSummary) : `Actualisation ${refresh.index || 0}/${refresh.total || "?"}${refresh.label ? ` · ${refresh.label}` : ""}`)
              : empty ? "Aucune offre pour l'instant" : `Dernière mise à jour : ${formatDate(d.last_updated)}`}
          </p>
        </div>
        <div className="page__header-right">
          <button type="button" className={`refresh-btn ${refreshing ? "refresh-btn--busy" : ""}`} onClick={onRefresh}
            disabled={busy || savedSearches.length === 0}
            title={savedSearches.length === 0 ? "Enregistre d'abord une recherche" : "Relancer toutes tes recherches enregistrées"}>
            <span className="refresh-btn__icon" aria-hidden="true">↻</span>{refreshing ? "Actualisation…" : "Actualiser"}
          </button>
          <Link to="/search" className="sx-mini sx-mini--accent dash-link">Nouvelle recherche</Link>
        </div>
      </header>

      {actionError && <div className="page__error">{actionError}</div>}

      {empty ? (
        <section className="sx-card dash-welcome">
          <h2 className="sx-card__title">Bienvenue</h2>
          <ol className="dash-steps">
            <li><strong>Recherche</strong> : choisis un pays et des postes, puis lance la recherche.</li>
            <li><strong>Enregistrer</strong> : garde-la pour qu'elle se mette à jour sans que tu refasses les choix.</li>
            <li><strong>Actualiser</strong> : un clic (ou automatique via Alertes) et seules les nouveautés s'ajoutent.</li>
          </ol>
          <Link to="/search" className="sx-launch dash-cta">Lancer ma première recherche</Link>
        </section>
      ) : (
        <div className="dash-grid">
          <section className="sx-card dash-kpis">
            <div className="kpi"><strong>{d.new.count}</strong><span>nouvelles offres</span></div>
            <div className="kpi"><strong>{due.length}</strong><span>relance{due.length > 1 ? "s" : ""} à faire</span></div>
            <div className="kpi"><strong>{d.applications}</strong><span>candidature{d.applications > 1 ? "s" : ""} suivie{d.applications > 1 ? "s" : ""}</span></div>
            <div className="kpi"><strong>{d.stock.visible}</strong><span>offres en stock</span></div>
          </section>

          <section className="sx-card dash-new">
            <h2 className="sx-card__title">Nouveautés <span className="sx-card__count">{d.new.count}</span></h2>
            {d.new.jobs.length === 0 ? (
              <p className="sx-empty">Rien de nouveau depuis {d.new.hours} h. Actualise pour vérifier.</p>
            ) : (
              <ul className="dash-list">
                {d.new.jobs.map((j) => (
                  <li key={j.url}>
                    <button type="button" className="dash-item" onClick={() => openJob(j)}>
                      {scoreLevel(j.score) && <span className={`score score--${scoreLevel(j.score)}`}>{j.score}</span>}
                      <span className="dash-item__main"><strong>{j.title}</strong><span>{j.company}{j.location ? ` · ${j.location}` : ""}</span></span>
                      <span className="dash-item__age">{formatAge(j.posted_date)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/jobs" className="dash-more">Voir toutes les offres →</Link>
          </section>

          <section className="sx-card dash-follow">
            <h2 className="sx-card__title">Relances <span className="sx-card__count">{due.length}</span></h2>
            {due.length === 0 && upcoming.length === 0 && <p className="sx-empty">Aucune relance prévue. Ajoute une date dans la fiche d'une offre suivie.</p>}
            <ul className="dash-list">
              {due.map((a) => (
                <li key={a.url}><Link to="/tracking" className="dash-item dash-item--late">
                  <span className="dash-item__main"><strong>{a.title || a.url}</strong><span>{a.company} · {STATUS_LABEL[a.status]}</span></span>
                  <span className="dash-item__age">{daysLate(a.follow_up, d.today)}</span>
                </Link></li>
              ))}
              {upcoming.map((a) => (
                <li key={a.url}><Link to="/tracking" className="dash-item">
                  <span className="dash-item__main"><strong>{a.title || a.url}</strong><span>{a.company} · {STATUS_LABEL[a.status]}</span></span>
                  <span className="dash-item__age">le {new Date(a.follow_up).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>
                </Link></li>
              ))}
            </ul>
          </section>

          <section className="sx-card dash-pipe">
            <h2 className="sx-card__title">Candidatures</h2>
            {d.applications === 0 ? <p className="sx-empty">Aucune candidature suivie pour l'instant.</p> : (
              <div className="pipe">
                {STATUSES.map((s) => (
                  <div key={s.id} className="pipe__row">
                    <span>{s.label}</span>
                    <div className="pipe__bar"><i style={{ width: `${(d.pipeline[s.id] || 0) / maxPipe * 100}%` }} /></div>
                    <b>{d.pipeline[s.id] || 0}</b>
                  </div>
                ))}
              </div>
            )}
            {!d.has_profile && <Link to="/profile" className="profile-nudge"><strong>Score de pertinence</strong><span>Renseigne ton profil pour classer les nouveautés →</span></Link>}
          </section>

          <section className="sx-card dash-stock">
            <h2 className="sx-card__title">Stock</h2>
            <dl className="alertstats">
              <div><dt>Offres visibles</dt><dd>{d.stock.visible}</dd></div>
              <div><dt>Masquées</dt><dd>{d.stock.hidden}</dd></div>
              <div><dt>Recherches enregistrées</dt><dd>{d.searches.length}</dd></div>
              <div><dt>Mise à jour</dt><dd>{formatDate(d.last_updated)}</dd></div>
            </dl>
            <div className="dash-sources">
              {d.stock.sources.map((s) => <span key={s.source} className="badge badge--muted">{s.source} · {s.count}</span>)}
            </div>
            {errors.length > 0 && (
              <div className="dash-errors">
                {errors.map((e) => <p key={e.id}><strong>{e.label}</strong> : {e.last_error}</p>)}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}