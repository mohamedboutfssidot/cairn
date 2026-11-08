# -*- coding: utf-8 -*-
"""
Stock permanent d'offres (SQLite, dans tracking.db).

Avant : chaque recherche effaçait jobs_discovered.json puis le réécrivait.
Maintenant : chaque recherche FUSIONNE ses résultats dans ce stock.
    - une offre déjà connue est mise à jour (last_seen, champs manquants) ;
    - une offre vue sur plusieurs sources (LinkedIn + Indeed...) n'existe qu'une
      fois : on garde le lien principal (stable, c'est la clé du suivi) et on
      range les autres liens/sources dans `alt_urls` / `sources` ;
    - une offre non revue depuis STALE_DAYS disparaît de la liste (sauf si elle
      est suivie) ; au-delà de PURGE_DAYS elle est supprimée.
Les champs structurés (niveau, langues, visa, salaire) sont calculés une fois,
à l'enregistrement (voir extract.py).
"""
import hashlib
import json
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path

import extract
import tracking
from geo import guess_country, guess_city

STALE_DAYS = 30     # non revue depuis N jours -> masquée (sauf suivie)
PURGE_DAYS = 90     # non revue depuis N jours -> supprimée (sauf suivie)

VERSION = 0         # incrémenté à chaque écriture : invalide les caches du serveur

# Champs calculés à la lecture ou propres à l'interface : jamais stockés.
_VOLATILE = {"score", "score_reason", "reasons", "country", "city", "status", "note",
             "follow_up", "is_new", "first_seen", "last_seen", "key"}


def _bump():
    global VERSION
    VERSION += 1


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _conn():
    conn = tracking._connect()
    conn.execute("""CREATE TABLE IF NOT EXISTS jobs (
        key TEXT PRIMARY KEY, fkey TEXT, data TEXT NOT NULL,
        first_seen TEXT NOT NULL, last_seen TEXT NOT NULL)""")
    conn.execute("CREATE INDEX IF NOT EXISTS jobs_fkey ON jobs(fkey)")
    conn.execute("CREATE TABLE IF NOT EXISTS urls (url TEXT PRIMARY KEY, key TEXT NOT NULL)")
    conn.execute("CREATE INDEX IF NOT EXISTS urls_key ON urls(key)")
    return conn


# --------------------------------------------------------------- clé floue ---

_LEGAL = re.compile(r"\b(inc|incorporated|ltd|limited|llc|gmbh|sarl|sas|sa|corp|corporation|co|plc|ag|bv|srl|spa|pty)\b")
_GENDER = re.compile(r"\(?\b(m\s*/\s*[fwd](\s*/\s*[dxm])?|[fh]\s*/\s*[hfm](\s*/\s*[dx])?|w\s*/\s*m(\s*/\s*d)?)\b\)?")


def _ascii(text):
    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()


def norm_title(title):
    t = _ascii(title)
    t = re.sub(r"[\(\[][^\)\]]*[\)\]]", " ", t)       # (Remote), [Paris]...
    t = _GENDER.sub(" ", t)
    t = re.sub(r"[^a-z0-9+#.]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def norm_company(company):
    c = _ascii(company)
    c = _LEGAL.sub(" ", c)
    return re.sub(r"[^a-z0-9]+", "", c)


def fuzzy_key(job):
    """Clé "même offre, autre source" : entreprise + intitulé + lieu (pays/ville ou remote).
    None si l'entreprise ou le titre manquent (on ne devine pas)."""
    company_raw = job.get("company") or ""
    if company_raw.startswith("(slug:"):
        return None
    c, t = norm_company(company_raw), norm_title(job.get("title"))
    if len(c) < 2 or len(t) < 3:
        return None
    loc = job.get("location")
    if job.get("remote") is True:
        bucket = "remote"
    else:
        bucket = (_ascii(guess_city(loc) or "") or _ascii(guess_country(loc) or "")).strip()
    return hashlib.sha1(f"{c}|{t}|{bucket}".encode()).hexdigest()


# -------------------------------------------------------------- fusion ---

def _clean(job):
    return {k: v for k, v in job.items() if k not in _VOLATILE}


def _longer(a, b):
    return b if len(b or "") > len(a or "") * 1.2 else a


def _merge(data, job):
    """Fusionne une nouvelle observation `job` dans l'offre stockée `data`."""
    changed_text = False
    src, url = job.get("source"), job.get("url")
    sources = data.setdefault("sources", [data.get("source")])
    if src and src not in sources:
        sources.append(src)
    alt = data.setdefault("alt_urls", [])
    if url and url != data.get("url") and not any(a["url"] == url for a in alt):
        alt.append({"url": url, "source": src})
    desc = _longer(data.get("description"), job.get("description"))
    if desc != data.get("description"):
        data["description"] = desc
        changed_text = True
    for f in ("logo_url", "posted_date", "location", "salary_min", "salary_max", "salary_currency"):
        if not data.get(f) and job.get(f):
            data[f] = job[f]
    if data.get("remote") is None and job.get("remote") is not None:
        data["remote"] = job["remote"]
    tags = list(dict.fromkeys((data.get("tags") or []) + (job.get("tags") or [])))
    data["tags"] = tags
    if changed_text:
        data.update(extract.extract(data))
    return data


def _is_baseline(conn):
    row = conn.execute("SELECT value FROM kv WHERE key = 'store_baseline_done'").fetchone()
    return row is None


def finish_run():
    """À appeler à la fin d'une recherche : la référence initiale est figée, les
    offres qui arriveront ensuite compteront comme « nouvelles »."""
    with tracking._lock, _conn() as conn:
        conn.execute("INSERT OR REPLACE INTO kv (key, value) VALUES ('store_baseline_done', '\"1\"')")


def upsert_many(jobs):
    """Enregistre/fusionne des offres (dicts). -> (urls_nouvelles, nb_fusionnées).
    Tant qu'aucune recherche n'est terminée, tout est « référence » (pas nouveau)."""
    now = _now()
    new_urls, merged = set(), 0
    jobs = [j for j in jobs if j.get("url") or fuzzy_key(j)]
    if not jobs:
        return new_urls, merged
    with tracking._lock, _conn() as conn:
        baseline = _is_baseline(conn)
        urls = [j["url"] for j in jobs if j.get("url")]
        url_key = {}
        for i in range(0, len(urls), 500):
            chunk = urls[i:i + 500]
            q = ",".join("?" * len(chunk))
            url_key.update(conn.execute(f"SELECT url, key FROM urls WHERE url IN ({q})", chunk).fetchall())
        fkeys = {j_i: fuzzy_key(j) for j_i, j in enumerate(jobs)}
        wanted = list({fk for fk in fkeys.values() if fk})
        fkey_key = {}
        for i in range(0, len(wanted), 500):
            chunk = wanted[i:i + 500]
            q = ",".join("?" * len(chunk))
            fkey_key.update(conn.execute(f"SELECT fkey, key FROM jobs WHERE fkey IN ({q})", chunk).fetchall())

        cache = {}   # key -> data modifiée dans ce lot (plusieurs observations de la même offre)

        def load(key):
            if key not in cache:
                row = conn.execute("SELECT data FROM jobs WHERE key = ?", (key,)).fetchone()
                cache[key] = json.loads(row["data"])
            return cache[key]

        touched, inserted = set(), {}
        for idx, job in enumerate(jobs):
            job = _clean(job)
            url, fk = job.get("url"), fkeys[idx]
            key = url_key.get(url) or (fkey_key.get(fk) if fk else None)
            if key:
                if key in inserted:
                    data = inserted[key]
                else:
                    data = load(key)
                before = (len(data.get("sources", [])), len(data.get("alt_urls", [])))
                _merge(data, job)
                if (len(data["sources"]), len(data["alt_urls"])) != before:
                    merged += 1
                if url and url not in url_key:
                    url_key[url] = key
                    conn.execute("INSERT OR IGNORE INTO urls (url, key) VALUES (?, ?)", (url, key))
                touched.add(key)
                continue
            key = hashlib.sha1((url or fk).encode()).hexdigest()
            data = dict(job)
            data.update(extract.extract(data))
            data["sources"] = [job.get("source")]
            data["alt_urls"] = []
            inserted[key] = data
            if url:
                url_key[url] = key
                conn.execute("INSERT OR IGNORE INTO urls (url, key) VALUES (?, ?)", (url, key))
            if fk:
                fkey_key[fk] = key
            if not baseline and url:
                new_urls.add(url)

        for key, data in inserted.items():
            conn.execute(
                "INSERT INTO jobs (key, fkey, data, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)",
                (key, fuzzy_key(data), json.dumps(data, ensure_ascii=False),
                 "baseline" if baseline else now, now),
            )
        for key in touched - set(inserted):
            conn.execute("UPDATE jobs SET data = ?, last_seen = ? WHERE key = ?",
                         (json.dumps(cache[key], ensure_ascii=False), now, key))
    _bump()
    return new_urls, merged


# ---------------------------------------------------------------- lecture ---

def all_jobs(protect_urls=(), stale_days=STALE_DAYS):
    """Offres actives (vues récemment, ou suivies) avec first_seen / last_seen."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=stale_days)).isoformat(timespec="seconds")
    protect = set(protect_urls)
    with tracking._lock, _conn() as conn:
        rows = conn.execute("SELECT data, first_seen, last_seen FROM jobs").fetchall()
    out = []
    for r in rows:
        data = json.loads(r["data"])
        if r["last_seen"] < cutoff and not (
            data.get("url") in protect or any(a["url"] in protect for a in data.get("alt_urls", []))
        ):
            continue
        data["first_seen"], data["last_seen"] = r["first_seen"], r["last_seen"]
        out.append(data)
    return out


def get_job(url):
    """Une offre complète (avec description) par n'importe lequel de ses liens."""
    with tracking._lock, _conn() as conn:
        row = conn.execute("SELECT key FROM urls WHERE url = ?", (url,)).fetchone()
        if not row:
            return None
        r = conn.execute("SELECT data, first_seen, last_seen FROM jobs WHERE key = ?", (row["key"],)).fetchone()
    if not r:
        return None
    data = json.loads(r["data"])
    data["first_seen"], data["last_seen"] = r["first_seen"], r["last_seen"]
    return data


def stats():
    with tracking._lock, _conn() as conn:
        total = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
        last = conn.execute("SELECT MAX(last_seen) FROM jobs").fetchone()[0]
    return {"total": total, "last_update": last}


def purge(protect_urls=(), days=PURGE_DAYS):
    """Supprime les offres non revues depuis `days` jours (hors suivies). -> nb supprimées."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")
    protect = set(protect_urls)
    removed = 0
    with tracking._lock, _conn() as conn:
        rows = conn.execute("SELECT key, data FROM jobs WHERE last_seen < ?", (cutoff,)).fetchall()
        for r in rows:
            data = json.loads(r["data"])
            if data.get("url") in protect or any(a["url"] in protect for a in data.get("alt_urls", [])):
                continue
            conn.execute("DELETE FROM jobs WHERE key = ?", (r["key"],))
            conn.execute("DELETE FROM urls WHERE key = ?", (r["key"],))
            removed += 1
    if removed:
        _bump()
    return removed


def clear(protect_urls=()):
    """Vide le stock SAUF les offres suivies (`protect_urls` : à voir, postulé, entretien,
    offre, refusé). Sans `protect_urls`, vide tout. -> nombre d'offres supprimées.
    La « référence » est remise à zéro : les offres de la recherche suivante ne comptent
    pas comme nouvelles."""
    protect = set(protect_urls)
    removed = 0
    with tracking._lock, _conn() as conn:
        for r in conn.execute("SELECT key, data FROM jobs").fetchall():
            if protect:
                data = json.loads(r["data"])
                if data.get("url") in protect or any(a["url"] in protect for a in data.get("alt_urls", [])):
                    continue
            conn.execute("DELETE FROM jobs WHERE key = ?", (r["key"],))
            conn.execute("DELETE FROM urls WHERE key = ?", (r["key"],))
            removed += 1
        conn.execute("DELETE FROM kv WHERE key = 'store_baseline_done'")
    _bump()
    return removed


def import_json(path):
    """Reprend un ancien jobs_discovered.json si le stock est vide. -> nb importées."""
    path = Path(path)
    if not path.exists() or stats()["total"] > 0:
        return 0
    try:
        with open(path, encoding="utf-8") as f:
            jobs = json.load(f, parse_constant=lambda _: None)
    except (OSError, ValueError):
        return 0
    upsert_many(jobs)
    finish_run()
    return len(jobs)


def export_files(json_path, csv_path, protect_urls=()):
    """Copie du stock actif en JSON/CSV (compatibilité avec les anciens scripts)."""
    import pandas as pd
    records = all_jobs(protect_urls)
    for r in records:
        r.pop("alt_urls", None)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    flat = [{k: (", ".join(map(str, v)) if isinstance(v, list) else v) for k, v in r.items()} for r in records]
    pd.DataFrame(flat).to_csv(csv_path, index=False)


def is_baseline():
    """True tant que la première recherche n'est pas terminée (les offres ne sont pas « nouvelles »)."""
    with _conn() as conn:
        return _is_baseline(conn)