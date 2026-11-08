import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchTracking, saveTracking, deleteTracking } from "../api";
import { useJobs } from "../JobsContext";
import { STATUSES, followUpState } from "../trackingMeta";
import CompanyMark from "../CompanyMark";

function TrackCard({ item, onMove, onNote, onFollow, onDelete }) {
  const [note, setNote] = useState(item.note || "");
  const idx = STATUSES.findIndex((s) => s.id === item.status);
  const fu = followUpState(item.follow_up);
  const job = item.job || {};

  return (
    <div className="tcard">
      <div className="tcard__top">
        <CompanyMark company={job.company || "?"} logoUrl={job.logo_url} size="sm" />
        <div className="tcard__id">
          <a className="tcard__title" href={item.url} target="_blank" rel="noreferrer">{job.title || item.url}</a>
          <span className="tcard__company">{job.company}{job.location ? ` · ${job.location}` : ""}</span>
        </div>
        <button type="button" className="tcard__del" aria-label="Retirer du suivi" onClick={() => onDelete(item)}>×</button>
      </div>
      <textarea
        className="tcard__note"
        rows={2}
        placeholder="Note…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (item.note || "") && onNote(item, note)}
      />
      <div className="tcard__foot">
        <label className={`tcard__follow tcard__follow--${fu || "none"}`}>
          <span>{fu === "late" ? "Relance en retard" : fu === "today" ? "Relance aujourd'hui" : "Relance"}</span>
          <input type="date" value={item.follow_up || ""} onChange={(e) => onFollow(item, e.target.value)} />
        </label>
        <div className="tcard__move">
          <button type="button" disabled={idx <= 0} onClick={() => onMove(item, STATUSES[idx - 1].id)} aria-label="Étape précédente">‹</button>
          <button type="button" disabled={idx >= STATUSES.length - 1} onClick={() => onMove(item, STATUSES[idx + 1].id)} aria-label="Étape suivante">›</button>
        </div>
      </div>
    </div>
  );
}

export default function TrackerPage() {
  const { jobs } = useJobs();
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    fetchTracking()
      .then((d) => { setItems(d.items); setError(null); })
      .catch((e) => setError(e.message || "Le serveur local ne répond pas."))
      .finally(() => setLoaded(true));
  }, []);
  // `jobs` change quand un suivi est modifié depuis la page Offres.
  useEffect(() => { reload(); }, [reload, jobs]);

  const patch = async (item, body) => {
    try {
      const saved = await saveTracking({ url: item.url, ...body });
      setItems((prev) => prev.map((x) => (x.url === item.url ? saved : x)));
    } catch (e) { setError(e.message); }
  };
  const remove = async (item) => {
    setItems((prev) => prev.filter((x) => x.url !== item.url));
    try { await deleteTracking(item.url); } catch (e) { setError(e.message); reload(); }
  };

  const byStatus = useMemo(() => {
    const m = Object.fromEntries(STATUSES.map((s) => [s.id, []]));
    for (const it of items) (m[it.status] || m.saved).push(it);
    return m;
  }, [items]);

  const due = items.filter((i) => ["late", "today"].includes(followUpState(i.follow_up)) && !["offer", "rejected"].includes(i.status));

  return (
    <div className="page page--tracker">
      <header className="page__header">
        <div>
          <h1>Suivi des candidatures</h1>
          <p className="page__subtitle">
            {items.length === 0
              ? "Ouvre une offre dans « Offres » et choisis un statut pour la suivre ici."
              : due.length > 0
                ? `${due.length} relance${due.length > 1 ? "s" : ""} à faire`
                : "Aucune relance en retard"}
          </p>
        </div>
        <div className="page__count">{items.length} suivie{items.length > 1 ? "s" : ""}</div>
      </header>

      {error && <div className="page__error">{error}</div>}

      {loaded && items.length === 0 && !error && (
        <div className="tracker-empty">
          <strong>Rien à suivre pour l'instant.</strong>
          <span>Dans le détail d'une offre, le bloc « Suivi » te permet de la marquer À voir, Postulé, Entretien…</span>
        </div>
      )}

      {items.length > 0 && (
        <div className="kanban">
          {STATUSES.map((s) => (
            <section key={s.id} className={`kcol kcol--${s.id}`}>
              <h2 className="kcol__title">
                <span>{s.label}</span>
                <span className="kcol__count">{byStatus[s.id].length}</span>
              </h2>
              <div className="kcol__list">
                {byStatus[s.id].map((it) => (
                  <TrackCard
                    key={it.url}
                    item={it}
                    onMove={(i, status) => patch(i, { status })}
                    onNote={(i, note) => patch(i, { note })}
                    onFollow={(i, d) => patch(i, d ? { follow_up: d } : { clear_follow_up: true })}
                    onDelete={remove}
                  />
                ))}
                {byStatus[s.id].length === 0 && <div className="kcol__empty">—</div>}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}