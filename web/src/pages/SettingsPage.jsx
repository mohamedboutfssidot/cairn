import { useEffect, useState } from "react";
import { useJobs } from "../JobsContext";
import { fetchAvailableSources } from "../api";

export default function SettingsPage() {
  const { sources } = useJobs();
  const [allSources, setAllSources] = useState([]);

  useEffect(() => {
    fetchAvailableSources().then((d) => setAllSources(d.sources)).catch(() => {});
  }, []);

  const resultCountFor = (id) => sources.find((s) => s.source === id)?.count ?? 0;

  return (
    <div className="page page--settings">
      <header className="page__header">
        <div>
          <h1>Sources</h1>
          <p className="page__subtitle">Toutes les sources que le scan interroge, et ce qu'elles ont rapporté lors de la dernière recherche</p>
        </div>
      </header>

      <div className="settings-grid">
        {allSources.map((s) => (
          <div key={s.id} className="settings-card">
            <div className="settings-card__id">{s.id}</div>
            <div className="settings-card__label">{s.label}</div>
            <div className="settings-card__count">{resultCountFor(s.id)} offre{resultCountFor(s.id) === 1 ? "" : "s"}</div>
          </div>
        ))}
        {allSources.length === 0 && (
          <div className="job-list__empty">Impossible de charger la liste des sources — vérifie que server.py tourne.</div>
        )}
      </div>
    </div>
  );
}
