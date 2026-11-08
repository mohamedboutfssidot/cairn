import { useEffect, useState } from "react";
import { stripHtml, formatAge } from "./utils";
import CompanyMark from "./CompanyMark";
import { useJobs } from "./JobsContext";
import { STATUSES, scoreLevel, LEVEL_LABEL, LANG_LABEL, formatSalary } from "./trackingMeta";
import { fetchJob } from "./api";
import KitModal from "./KitModal";

// Suivi de la candidature : statut en un clic, note, date de relance.
// Le composant est recréé à chaque changement d'offre (key=url) pour que la
// note affichée soit toujours celle de l'offre courante.
function TrackingPanel({ job }) {
  const { track, untrack } = useJobs();
  const [note, setNote] = useState(job.note || "");
  const [busy, setBusy] = useState(false);

  async function run(fn) {
    setBusy(true);
    try { await fn(); } catch { /* le serveur local peut être arrêté : on ignore */ }
    setBusy(false);
  }

  return (
    <div className="trk">
      <div className="trk__head">
        <span className="trk__title">Suivi</span>
        {job.status && (
          <button type="button" className="trk__remove" disabled={busy} onClick={() => run(() => untrack(job))}>
            Retirer du suivi
          </button>
        )}
      </div>
      <div className="trk__statuses" role="radiogroup" aria-label="Statut de la candidature">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={job.status === s.id}
            disabled={busy}
            className={`trk__status trk__status--${s.id} ${job.status === s.id ? "trk__status--on" : ""}`}
            onClick={() => run(() => track(job, { status: s.id }))}
          >
            {s.label}
          </button>
        ))}
      </div>
      {job.status && (
        <div className="trk__fields">
          <textarea
            className="trk__note"
            rows={3}
            placeholder="Note : contact, salaire évoqué, prochaine étape…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (job.note || "") && run(() => track(job, { note }))}
          />
          <label className="trk__follow">
            Relance le
            <input
              type="date"
              value={job.follow_up || ""}
              onChange={(e) => run(() => track(job, e.target.value ? { follow_up: e.target.value } : { clear_follow_up: true }))}
            />
          </label>
        </div>
      )}
    </div>
  );
}

// « Pas intéressé » : retire l'offre de la liste sans la suivre (rétablissable).
function HidePanel({ job }) {
  const { hide, unhide, showHidden } = useJobs();
  const [busy, setBusy] = useState(false);
  async function run(fn) {
    setBusy(true);
    try { await fn(); } catch { /* serveur arrêté : on ignore */ }
    setBusy(false);
  }
  if (job.status) return null;  // une offre suivie reste dans le suivi
  if (showHidden || job.hidden) {
    return (
      <div className="hidebar">
        <button type="button" className="hidebar__btn hidebar__btn--restore" disabled={busy} onClick={() => run(() => unhide(job))}>
          ↺ Rétablir cette offre
        </button>
      </div>
    );
  }
  return (
    <div className="hidebar">
      <button type="button" className="hidebar__btn" disabled={busy} onClick={() => run(() => hide(job))}>
        ✕ Pas intéressé
      </button>
      {job.company && job.company !== "?" && (
        <button type="button" className="hidebar__btn" disabled={busy} onClick={() => run(() => hide(job, "company"))}>
          Masquer {job.company}
        </button>
      )}
    </div>
  );
}

export default function JobDetail({ job, onBack }) {
  // La liste ne contient que 300 caractères de description : on charge le texte complet.
  const [full, setFull] = useState({ url: null, text: null });
  const [kitFor, setKitFor] = useState(null);   // url de l'offre dont la fenêtre candidature est ouverte
  const url = job?.url;
  const needFull = Boolean(job) && (job.desc_len || 0) > (job.description || "").length;
  useEffect(() => {
    if (!needFull) return undefined;
    let alive = true;
    fetchJob(url).then((d) => alive && setFull({ url, text: d.description })).catch(() => {});
    return () => { alive = false; };
  }, [url, needFull]);

  if (!job) {
    return (
      <div className="job-detail job-detail--empty">
        Sélectionne une offre dans la liste pour voir le détail.
      </div>
    );
  }

  const description = stripHtml(full.url === job.url && full.text ? full.text : job.description);
  const salary =
    job.salary_min || job.salary_max
      ? `${job.salary_min ?? "?"} – ${job.salary_max ?? "?"} ${job.salary_currency ?? ""}`.trim()
      : null;
  const level = scoreLevel(job.score);
  const extracted = formatSalary(job.sal_usd_min, job.sal_usd_max);
  const others = (job.sources || []).filter((x) => x !== job.source);
  const altUrls = (job.alt_urls || []).filter((u) => u !== job.url);

  return (
    <div className="job-detail">
      {onBack && (
        <button type="button" className="job-detail__back" onClick={onBack}>
          ← Retour à la liste
        </button>
      )}
      <div className="job-detail__header">
        <CompanyMark key={job.url || job.title} company={job.company} logoUrl={job.logo_url} size="lg" />
        <div>
          <h2 className="job-detail__title">{job.title}</h2>
          <div className="job-detail__company">{job.company}</div>
        </div>
        {level && (
          <div className={`scorering score--${level}`} title="Pertinence selon ton profil" style={{ "--p": job.score }}>
            <span>{job.score}</span>
          </div>
        )}
      </div>

      {level && job.reasons && job.reasons.length > 0 && (
        <ul className="reasons">
          {job.reasons.map((r) => (
            <li key={r} className={r.startsWith("Manque") || r.startsWith("À éviter") ? "reasons__bad" : ""}>{r}</li>
          ))}
        </ul>
      )}

      <div className="job-detail__tags">
        <span className="badge">{job.source}</span>
        <span className="badge badge--muted">{formatAge(job.posted_date)}</span>
        {job.location && <span className="badge badge--muted">{job.location}</span>}
        {salary && <span className="badge badge--muted">{salary}</span>}
      </div>

      {(job.level || (job.langs || []).length > 0 || job.visa || (!salary && extracted)) && (
        <div className="job-detail__facts">
          {job.level && <span className="fact">Niveau · {LEVEL_LABEL[job.level] || job.level}</span>}
          {(job.langs || []).map((l) => <span key={l} className="fact">Langue · {LANG_LABEL[l] || l}</span>)}
          {job.visa === "yes" && <span className="fact fact--ok">Visa possible</span>}
          {job.visa === "no" && <span className="fact fact--bad">Pas de visa</span>}
          {!salary && extracted && <span className="fact">≈ {extracted}</span>}
        </div>
      )}

      {others.length > 0 && (
        <div className="job-detail__also">
          Aussi sur :{" "}
          {others.map((x, i) => (
            <span key={x} className="badge badge--muted">{x}{altUrls[i] ? <> <a href={altUrls[i]} target="_blank" rel="noreferrer">↗</a></> : null}</span>
          ))}
        </div>
      )}

      {job.tags && job.tags.length > 0 && (
        <div className="job-detail__pills">
          {job.tags.map((t, i) => (
            <span key={i} className="pill">{t}</span>
          ))}
        </div>
      )}

      <a className="job-detail__link" href={job.url} target="_blank" rel="noreferrer">
        Ouvrir l'offre originale ↗
      </a>

      <button type="button" className="kit-btn" onClick={() => setKitFor(job.url)}>
        ✎ Préparer ma candidature
        <span>lettre · CV adapté · e-mail</span>
      </button>
      {kitFor === job.url && <KitModal job={job} onClose={() => setKitFor(null)} />}

      <HidePanel key={`h-${job.url}`} job={job} />

      <TrackingPanel key={job.url} job={job} />

      <p className="job-detail__description">{description || "Pas de description disponible."}</p>
    </div>
  );
}