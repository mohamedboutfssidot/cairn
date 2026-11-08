import { LEVELS, LANGN, compat } from "../meta.js";
import { Cp, Seg } from "../ui.jsx";

const k = (n) => `${Math.round(n / 1000)}k`;
const COLORS = { 4: "var(--good, #2f7d5b)", 3: "#6aa37f", 2: "#d9a441", 1: "#c9654e", 0: "var(--line2)" };
const NAMES = { 4: "Excellente", 3: "Bonne", 2: "Moyenne", 1: "Faible", 0: "Non évaluée" };

export function DistBar({ dist, n }) {
  const title = [4, 3, 2, 1, 0].filter((i) => dist[i]).map((i) => `${NAMES[i]} : ${dist[i]}`).join(" · ");
  return (
    <div role="img" aria-label={title || "Aucune offre"} title={title} style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: "var(--sunk)" }}>
      {[4, 3, 2, 1, 0].map((i) => (dist[i] ? <span key={i} style={{ width: `${(dist[i] / n) * 100}%`, background: COLORS[i] }} /> : null))}
    </div>
  );
}

function GroupCard({ g, onOpen }) {
  const s = g.stats;
  const good = s.dist[4] + s.dist[3];
  return (
    <button type="button" className="gcard" onClick={() => onOpen(g.id)} disabled={!s.n} aria-label={`${g.label}, ${s.n} offres`}>
      <div className="gh"><b>{g.label}</b><span className="gn">{s.n.toLocaleString("fr-FR")}</span></div>
      {g.variants && g.variants.length > 1 && <div className="small muted">aussi : {g.variants.filter((v) => v !== g.label).join(", ")}</div>}
      {g.hint && <div className="small muted">{g.hint}</div>}
      {s.n ? (
        <>
          <div className="gtags">
            {s.fresh > 0 && <span className="new">{s.fresh} nouvelle{s.fresh > 1 ? "s" : ""}</span>}
            {s.remote > 0 && <span>{s.remote} remote</span>}
            {s.tracked > 0 && <span>{s.tracked} suivie{s.tracked > 1 ? "s" : ""}</span>}
          </div>
          <DistBar dist={s.dist} n={s.n} />
          <div className="small">{good ? <><b>{good}</b> bonne{good > 1 ? "s" : ""} ou excellente{good > 1 ? "s" : ""} compatibilité{good > 1 ? "s" : ""}</> : s.avg != null ? "Aucune offre très compatible" : "Compatibilité non évaluée"}{s.avg != null && <span className="muted"> · moyenne {s.avg}/100</span>}</div>
          <dl className="gfacts">
            {s.salary && <div><dt>Salaire</dt><dd>{k(s.salary.lo) === k(s.salary.hi) ? k(s.salary.lo) : `${k(s.salary.lo)} à ${k(s.salary.hi)}`} $ <span className="muted">(médiane {k(s.salary.median)}, {s.salary.n} annonce{s.salary.n > 1 ? "s" : ""})</span></dd></div>}
            {s.levels.length > 0 && <div><dt>Niveau</dt><dd>{s.levels.map((l) => `${LEVELS[l.k] || l.k} (${l.c})`).join(", ")}</dd></div>}
            {s.langs.length > 0 && <div><dt>Langue</dt><dd>{s.langs.map((l) => `${LANGN[l.k] || l.k} (${l.c})`).join(", ")}</dd></div>}
          </dl>
          {s.best && <div className="gbest"><span className="small muted">Meilleure offre</span><div className="t">{s.best.title}</div><div className="small muted">{s.best.company || "Entreprise non indiquée"}</div><Cp score={s.best.score} /></div>}
        </>
      ) : <div className="small muted">Aucune offre trouvée pour l’instant.</div>}
    </button>
  );
}

export default function ByPost({ groups, mode, setMode, onOpen, hasPostes }) {
  const total = groups.reduce((n, g) => n + g.stats.n, 0);
  return (
    <section aria-label="Offres par poste">
      <div className="row" style={{ marginBottom: 12 }}>
        <Seg label="Regrouper par" options={[["poste", "Postes recherchés", null], ["famille", "Familles", null]]} value={mode} onChange={setMode} />
        <span className="small muted">{total.toLocaleString("fr-FR")} offres réparties en {groups.filter((g) => g.stats.n).length} groupe{groups.filter((g) => g.stats.n).length > 1 ? "s" : ""}</span>
      </div>
      {mode === "poste" && !hasPostes && <div className="notice">Aucun poste recherché pour l’instant. Ajoute-en dans <a href="#/profil?tab=search">ton profil</a> ou lance une recherche : les offres sont alors classées sous chaque poste.</div>}
      <div className="ggrid">{groups.map((g) => <GroupCard key={g.id} g={g} onOpen={onOpen} />)}</div>
    </section>
  );
}