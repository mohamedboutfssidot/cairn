import { useEffect, useMemo, useState } from "react";
import { useJobs } from "../JobsContext";
import { classifyJob } from "../jobFamily";
import FamilyView from "../FamilyView";
import JobCard from "../JobCard";
import JobDetail from "../JobDetail";

export default function FamilyPage() {
  const { displayedJobs } = useJobs();
  const [activeFamily, setActiveFamily] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const familyFiltered = useMemo(() => {
    if (!activeFamily) return displayedJobs;
    return displayedJobs.filter((j) => classifyJob(j).familyKey === activeFamily);
  }, [displayedJobs, activeFamily]);

  useEffect(() => {
    if (familyFiltered.length > 0) {
      setSelected((prev) => familyFiltered.find((j) => prev && j.url === prev.url) || familyFiltered[0]);
    } else {
      setSelected(null);
    }
  }, [familyFiltered]);

  return (
    <div className="page page--family">
      <header className="page__header">
        <div>
          <h1>Par poste</h1>
          <p className="page__subtitle">Offres regroupées par intitulé normalisé</p>
        </div>
        <div className="page__count">
          {familyFiltered.length} offre{familyFiltered.length === 1 ? "" : "s"}
        </div>
      </header>

      <div className="family-body">
        <FamilyView jobs={displayedJobs} activeFamily={activeFamily} onSelectFamily={(k) => { setActiveFamily(k); setDetailOpen(false); }} />

        <div className={`family-body__results ${detailOpen ? "family-body__results--detail" : ""}`}>
          <div className="job-list">
            {familyFiltered.length === 0 && (
              <div className="job-list__empty">Aucune offre dans cette famille.</div>
            )}
            {familyFiltered.map((job, i) => (
              <JobCard
                key={job.url || i}
                job={job}
                selected={selected && selected.url === job.url}
                onClick={() => { setSelected(job); setDetailOpen(true); }}
              />
            ))}
          </div>

          <JobDetail job={selected} onBack={() => setDetailOpen(false)} />
        </div>
      </div>
    </div>
  );
}