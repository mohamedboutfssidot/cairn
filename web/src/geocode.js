// Position d'une offre sur la carte, sans service externe : on retrouve la ville dans une liste
// intégrée (public/cities/<PAYS>.json, villes de 1 000 habitants et plus, chargées par pays à la demande). Précision : la ville.
import { COUNTRIES, countryKey } from "./meta.js";

const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
const ISO_BY_ID = Object.fromEntries(COUNTRIES.filter((c) => c.iso).map((c) => [c.id, c.iso]));
export const isoOf = (name) => ISO_BY_ID[countryKey(name)] || "";

const BASE = () => `${import.meta.env?.BASE_URL ?? "/"}cities/`;
const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : []));

function addRows(db, iso, rows) {
  const m = db.byIso.get(iso) || new Map();
  for (const r of rows) {                         // triées par population décroissante : la plus grande ville gagne
    const [name, lat, lon, pop, alts, adm] = r;
    const place = { name, lat, lon, pop, iso };
    for (const n of [name, ...(Array.isArray(alts) ? alts : [])]) {
      const k = fold(n);
      if (!m.has(k)) m.set(k, place);
      if (adm) { const ks = `${k}|${String(adm).toLowerCase()}`; if (!m.has(ks)) m.set(ks, place); }
    }
  }
  db.byIso.set(iso, m);
}
function addTop(db, rows) {                        // grandes villes du monde : pays inconnu dans l'annonce
  for (const [name, lat, lon, pop, alts, iso] of rows) {
    const place = { name, lat, lon, pop, iso };
    for (const n of [name, ...(Array.isArray(alts) ? alts : [])]) {
      const k = fold(n), g = db.global.get(k);
      if (!g || g.pop < pop) db.global.set(k, place);
    }
  }
}

let promise = null;
/** Charge la table mondiale ; les villes de chaque pays se chargent à la demande avec db.ensure(["FR", "MA"]). */
export function loadCities() {
  if (!promise) {
    promise = getJson(`${BASE()}_top.json`).then((top) => {
      const db = { byIso: new Map(), global: new Map(), pending: new Map() };
      addTop(db, top);
      db.ensure = (isos) => Promise.all([...new Set(isos)].filter(Boolean).map((iso) => {
        if (!db.pending.has(iso)) db.pending.set(iso, getJson(`${BASE()}${iso}.json`).catch(() => []).then((rows) => addRows(db, iso, rows)));
        return db.pending.get(iso);
      }));
      return db;
    }).catch((e) => { promise = null; throw e; });
  }
  return promise;
}

function rawParts(j) { return [j.city, ...String(j.location || "").split(/[,;|/]| - | – /)].map((x) => String(x || "").trim()).filter(Boolean); }
function isoFor(j, raw = rawParts(j)) {
  let iso = isoOf(j.country);
  if (!iso) for (const p of raw) { const i = isoOf(p); if (i) { iso = i; break; } }
  return iso;
}
/** Codes pays dont il faut charger les villes pour placer ces offres. */
export const isosFor = (jobs) => [...new Set(jobs.map((j) => isoFor(j)).filter(Boolean))];
/** Charge les villes du pays d'une offre (ou de toutes les offres) avant de les placer. */
export const ensureFor = (db, jobs) => db.ensure(isosFor(Array.isArray(jobs) ? jobs : [jobs]));

const NOISE = /\b(greater|area|metropolitan|metro|region|province|prefecture|state of|city of|ville de|grand|teletravail|remote|hybrid|hybride|on-?site|sur site|district|county|comte|department|office|bureau)\b/g;
const SKIP = /^(remote|worldwide|anywhere|global|europe|emea|apac|latam|home|home office|n\/a|unknown|multiple locations)$/;
const clean = (s) => fold(s).replace(/\([^)]*\)/g, " ").replace(NOISE, " ").replace(/\b\d+\w*\b/g, " ").replace(/[^\p{L} \-]/gu, " ").replace(/\s+/g, " ").trim();

/** -> { lat, lon, place, precision: "exact" | "city" } ou null (remote, lieu inconnu ou non reconnu). */
export function locate(j, db) {
  if (j.lat != null && j.lon != null && Number.isFinite(+j.lat) && Number.isFinite(+j.lon)) return { lat: +j.lat, lon: +j.lon, place: j.city || "", precision: "exact" };
  const raw = rawParts(j);
  const iso = isoFor(j, raw);
  const state = (raw.map((p) => p.match(/^[A-Z]{2}$/)).find(Boolean) || [""])[0].toLowerCase();   // « Austin, TX »
  const table = iso ? db.byIso.get(iso) : null;
  const seen = new Set();
  for (const p of raw) {
    if (isoOf(p) && fold(p) !== fold(j.city)) continue;       // c'est le nom du pays, pas d'une ville
    const c = clean(p);
    if (!c || c.length < 3 || SKIP.test(c) || seen.has(c)) continue;
    seen.add(c);
    const words = c.split(/[ -]/);
    for (let n = Math.min(words.length, 3); n >= 1; n--) {       // « casablanca settat » -> « casablanca »
      const k = words.slice(0, n).join(" ");
      let hit = null;
      if (table) hit = (state && table.get(`${k}|${state}`)) || table.get(k);
      else if (k.length >= 4) hit = db.global.get(k);              // pays inconnu : la plus grande ville de ce nom
      if (hit) return { lat: hit.lat, lon: hit.lon, place: hit.name, precision: "city" };
    }
  }
  return null;
}


// ───────── Recherche en ligne (Open-Meteo, gratuit, sans clé) pour les lieux absents de la liste intégrée ─────────
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const CACHE_KEY = "cairn-geo-v1", MAX_CACHE = 6000, MAX_CALLS = 400;      // plafond par session : on reste très loin des limites du service
let cache = null, calls = 0, running = 0;
const waiting = [], inflight = new Map();
function cacheGet() {
  if (!cache) { try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { cache = {}; } }
  return cache;
}
function cachePut(k, v) {
  const c = cacheGet(); c[k] = v;
  const keys = Object.keys(c);
  if (keys.length > MAX_CACHE) for (const x of keys.slice(0, keys.length - MAX_CACHE)) delete c[x];
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* stockage plein ou bloqué : on continue sans */ }
}
function slot() {                                    // 3 requêtes en parallèle au maximum
  return new Promise((ok) => { const go = () => { running++; ok(); }; running < 3 ? go() : waiting.push(go); });
}
function release() { running--; const n = waiting.shift(); if (n) n(); }

/** Noms de lieux à interroger pour une offre (ville d'abord), sans le pays ni les mots parasites. */
export function placeQueries(j) {
  const out = [], seen = new Set();
  for (const p of rawParts(j)) {
    if (isoOf(p) && fold(p) !== fold(j.city)) continue;
    const q = String(p).replace(/\([^)]*\)/g, " ").replace(/\b\d+\w*\b/g, " ").replace(NOISE_RAW, " ").replace(/[^\p{L} '\-]/gu, " ").replace(/\s+/g, " ").trim();
    const f = fold(q);
    if (q.length < 3 || SKIP.test(f) || STREET.test(f) || seen.has(f)) continue;
    seen.add(f); out.push(q);
  }
  return out.slice(0, 2);
}
const STREET = /\b(zone|industrielle?|industrial|parc|park|technopole|technopark|quartier|rue|avenue|boulevard|street|road|building|batiment|immeuble|campus|siege|headquarters)\b/;
const NOISE_RAW = /\b(greater|area|metropolitan|metro|region|province|prefecture|state of|city of|ville de|teletravail|télétravail|remote|hybrid|hybride|on-?site|sur site|district|county|department)\b/gi;

async function ask(q, iso) {
  const k = `${iso}|${fold(q)}`, c = cacheGet();
  if (k in c) return c[k] || null;
  if (inflight.has(k)) return inflight.get(k);
  if (calls >= MAX_CALLS) return null;
  const run = (async () => {
    await slot();
    try {
      calls++;
      const url = `${GEO_URL}?name=${encodeURIComponent(q)}&count=5&language=fr&format=json${iso ? `&countryCode=${iso}` : ""}`;
      const r = await fetch(url);
      if (!r.ok) return null;                         // erreur réseau ou quota : on ne mémorise pas, on réessaiera plus tard
      const d = await r.json();
      const hit = (d.results || []).find((x) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude));
      const v = hit ? { lat: +hit.latitude.toFixed(4), lon: +hit.longitude.toFixed(4), name: hit.name } : 0;
      cachePut(k, v);
      return v || null;
    } catch { return null; } finally { release(); inflight.delete(k); }
  })();
  inflight.set(k, run);
  return run;
}

/** Cherche en ligne un lieu que la liste intégrée ne connaît pas. -> { lat, lon, place, precision: "city" } ou null. Le résultat est gardé en mémoire dans le navigateur. */
export async function locateOnline(j) {
  if (j.remote && !j.city && !j.location) return null;
  const iso = isoFor(j);
  for (const q of placeQueries(j)) {
    const r = await ask(q, iso);
    if (r) return { lat: r.lat, lon: r.lon, place: r.name, precision: "city" };
  }
  return null;
}