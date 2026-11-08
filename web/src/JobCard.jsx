import { formatAge, daysAgo } from "./utils";
import CompanyMark from "./CompanyMark";
import { STATUS_LABEL, scoreLevel, LEVEL_LABEL } from "./trackingMeta";

function freshnessClass(age) {
  if (age === null) return "unknown";
  if (age <= 7) return "fresh";
  if (age <= 30) return "recent";
  if (age <= 90) return "aging";
  return "stale";
}

export default function JobCard({ job, selected, onClick, isNew }) {
  const age = daysAgo(job.posted_date);
  const freshness = freshnessClass(age);
  const nSources = (job.sources || []).length;

  return (
    <button
      className={`job-card job-card--${freshness} ${selected ? "job-card--selected" : ""} ${isNew ? "job-card--enter" : ""}`}
      onClick={onClick}
    >
      <span className="job-card__rail" />
      <CompanyMark company={job.company} logoUrl={job.logo_url} size="sm" />
      <span className="job-card__content">
        <span className="job-card__top">
          <span className="job-card__title">{job.title}</span>
          <span className="job-card__age">
            {scoreLevel(job.score) && (
              <span className={`score score--${scoreLevel(job.score)}`} title="Pertinence selon ton profil">{job.score}</span>
            )}
            {formatAge(job.posted_date)}
          </span>
        </span>
        <span className="job-card__company">{job.company}</span>
        <span className="job-card__meta">
          <span className="badge">{job.source}</span>
          {nSources > 1 && <span className="badge badge--muted" title={(job.sources || []).join(", ")}>+{nSources - 1} source{nSources > 2 ? "s" : ""}</span>}
          {job.is_new && <span className="newchip">Nouveau</span>}
          {job.status && <span className={`trkchip trkchip--${job.status}`}>{STATUS_LABEL[job.status]}</span>}
          {job.level && <span className="badge badge--muted">{LEVEL_LABEL[job.level]}</span>}
          {job.location && <span className="job-card__location">{job.location}</span>}
        </span>
      </span>
    </button>
  );
}