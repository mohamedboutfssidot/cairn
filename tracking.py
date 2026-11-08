# -*- coding: utf-8 -*-
"""
Suivi de candidatures + profil, stockés dans une petite base SQLite locale
(tracking.db, à côté de server.py). Indépendant de jobs_discovered.json :
ce fichier est effacé à chaque nouvelle recherche, alors que le suivi doit
survivre. Chaque candidature garde donc un "instantané" de l'offre (titre,
entreprise, lien...) et reste consultable même si l'offre a disparu des
résultats.

Que de la bibliothèque standard (sqlite3, json) : rien à installer.
"""
import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "tracking.db"

STATUSES = ["saved", "applied", "interview", "offer", "rejected"]

_lock = threading.Lock()
VERSION = 0   # incrémenté à chaque écriture (suivi / profil) : invalide les caches du serveur


def _bump():
    global VERSION
    VERSION += 1


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE IF NOT EXISTS applications (
            url TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT '',
            follow_up TEXT,
            job TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"""
    )
    conn.execute("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    return conn


# Champs de l'offre conservés dans l'instantané (le reste, comme la
# description HTML, alourdirait la base pour rien).
_SNAPSHOT_FIELDS = (
    "title", "company", "location", "source", "posted_date", "remote",
    "country", "city", "logo_url", "score",
)


def _row_to_dict(row):
    job = json.loads(row["job"] or "{}")
    return {
        "url": row["url"],
        "status": row["status"],
        "note": row["note"],
        "follow_up": row["follow_up"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "job": job,
    }


def list_applications():
    with _lock, _connect() as conn:
        rows = conn.execute("SELECT * FROM applications ORDER BY updated_at DESC").fetchall()
    return [_row_to_dict(r) for r in rows]


def status_map():
    """url -> {status, note, follow_up} pour enrichir rapidement la liste d'offres."""
    with _lock, _connect() as conn:
        rows = conn.execute("SELECT url, status, note, follow_up FROM applications").fetchall()
    return {r["url"]: {"status": r["status"], "note": r["note"], "follow_up": r["follow_up"]} for r in rows}


def upsert_application(url, status=None, note=None, follow_up=None, job=None, clear_follow_up=False):
    """Crée ou met à jour une candidature. Seuls les champs fournis changent."""
    if not url:
        raise ValueError("url manquante")
    if status is not None and status not in STATUSES:
        raise ValueError(f"statut inconnu : {status}")
    snap = {k: job.get(k) for k in _SNAPSHOT_FIELDS if job and k in job} if job else None
    now = _now()
    with _lock, _connect() as conn:
        row = conn.execute("SELECT * FROM applications WHERE url = ?", (url,)).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO applications (url, status, note, follow_up, job, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (url, status or "saved", note or "", follow_up, json.dumps(snap or {}, ensure_ascii=False), now, now),
            )
        else:
            new_follow = None if clear_follow_up else (follow_up if follow_up is not None else row["follow_up"])
            conn.execute(
                "UPDATE applications SET status = ?, note = ?, follow_up = ?, job = ?, updated_at = ? WHERE url = ?",
                (
                    status or row["status"],
                    note if note is not None else row["note"],
                    new_follow,
                    json.dumps(snap, ensure_ascii=False) if snap else row["job"],
                    now,
                    url,
                ),
            )
        row = conn.execute("SELECT * FROM applications WHERE url = ?", (url,)).fetchone()
    _bump()
    return _row_to_dict(row)


def delete_application(url):
    with _lock, _connect() as conn:
        cur = conn.execute("DELETE FROM applications WHERE url = ?", (url,))
        deleted = cur.rowcount > 0
    _bump()
    return deleted


# --- Profil -------------------------------------------------------------------

DEFAULT_PROFILE = {
    "titles": [],        # intitulés visés (poids fort)
    "must": [],          # compétences indispensables (poids x2)
    "nice": [],          # compétences appréciées
    "exclude": [],       # mots à éviter (ex. "stage", "senior director")
    "countries": [],     # pays préférés (ex. "Morocco"), vide = indifférent
    "remote": "any",     # "any" | "remote" | "onsite"
    "visa": False,       # bonus si l'offre mentionne visa / sponsorship / relocation
}


def get_profile():
    with _lock, _connect() as conn:
        row = conn.execute("SELECT value FROM kv WHERE key = 'profile'").fetchone()
    if not row:
        return dict(DEFAULT_PROFILE)
    try:
        saved = json.loads(row["value"])
    except ValueError:
        saved = {}
    return {**DEFAULT_PROFILE, **{k: v for k, v in saved.items() if k in DEFAULT_PROFILE}}


def set_profile(data):
    clean = dict(DEFAULT_PROFILE)
    for key in ("titles", "must", "nice", "exclude", "countries"):
        values = data.get(key) or []
        seen, out = set(), []
        for v in values:
            v = str(v).strip()
            if v and v.lower() not in seen:
                seen.add(v.lower())
                out.append(v)
        clean[key] = out[:60]
    clean["remote"] = data.get("remote") if data.get("remote") in ("any", "remote", "onsite") else "any"
    clean["visa"] = bool(data.get("visa"))
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT INTO kv (key, value) VALUES ('profile', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (json.dumps(clean, ensure_ascii=False),),
        )
    _bump()
    return clean


# --- Offres déjà vues (détection des nouveautés) ------------------------------

def _ensure_seen(conn):
    conn.execute("CREATE TABLE IF NOT EXISTS seen (url TEXT PRIMARY KEY, first_seen TEXT NOT NULL)")


def record_seen(urls):
    """Enregistre les URL vues et renvoie (urls_nouvelles, est_premiere_fois).
    Au tout premier appel (table vide) tout est enregistré comme "baseline" :
    ces offres ne sont pas des nouveautés, elles servent de référence."""
    urls = [u for u in dict.fromkeys(urls) if u]
    now = _now()
    with _lock, _connect() as conn:
        _ensure_seen(conn)
        baseline = conn.execute("SELECT 1 FROM seen LIMIT 1").fetchone() is None
        known = set()
        # SQLite limite le nombre de variables : on interroge par paquets.
        for i in range(0, len(urls), 500):
            chunk = urls[i:i + 500]
            marks = ",".join("?" * len(chunk))
            known.update(r[0] for r in conn.execute(f"SELECT url FROM seen WHERE url IN ({marks})", chunk))
        new = [u for u in urls if u not in known]
        conn.executemany(
            "INSERT OR IGNORE INTO seen (url, first_seen) VALUES (?, ?)",
            [(u, "baseline" if baseline else now) for u in new],
        )
    return (set() if baseline else set(new)), baseline


def first_seen_map():
    with _lock, _connect() as conn:
        _ensure_seen(conn)
        return dict(conn.execute("SELECT url, first_seen FROM seen").fetchall())


# --- Clé/valeur générique (réglages des alertes) ------------------------------

def kv_get(key, default=None):
    with _lock, _connect() as conn:
        row = conn.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
    if not row:
        return default
    try:
        return json.loads(row["value"])
    except ValueError:
        return default


def kv_set(key, value):
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, json.dumps(value, ensure_ascii=False)),
        )


# --- Offres masquées (« pas intéressé ») ---------------------------------------

def _ensure_hidden(conn):
    conn.execute("CREATE TABLE IF NOT EXISTS hidden (url TEXT PRIMARY KEY, company TEXT, hidden_at TEXT NOT NULL)")


def hidden_urls():
    with _lock, _connect() as conn:
        _ensure_hidden(conn)
        return {r[0] for r in conn.execute("SELECT url FROM hidden")}


def hide_job(url, company=None):
    if not url:
        raise ValueError("url manquante")
    with _lock, _connect() as conn:
        _ensure_hidden(conn)
        conn.execute("INSERT OR REPLACE INTO hidden (url, company, hidden_at) VALUES (?, ?, ?)", (url, company, _now()))
    _bump()


def unhide_job(url):
    with _lock, _connect() as conn:
        _ensure_hidden(conn)
        n = conn.execute("DELETE FROM hidden WHERE url = ?", (url,)).rowcount
    _bump()
    return n > 0


def _norm_company(c):
    return " ".join(str(c or "").lower().split())


def hidden_companies():
    return set(kv_get("hidden_companies", []) or [])


def hide_company(company):
    key = _norm_company(company)
    if not key or key == "?":
        raise ValueError("entreprise inconnue")
    cur = hidden_companies(); cur.add(key)
    kv_set("hidden_companies", sorted(cur))
    _bump()


def unhide_company(company):
    cur = hidden_companies(); cur.discard(_norm_company(company))
    kv_set("hidden_companies", sorted(cur))
    _bump()