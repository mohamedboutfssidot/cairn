import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { compat } from "../meta.js";
import { Disc } from "../ui.jsx";
import { loadCities, locate, locateOnline, isosFor } from "../geocode.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LEGEND = [[4, "Excellente"], [3, "Bonne"], [2, "Moyenne"], [1, "Faible"], [0, "Non évaluée"]];
const pin = (n, sel) => L.divIcon({ className: "mkw", html: `<span class="mk c${n}${sel ? " sel" : ""}"></span>`, iconSize: [22, 22], iconAnchor: [11, 11] });
const bubble = (count, best) => L.divIcon({ className: "mkw", html: `<span class="mc c${best}"><b>${count > 999 ? "1k+" : count}</b></span>`, iconSize: [40, 40] });

export default function MapView({ jobs, selected, onSelect, dark, fitKey, focus }) {
  const lastFocus = useRef(0), box = useRef(null), map = useRef(null), group = useRef(null), marks = useRef(new Map()), prevSel = useRef(null), lastFit = useRef(null);
  const onSel = useRef(onSelect); onSel.current = onSelect;
  const [db, setDb] = useState(null), [err, setErr] = useState(false);

  useEffect(() => { let off = false; loadCities().then((d) => !off && setDb(d)).catch(() => !off && setErr(true)); return () => { off = true; }; }, []);

  const isoKey = useMemo(() => isosFor(jobs).sort().join(","), [jobs]);
  const [ready, setReady] = useState("");          // pays dont les villes sont chargées
  useEffect(() => {
    if (!db) return undefined;
    let off = false;
    db.ensure(isoKey ? isoKey.split(",") : []).then(() => !off && setReady(isoKey));
    return () => { off = true; };
  }, [db, isoKey]);

  const base = useMemo(() => {
    if (!db || ready !== isoKey) return { pts: [], miss: [] };
    const pts = [], miss = [];
    jobs.forEach((j) => { const p = locate(j, db); (p ? pts : miss).push(p ? { j, p } : j); });
    return { pts, miss };
  }, [jobs, db, ready, isoKey]);

  // lieux absents de la liste intégrée : recherche en ligne (résultats gardés dans le navigateur)
  const [extra, setExtra] = useState({}), [searching, setSearching] = useState(false);
  useEffect(() => {
    const todo = base.miss.filter((j) => !(j.url in extra));
    if (!todo.length) { setSearching(false); return undefined; }
    let off = false, done = 0;
    setSearching(true);
    (async () => {
      let buf = {};
      const flush = () => { if (off || !Object.keys(buf).length) return; const b = buf; buf = {}; setExtra((e) => ({ ...e, ...b })); };
      const worker = async (list) => { for (const j of list) { if (off) return; const p = await locateOnline(j); if (p) buf[j.url] = p; if (++done % 8 === 0) flush(); } };
      const lanes = [[], [], []]; todo.forEach((j, i) => lanes[i % 3].push(j));
      await Promise.all(lanes.map(worker));
      flush(); if (!off) setSearching(false);
    })();
    return () => { off = true; };
  }, [base.miss]);
  const { points, missing } = useMemo(() => {
    const pts = [...base.pts], miss = [];
    base.miss.forEach((j) => (extra[j.url] ? pts.push({ j, p: extra[j.url] }) : miss.push(j)));
    return { points: pts, missing: miss };
  }, [base, extra]);

  // création de la carte (une seule fois)
  useEffect(() => {
    const m = L.map(box.current, { worldCopyJump: true, minZoom: 2, zoomControl: true }).setView([30, 10], 2);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">OpenStreetMap</a>" }).addTo(m);
    const g = L.markerClusterGroup({
      chunkedLoading: true, showCoverageOnHover: false, spiderfyOnMaxZoom: true, maxClusterRadius: 48,
      iconCreateFunction: (c) => bubble(c.getChildCount(), Math.max(...c.getAllChildMarkers().map((x) => x.options.n))),
    });
    m.addLayer(g);
    map.current = m; group.current = g;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(box.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; group.current = null; marks.current = new Map(); };
  }, []);

  // points : on n'ajoute que les nouveaux et on retire ceux qui ne sont plus affichés
  useEffect(() => {
    const g = group.current; if (!g) return;
    const want = new Map(points.map((x) => [x.j.url, x]));
    const gone = [];
    marks.current.forEach((mk, url) => { if (!want.has(url)) { gone.push(mk); marks.current.delete(url); } });
    if (gone.length) g.removeLayers(gone);
    const add = [];
    want.forEach(({ j, p }, url) => {
      if (marks.current.has(url)) return;
      const n = compat(j.score).n;
      const mk = L.marker([p.lat, p.lon], { icon: pin(n, false), n, title: `${j.title} · ${j.company || ""}`, riseOnHover: true });
      mk.bindTooltip(`<b>${esc(j.title)}</b><br>${esc(j.company || "Entreprise non indiquée")} · ${esc(p.place)}<br>${esc(compat(j.score).label)}${j.score != null ? ` (${j.score}/100)` : ""}`, { direction: "top", offset: [0, -10] });
      mk.on("click", () => onSel.current(j));
      marks.current.set(url, mk); add.push(mk);
    });
    if (add.length) g.addLayers(add);
    const sig = String(fitKey);
    if (points.length && (lastFit.current === null || lastFit.current !== sig)) {
      lastFit.current = sig;
      const b = g.getBounds();
      if (b.isValid()) map.current.fitBounds(b, { padding: [40, 40], maxZoom: 11 });
    }
  }, [points, fitKey]);

  // « Voir sur la carte » depuis une fiche : on zoome sur l'offre
  useEffect(() => {
    if (!focus || focus.t === lastFocus.current || !group.current) return;
    const mk = marks.current.get(focus.url);
    if (!mk) return;
    lastFocus.current = focus.t;
    group.current.zoomToShowLayer(mk, () => { map.current.setView(mk.getLatLng(), Math.max(map.current.getZoom(), 12), { animate: false }); mk.openTooltip(); });
  }, [focus, points]);

  // offre sélectionnée mise en évidence
  useEffect(() => {
    const was = prevSel.current && marks.current.get(prevSel.current);
    if (was) was.setIcon(pin(was.options.n, false));
    const now = selected && marks.current.get(selected);
    if (now) { now.setIcon(pin(now.options.n, true)); now.setZIndexOffset(1000); }
    prevSel.current = now ? selected : null;
  }, [selected, points]);

  const all = () => { const b = group.current?.getBounds(); if (b?.isValid()) map.current.fitBounds(b, { padding: [40, 40], maxZoom: 11 }); };
  const places = useMemo(() => new Set(points.map((x) => `${x.p.lat},${x.p.lon}`)).size, [points]);

  return (
    <div className="mapcol">
      <div className={`mapbox${dark ? " dark" : ""}`}>
        <div ref={box} className="mapel" role="region" aria-label="Carte des offres" />
        {(!db || ready !== isoKey) && !err && <div className="mapmsg" role="status">Chargement de la carte…</div>}
        {err && <div className="mapmsg" role="alert">La liste des villes n’a pas pu être chargée (fichier cities.json manquant). Recharge la page.</div>}
        <div className="maptools">
          <button type="button" className="btn sm" onClick={all} disabled={!points.length}>Tout voir</button>
        </div>
        <div className="maplegend" aria-label="Légende : compatibilité">
          {LEGEND.map(([n, l]) => <span key={n}><i className={`mk c${n}`} />{l}</span>)}
        </div>
      </div>
      <p className="small muted" style={{ margin: "8px 2px 0" }}>
        {db && ready === isoKey ? <><b>{points.length.toLocaleString("fr-FR")}</b> offre{points.length > 1 ? "s" : ""} placée{points.length > 1 ? "s" : ""} sur {places.toLocaleString("fr-FR")} ville{places > 1 ? "s" : ""}. La position est celle de la ville, pas de l’adresse. Clique sur une bulle pour zoomer, sur un point pour ouvrir l’offre.{searching && " Recherche des lieux restants…"}</> : "…"}
      </p>
      {missing.length > 0 && (
        <Disc label={`${missing.length.toLocaleString("fr-FR")} offre${missing.length > 1 ? "s" : ""} sans position (télétravail ou lieu non reconnu)`}>
          <div className="joblist">{missing.slice(0, 100).map((j) => (
            <button key={j.url} type="button" className="job" onClick={() => onSelect(j)}>
              <div className="t">{j.title}</div><div className="c">{j.company} · {j.city || j.location || (j.remote ? "Télétravail" : "Lieu non indiqué")}</div>
            </button>))}
            {missing.length > 100 && <p className="small muted">Les 100 premières sont affichées. Utilise les autres vues pour voir la liste complète.</p>}
          </div>
        </Disc>)}
    </div>
  );
}