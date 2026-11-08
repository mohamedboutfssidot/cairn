import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../store.jsx";
import { STATUSES, fmtD, isDue, lateText } from "../meta.js";
import { CairnChart, Seg } from "../ui.jsx";

function nextStep(j) {
  const late = isDue(j);
  if (j.status === "saved") return ["À postuler", false];
  if (j.status === "applied") return j.follow_up ? (late ? [`Relance à faire (${lateText(j.follow_up)})`, true] : [`Relance prévue le ${fmtD(j.follow_up)}`, false]) : ["Aucune relance prévue", false];
  if (j.status === "interview") return [j.follow_up ? `Prochain contact le ${fmtD(j.follow_up)}` : "Prépare ton entretien", late];
  if (j.status === "offer") return ["À décider", false];
  return ["Terminé", false];
}

export default function ApplicationsPage() {
  const a = useApp();
  const nav = useNavigate();
  const [st, setSt] = useState("all");
  const { tracked, counts } = a;
  const list = tracked.filter((j) => st === "all" || j.status === st)
    .sort((x, y) => (isDue(x) ? 0 : 1) - (isDue(y) ? 0 : 1) || (x.follow_up || "9") .localeCompare(y.follow_up || "9"));
  const opts = [["all", "Toutes", tracked.length], ...STATUSES.map((s) => [s.id, s.label, counts[s.id]])];
  return (
    <div className="page">
      <div className="two">
        <div className="stack" style={{ gap: 22 }}>
          <header><h1>Candidatures</h1><p className="muted" style={{ marginTop: 6 }}>{tracked.length} offre{tracked.length > 1 ? "s" : ""} suivie{tracked.length > 1 ? "s" : ""}. Les relances à faire passent en premier.</p></header>
          <Seg label="Étape" options={opts} value={st} onChange={setSt} />
          {list.length ? (
            <div>{list.map((j) => {
              const n = nextStep(j);
              return (
                <div className="cline" key={j.url}>
                  <button type="button" className="main" onClick={() => nav("/offres?open=" + encodeURIComponent(j.url))}>
                    <strong>{j.title}</strong><span>{j.company}</span><span className={`nx${n[1] ? " late" : ""}`}>{n[0]}</span></button>
                  {n[1] && <button type="button" className="btn sm primary" onClick={() => a.setModal({ type: "kit", url: j.url, start: 3 })}>Relancer</button>}
                  <label className="sr" htmlFor={"mv-" + j.url}>Étape</label>
                  <select className="select" id={"mv-" + j.url} value={j.status} onChange={(e) => a.setStatus(j, e.target.value)}>
                    {STATUSES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
                </div>);
            })}</div>
          ) : (
            <div className="empty"><h3>{tracked.length ? "Rien à cette étape" : "Aucune candidature suivie"}</h3>
              <p>{tracked.length ? "Choisis une autre étape." : "Dans une offre, touche « Suivre cette offre » pour la retrouver ici."}</p>
              <button type="button" className="btn" onClick={() => nav("/offres")}>Parcourir les offres</button></div>)}
        </div>
        <aside className="aside"><div className="card"><h3 style={{ marginBottom: 12 }}>Ton cairn</h3><CairnChart counts={counts} /></div></aside>
      </div>
    </div>
  );
}