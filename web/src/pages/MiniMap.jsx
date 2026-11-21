import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { compat } from "../meta.js";
import { loadCities, locate, locateOnline, ensureFor } from "../geocode.js";

/** Petite carte de l'emplacement d'une offre, affichée dans sa fiche. */
export default function MiniMap({ job, dark }) {
  const box = useRef(null);
  const [st, setSt] = useState({ status: "load" });

  useEffect(() => {
    let off = false;
    setSt({ status: "load" });
    loadCities()
      .then((db) => ensureFor(db, job).then(() => db))
      .then(async (db) => { const p = locate(job, db) || (await locateOnline(job)); if (!off) setSt(p ? { status: "ok", p } : { status: "none" }); })
      .catch(() => !off && setSt({ status: "err" }));
    return () => { off = true; };
  }, [job.url]);

  useEffect(() => {
    if (st.status !== "ok") return undefined;
    const { p } = st;
    const m = L.map(box.current, { scrollWheelZoom: false }).setView([p.lat, p.lon], p.precision === "exact" ? 15 : 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">OpenStreetMap</a>" }).addTo(m);
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "mkw", html: `<span class="mk c${compat(job.score).n} sel"></span>`, iconSize: [22, 22], iconAnchor: [11, 11] }), keyboard: false }).addTo(m);
    return () => m.remove();
  }, [st]);

  if (st.status === "load") return <p className="small muted" role="status">Chargement de la carte…</p>;
  if (st.status === "err") return <p className="small muted" role="alert">La liste des villes n’a pas pu être chargée.</p>;
  if (st.status === "none") return <p className="small muted">Position non disponible : lieu non précisé, télétravail ou ville non reconnue.</p>;
  const { p } = st;
  return (
    <div>
      <div ref={box} className={`minimap${dark ? " dark" : ""}`} role="region" aria-label={`Carte : ${p.place}`} />
      <p className="small muted" style={{ marginTop: 6 }}>
        {p.precision === "exact" ? "Position exacte de l’offre." : <>Position de la ville de <b>{p.place}</b>, pas de l’adresse exacte.</>}{" "}
        <a href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=13/${p.lat}/${p.lon}`} target="_blank" rel="noreferrer noopener">Ouvrir dans OpenStreetMap ↗</a>
      </p>
    </div>
  );
}