// Phrases d'activité affichées pendant une recherche : l'utilisateur voit que l'app
// travaille, et sur quels sites, sans avoir à lire une liste technique.
const BY_ID = (id) => {
  if (id === "remoteok") return "Téléchargement des offres de RemoteOK…";
  if (id === "remotive") return "Téléchargement des offres de Remotive…";
  if (id === "wwr") return "Lecture de We Work Remotely…";
  if (id === "himalayas") return "Téléchargement des offres de Himalayas…";
  if (id.startsWith("jobicy")) return "Interrogation de Jobicy…";
  if (id.startsWith("jobspy")) return "Interrogation de LinkedIn, Indeed, Glassdoor, ZipRecruiter…";
  if (id === "ats") return "Lecture des pages carrières (Greenhouse, Lever, Ashby…)";
  if (id.startsWith("hf")) return "Analyse des offres récentes publiées sur Greenhouse, Lever, Ashby…";
  return "Recherche en cours…";
};

export function activityText(phase, sourceStates, summary) {
  if (phase === "done") {
    return summary && summary.added !== undefined
      ? `Terminée · ${summary.added} nouvelle${summary.added > 1 ? "s" : ""} offre${summary.added > 1 ? "s" : ""}`
      : "Terminée";
  }
  if (phase === "error") return "Recherche interrompue";
  if (phase !== "running") return "";
  const entries = Object.entries(sourceStates || {});
  if (entries.length === 0) return "Préparation de la recherche…";
  const running = [...new Set(entries.filter(([, s]) => s.status === "running").map(([id]) => BY_ID(id)))];
  if (running.length === 0) return "Fusion des doublons et enregistrement dans le stock…";
  return running.slice(0, 2).join("  ·  ");
}