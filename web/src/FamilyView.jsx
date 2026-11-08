import { groupByFamily } from "./jobFamily";

export default function FamilyView({ jobs, activeFamily, onSelectFamily }) {
  const groups = groupByFamily(jobs);
  const maxCount = groups[0]?.jobs.length || 1;

  return (
    <div className="family-view">
      <button
        className={`family-row ${!activeFamily ? "family-row--active" : ""}`}
        onClick={() => onSelectFamily(null)}
      >
        <span className="family-row__label">Toutes les offres</span>
        <span className="family-row__count">{jobs.length}</span>
      </button>

      {groups.map((g) => (
        <button
          key={g.key}
          className={`family-row ${activeFamily === g.key ? "family-row--active" : ""}`}
          onClick={() => onSelectFamily(g.key)}
        >
          <span className="family-row__label">{g.label}</span>
          <span className="family-row__bar-track">
            <span
              className="family-row__bar-fill"
              style={{ width: `${(g.jobs.length / maxCount) * 100}%` }}
            />
          </span>
          <span className="family-row__count">{g.jobs.length}</span>
        </button>
      ))}
    </div>
  );
}
