# -*- coding: utf-8 -*-
"""
Les datasets HF sont des INSTANTANÉS (mis à jour quotidiennement côté HF),
pas une recherche en direct. On filtre par mot-clé au fur et à mesure de la
lecture, sans tout télécharger d'abord.

IMPORTANT : load_dataset(..., split="train") SANS streaming télécharge tout
le dataset en local avant de rendre la main — pour un dataset à 414 fichiers
(edwarddgao/open-apply-jobs) ou avec une connexion lente/instable vers
huggingface.co, ça peut prendre des dizaines de minutes ou timeout. Le mode
streaming=True lit fichier par fichier, ligne par ligne, et permet de
s'arrêter dès qu'on a assez de résultats — beaucoup plus robuste."""
from typing import List
import json

from schema import Job


def fetch_jobicy_direct(keywords, days_back: int = 5, max_matches: int = 300) -> List[Job]:
    """Alternative plus légère à fetch_hf_dataset(), spécifique à
    jobicy/remote-jobs : contourne complètement la librairie `datasets`
    (qui tire pyarrow, xet, huggingface_hub... et semble en partie
    responsable des lenteurs observées) — juste des requêtes HTTP directes
    vers les fichiers JSONL quotidiens du dataset, un jour à la fois.

    Ne couvre QUE jobicy (fichiers JSONL simples). edwarddgao/open-apply-jobs
    est en Parquet, ce qui nécessite de toute façon pyarrow — pas de gain à
    le réécrire en direct, reste sur fetch_hf_dataset() pour celui-là."""
    import requests

    REPO = "jobicy/remote-jobs"
    kw_lower = [k.lower() for k in keywords]
    jobs, seen_files = [], []

    # 1. Liste les fichiers disponibles via l'API HF (léger, pas de download).
    # NOTE : "data/daily" est le chemin SUPPOSÉ, jamais confirmé en direct
    # (contrairement au schéma edwarddgao, validé via diagnose_edwarddgao.py).
    # Si HF a renommé/déplacé ce dossier, l'API renvoie une liste vide ou une
    # erreur 404 — sans lever d'exception ici, ça se traduirait (comme pour
    # WWR avant son correctif) par un silencieux "0 offres" indistinguable
    # d'une semaine sans offre correspondante. On distingue donc explicitement
    # "chemin introuvable" de "aucune offre ne correspond aux mots-clés".
    tree_url = f"https://huggingface.co/api/datasets/{REPO}/tree/main/data/daily"
    try:
        resp = requests.get(tree_url, timeout=15)
        resp.raise_for_status()
        tree = resp.json()
    except requests.RequestException as e:
        raise ConnectionError(
            f"impossible de lister les fichiers jobicy sur Hugging Face "
            f"({type(e).__name__}: {e}) — le dépôt ou le chemin data/daily/ "
            "a peut-être changé, vérifier manuellement "
            f"https://huggingface.co/datasets/{REPO}/tree/main"
        ) from e

    files = sorted(
        (f["path"] for f in tree if f.get("path", "").endswith(".jsonl")),
        reverse=True,  # les plus récents d'abord (noms = dates YYYY-MM-DD)
    )[:days_back]

    if not files:
        raise ConnectionError(
            f"aucun fichier .jsonl trouvé sous data/daily/ pour {REPO} — "
            "le chemin a probablement changé côté Hugging Face (pas un vrai "
            "'0 offres'), vérifier manuellement "
            f"https://huggingface.co/datasets/{REPO}/tree/main"
        )

    # 2. Télécharge et parse chaque fichier directement, sans la lib datasets
    download_failures = 0
    for path in files:
        file_url = f"https://huggingface.co/datasets/{REPO}/resolve/main/{path}"
        try:
            r = requests.get(file_url, timeout=30)
            r.raise_for_status()
        except requests.RequestException as e:
            print(f"\n    [jobicy direct] {path} ignoré ({type(e).__name__})", end="")
            download_failures += 1
            continue

        for line in r.text.splitlines():
            if not line.strip() or len(jobs) >= max_matches:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            # Schéma réel confirmé (dataset_card.md de jobicy/remote-jobs) :
            # jobTitle, companyName, jobDescription, jobGeo, pubDate,
            # salaryMin/Max/Currency/Period — pas title/company/description
            # génériques que j'avais supposés avant confirmation.
            title = row.get("jobTitle") or ""
            desc = row.get("jobDescription") or row.get("jobExcerpt") or ""
            if not any(k in f"{title} {desc}".lower() for k in kw_lower):
                continue
            jobs.append(Job(
                title=title or "Sans titre",
                company=row.get("companyName") or "?",
                url=row.get("url") or "",
                source="hf:jobicy-direct",
                location=row.get("jobGeo"),
                posted_date=row.get("pubDate"),
                description=desc or None,
                salary_min=row.get("salaryMin"),
                salary_max=row.get("salaryMax"),
                salary_currency=row.get("salaryCurrency"),
                tags=row.get("jobIndustry") or [],
            ))
        seen_files.append(path)

    # Tous les fichiers listés ont échoué au téléchargement -> ce n'est pas
    # non plus un vrai "0 offres", mais une panne réseau/HF.
    if download_failures == len(files) and files:
        raise ConnectionError(
            f"les {download_failures} fichiers jobicy trouvés ont tous échoué "
            "au téléchargement (réseau ou Hugging Face indisponible) — pas un "
            "vrai '0 offres'"
        )

    return jobs


def fetch_jobicy_api(keywords, max_matches: int = 300, geo: str = None) -> List[Job]:
    """Appelle directement l'API publique Jobicy (pas Hugging Face du tout) :
    https://jobicy.com/api/v2/remote-jobs

    Confirmé officiellement (documentation jobicy.com, oct. 2026) :
    - Gratuite, sans clé API, sans compte (la clé Bearer est optionnelle,
      seulement pour débloquer l'URL ATS directe au lieu du lien Jobicy —
      $0.01/offre, PAS utilisé ici, on reste sur le plan 100% gratuit).
    - Renvoie les offres publiées dans les 7 derniers jours (délai de
      publication de 3h), triées par date, avec pagination par curseur.
    - Contrairement au dataset HF (instantané mis à jour une fois par jour),
      cette API est la source LIVE elle-même -> toujours plus à jour.

    Le paramètre `tag` de l'API est documenté comme "keyword search applied
    to the available job content" et les exemples officiels n'utilisent que
    des mots simples (tag=python). Pas de garantie que "AI Engineer" (avec
    espace) fonctionne comme recherche de phrase exacte côté serveur -> on
    envoie quand même le mot-clé complet en `tag` (filtre serveur, réduit le
    volume à paginer), MAIS on refiltre aussi côté client sur titre+description
    comme les autres sources, en défense en profondeur si le serveur est
    plus permissif ou plus strict que prévu.

    geo : slug officiel de la taxonomie Jobicy (ex. "usa", "france", "europe",
    "anywhere" — voir GET .../remote-jobs?get=locations pour la liste
    complète confirmée). Transmis tel quel en paramètre `geo` de l'API ->
    c'est le mode "recherche par pays" qui filtre AUSSI Jobicy nativement,
    au lieu de ne compter que sur le mot-clé comme avant ce correctif. Si
    None (comportement par défaut), aucun filtre géographique n'est appliqué
    -> identique à avant.

    C'est la méthode recommandée pour jobicy — remplace fetch_jobicy_direct()
    qui lisait les fichiers HF avec de mauvais noms de colonnes."""
    import requests

    BASE_URL = "https://jobicy.com/api/v2/remote-jobs"
    kw_lower = [k.lower() for k in keywords]
    jobs = []
    seen_ids = set()
    failures = 0

    for kw in keywords:
        cursor = None
        pages_fetched = 0
        try:
            while True:
                params = {"count": 100, "tag": kw}
                if geo:
                    params["geo"] = geo
                if cursor:
                    params["cursor"] = cursor
                resp = requests.get(
                    BASE_URL, params=params, timeout=20,
                    headers={"Accept": "application/json"},
                )
                resp.raise_for_status()
                data = resp.json()

                if data.get("success") is False:
                    print(f"\n    [jobicy API] erreur API pour '{kw}' : {data.get('error')}", end="")
                    break

                for row in data.get("jobs", []):
                    job_id = row.get("id")
                    if job_id is not None and job_id in seen_ids:
                        continue  # déjà vu via un autre mot-clé
                    if len(jobs) >= max_matches:
                        break
                    title = row.get("jobTitle") or ""
                    desc = row.get("jobDescription") or row.get("jobExcerpt") or ""
                    # Refiltre côté client : le `tag` serveur a pu être large
                    # (ou n'a peut-être rien filtré du tout sur une phrase).
                    if kw_lower and not any(k in f"{title} {desc}".lower() for k in kw_lower):
                        continue
                    seen_ids.add(job_id)
                    jobs.append(Job(
                        title=title or "Sans titre",
                        company=row.get("companyName") or "?",
                        url=row.get("url") or "",
                        source="jobicy-api",
                        location=row.get("jobGeo"),
                        posted_date=row.get("pubDate"),
                        description=desc or None,
                        salary_min=row.get("salaryMin"),
                        salary_max=row.get("salaryMax"),
                        salary_currency=row.get("salaryCurrency"),
                        tags=row.get("jobIndustry") or [],
                        logo_url=row.get("companyLogo") or None,
                    ))

                cursor = data.get("nextCursor")
                pages_fetched += 1
                # Garde-fou : la fenêtre glissante de 7 jours + pagination par
                # curseur pourrait tourner longtemps sur un mot-clé fréquent ;
                # 5 pages (jusqu'à 500 offres brutes) par mot-clé est large
                # pour ce cas d'usage.
                if not cursor or len(jobs) >= max_matches or pages_fetched >= 5:
                    break
        except requests.RequestException as e:
            print(f"\n    [jobicy API] mot-clé '{kw}' ignoré ({type(e).__name__})", end="")
            failures += 1
            continue

    if failures == len(keywords) and keywords:
        raise ConnectionError(
            f"les {failures} appels à l'API Jobicy ont tous échoué "
            "(réseau ou API indisponible) — pas un vrai '0 offres'"
        )

    return jobs


def _list_recent_date_partitions(dataset_name: str, days_back: int = 14):
    """edwarddgao/open-apply-jobs (et tout dataset partitionné de la même
    façon) range ses fichiers sous data/date=YYYY-MM-DD/source={ats}/*.parquet,
    EN ORDRE CROISSANT (avril avant octobre). load_dataset(streaming=True)
    lit les fichiers dans cet ordre -> avec une limite de lignes scannées,
    on s'arrêtait toujours quelque part au milieu du dataset, bien avant
    d'atteindre les partitions récentes. C'était la vraie cause des offres
    vieilles de plusieurs mois ("5 mois"), pas un dataset à l'abandon : il
    est en fait mis à jour chaque jour (vérifié via l'API HF).

    On liste donc explicitement les dossiers "date=" disponibles via l'API
    HF (léger, pas de téléchargement), on garde les `days_back` plus
    récents, et on ne demande à `datasets` de streamer QUE ces fichiers-là
    (via `data_files`) -> on lit en priorité les offres fraîches."""
    import requests

    repo = dataset_name
    api_url = f"https://huggingface.co/api/datasets/{repo}/tree/main/data"
    try:
        resp = requests.get(api_url, timeout=15)
        resp.raise_for_status()
        entries = resp.json()
    except requests.RequestException:
        return None  # API HF indisponible -> on retombera sur le scan complet

    date_dirs = sorted(
        {e["path"] for e in entries if e.get("type") == "directory" and "date=" in e.get("path", "")},
        reverse=True,  # le nom du dossier est la date -> tri alpha = tri chrono
    )[:days_back]
    if not date_dirs:
        return None

    # Chaque dossier de date contient lui-même un ou plusieurs sous-dossiers
    # source={ats}/ avec les fichiers parquet -> glob générique pour les
    # attraper tous sans connaître la liste des ATS à l'avance (elle a déjà
    # changé une fois : 3 sources en avril, 7 depuis septembre).
    return [f"{d}/**/*.parquet" for d in date_dirs]


def _fetch_hf_dataset_via_duckdb(dataset_name: str, keywords,
                                  max_matches: int, recent_days: int,
                                  location_needles=None):
    """Méthode RECOMMANDÉE OFFICIELLEMENT par Hugging Face pour interroger ce
    dataset (voir la carte du dataset, section "Dataset Viewer" / exemples
    DuckDB) : requêter les fichiers Parquet EN PLACE via hf://, sans tout
    télécharger ni streamer ligne à ligne. edwarddgao/open-apply-jobs n'a PAS
    d'API REST propre (vérifié : seulement un pipeline batch -> Hugging Face,
    confirmé via son dépôt GitHub) — DuckDB + hf:// est donc la façon la plus
    proche d'un "endpoint de requête" qui existe réellement pour ce dataset.

    Avantages sur l'ancienne méthode (datasets.load_dataset(streaming=True)) :
    - hive_partitioning=1 laisse DuckDB lire le `date=YYYY-MM-DD` du CHEMIN
      du fichier sans ouvrir son contenu -> le filtre de date élimine des
      fichiers entiers avant même de les télécharger (pushdown), au lieu de
      lire une partition à la fois dans l'ordre avec data_files.
    - Le filtre mot-clé (ILIKE) est évalué par DuckDB sur chaque groupe de
      lignes Parquet -> pas besoin de rapatrier toutes les lignes pour les
      filtrer nous-mêmes en Python.

    Renvoie None (pas d'exception) si duckdb n'est pas installé ou si
    l'extension httpfs ne peut pas se charger (ex. hors ligne, pare-feu
    d'entreprise) -> fetch_hf_dataset() retombe alors sur l'ancienne méthode
    `datasets`, qui reste fonctionnelle même si plus lente.

    LENTEUR CORRIGÉE (signalée par l'utilisateur, "edwarddgao prend beaucoup
    de temps") : la première version de cette fonction utilisait le glob
    "data/**/*.parquet", qui matche les 147 partitions de date du dataset
    ENTIER (avril à octobre) -> DuckDB devait lister/énumérer TOUS ces
    fichiers sur le réseau avant même d'appliquer le WHERE sur la date (le
    filtre s'applique APRÈS l'énumération, pas avant -> aucune économie
    réelle malgré hive_partitioning). On utilise maintenant
    _list_recent_date_partitions() pour ne lister QUE les `recent_days`
    derniers jours via l'API HF (rapide, déjà utilisé par le chemin de
    repli `datasets`) et on restreint le glob à CES partitions précises ->
    DuckDB n'énumère plus que les fichiers vraiment ciblés."""
    try:
        import duckdb
    except ImportError:
        return None

    try:
        con = duckdb.connect()
        con.execute("INSTALL httpfs")
        con.execute("LOAD httpfs")
    except Exception:
        return None  # extension indisponible (hors ligne, etc.) -> repli

    recent_patterns = _list_recent_date_partitions(dataset_name, days_back=recent_days)
    if not recent_patterns:
        return None  # API HF de listing indisponible -> repli propre vers `datasets`

    # _list_recent_date_partitions() renvoie des chemins RELATIFS au dépôt
    # (ex. "data/date=2026-10-08/**/*.parquet") -> préfixés ici en hf:// pour
    # DuckDB. Une liste de globs (au lieu d'un seul glob large) : DuckDB
    # n'énumère que les fichiers de CES jours précis, pas tout le dataset.
    glob_urls = [f"hf://datasets/{dataset_name}/{p}" for p in recent_patterns]

    # Construit un filtre "titre OU description contient un des mots-clés"
    # en SQL paramétré (pas d'injection : les valeurs passent par `parameters`,
    # jamais interpolées dans la chaîne SQL elle-même).
    kw_conditions = " OR ".join(
        ["(title ILIKE ? OR description_html ILIKE ?)" for _ in keywords]
    ) if keywords else "TRUE"
    params = []
    for kw in keywords:
        needle = f"%{kw}%"
        params += [needle, needle]

    # Mode "par pays" : filtre sur le champ lieu (liste `locations` dans ce
    # dataset ; CAST en texte pour gérer liste ET chaîne). Si la colonne n'existe
    # pas, la requête échoue et on retente sans ce filtre (le filtre pays est
    # alors refait en Python dans fetch_hf_dataset).
    loc_sql, loc_params = "", []
    if location_needles:
        loc_sql = " AND (" + " OR ".join(["CAST(locations AS VARCHAR) ILIKE ?"] * len(location_needles)) + ")"
        loc_params = [f"%{n}%" for n in location_needles]

    def _query(with_location: bool):
        where = f"({kw_conditions})" + (loc_sql if with_location else "")
        return f"""
        SELECT *
        FROM read_parquet({glob_urls!r}, hive_partitioning=1, union_by_name=True)
        WHERE {where}
        ORDER BY date DESC
        LIMIT {int(max_matches) * 3}
    """, params + (loc_params if with_location else [])

    query, qparams = _query(bool(location_needles))
    # LIMIT large (x3) : plusieurs lignes peuvent échouer le re-filtre Python
    # (champ title vide, etc.) ou être des doublons -> marge avant troncature.
    # Plus besoin de filtrer par date en SQL : la liste de fichiers est déjà
    # restreinte aux `recent_days` derniers jours en amont (glob_urls).

    try:
        try:
            rows = con.execute(query, qparams).fetchall()
        except duckdb.Error:
            if not location_needles:
                raise
            query, qparams = _query(False)   # colonne `locations` absente
            rows = con.execute(query, qparams).fetchall()
        columns = [d[0] for d in con.description]
    except duckdb.Error:
        return None  # colonne absente / schéma inattendu -> repli propre

    return [dict(zip(columns, r)) for r in rows]


def _row_to_job(row: dict, dataset_name: str) -> "Job | None":
    """Convertit une ligne brute (dict, quelle que soit la méthode de lecture
    -- DuckDB ou `datasets`) en Job. Logique de mapping partagée pour que les
    deux chemins produisent exactement le même résultat."""
    title = _first_present(row, ["title", "job_title", "position", "role"])
    if not title:
        return None
    # description_html : nom réel confirmé pour edwarddgao/open-apply-jobs
    # (diagnose_edwarddgao.py). On garde aussi les anciens alias pour les
    # autres datasets HF dont le schéma peut différer.
    desc = _first_present(row, [
        "description", "description_html", "job_description", "excerpt",
    ]) or ""

    # company : ce dataset n'a PAS de nom d'entreprise lisible du tout —
    # seulement source_slug (ex. "0g"), le tenant slug exact sur l'ATS
    # d'origine (confirmé par le README officiel du dataset : c'est
    # boards.greenhouse.io/{slug}, jobs.lever.co/{slug} ou
    # jobs.ashbyhq.com/{slug} — pas une approximation). "source" (greenhouse
    # /lever/ashby) dit lequel. On reconstruit donc le lien carrière réel
    # plutôt qu'une simple étiquette "(slug: xxx)" — un clic suffit alors
    # pour voir le vrai nom de l'entreprise.
    company = _first_present(row, [
        "company", "company_name", "companyName", "employer",
        "employer_name", "organization", "org", "org_name",
    ]) or _nested_company_name(row)
    source_slug = _first_present(row, ["source_slug"])
    ats = _first_present(row, ["source"])  # greenhouse | lever | ashby
    if not company and source_slug:
        career_url = _ats_career_url(ats, source_slug)
        company = f"(slug: {source_slug} — {career_url})" if career_url else f"(slug: {source_slug})"
    company = company or "?"

    url = _first_present(row, ["url", "job_url", "link", "apply_url"]) or ""

    # locations : liste (ex. ['Remote']) dans edwarddgao, pas une chaîne —
    # on l'aplatit en texte pour rester compatible avec Job.location (str)
    location_raw = _first_present(row, ["location", "candidate_required_location", "locations"])
    location = ", ".join(location_raw) if isinstance(location_raw, list) else location_raw

    return Job(
        title=title,
        company=company,
        url=url,
        # Site d'origine réel (greenhouse / lever / ashby…) quand le dataset l'indique :
        # on affiche alors « Greenhouse », pas le nom du dataset.
        source=f"ats:{str(ats).strip().lower()}" if ats else f"hf:{dataset_name.split('/')[0]}",
        location=location,
        remote=_first_present(row, ["remote", "is_remote"]),
        # posted_at : nom réel confirmé pour edwarddgao (champ ISO8601).
        # updated_at en dernier repli — le README confirme que pour
        # certaines anciennes partitions Greenhouse, posted_at est en
        # fait rempli à partir de updated_at (date de modif, pas de
        # publication d'origine) ; on ne peut pas distinguer les deux
        # cas ici, mais avoir une date approximative reste mieux que rien.
        posted_date=_first_present(row, [
            "date_posted", "posted_date", "publication_date", "posted_at", "updated_at",
        ]),
        description=desc or None,
        salary_min=_first_present(row, ["salary_min", "min_salary"]),
        salary_max=_first_present(row, ["salary_max", "max_salary"]),
        tags=_as_list(_first_present(row, ["tags", "categories", "skills"])),
    )


def fetch_hf_dataset(dataset_name: str, keywords,
                      max_rows_scanned: int = 20000,
                      max_matches: int = 500,
                      recent_days: int = 14,
                      location_needles=None) -> List[Job]:
    """dataset_name ex. 'jobicy/remote-jobs' ou 'edwarddgao/open-apply-jobs'.
    Les noms de colonnes varient d'un dataset à l'autre -> on essaie
    plusieurs alias courants plutôt que de supposer un schéma fixe.

    Essaie d'abord DuckDB (méthode recommandée par HF pour ce dataset, voir
    _fetch_hf_dataset_via_duckdb) ; si indisponible (duckdb non installé, ou
    extension httpfs injoignable), retombe sur `datasets` en ciblant les
    partitions récentes (_list_recent_date_partitions) -> jamais d'échec dur
    juste parce qu'une des deux méthodes n'est pas utilisable.

    max_rows_scanned : (chemin de repli uniquement) arrête la lecture après
    ce nombre de lignes vues, même si le dataset est plus gros.
    max_matches : arrête dès qu'on a trouvé ce nombre d'offres pertinentes.
    recent_days : ne cible que les N derniers jours au lieu de scanner
    depuis le début (les deux méthodes respectent ce paramètre)."""
    kw_lower = [k.lower() for k in keywords]
    loc_lower = [n.lower() for n in (location_needles or [])]

    def _loc_ok(job) -> bool:
        return not loc_lower or any(n in (job.location or "").lower() for n in loc_lower)

    duckdb_rows = _fetch_hf_dataset_via_duckdb(dataset_name, keywords, max_matches, recent_days, location_needles)
    if duckdb_rows is not None:
        jobs = []
        for row in duckdb_rows:
            if len(jobs) >= max_matches:
                break
            job = _row_to_job(row, dataset_name)
            if job is None:
                continue
            # DuckDB a déjà filtré via ILIKE, mais on revérifie en Python pour
            # rester cohérent avec le comportement du chemin de repli
            # (ex. ILIKE sur description_html NULL renvoie NULL, pas FALSE,
            # ce que WHERE traite comme "non matché" -> déjà correct, mais la
            # double vérification coûte rien et évite toute divergence future).
            haystack = f"{job.title} {job.description or ''}".lower()
            if kw_lower and not any(k in haystack for k in kw_lower):
                continue
            if not _loc_ok(job):
                continue
            jobs.append(job)
        return jobs

    # --- Repli : ancienne méthode via `datasets` (streaming) ---
    try:
        from datasets import load_dataset
    except ImportError as e:
        raise ImportError(
            "pip install datasets  # nécessaire pour lire les datasets Hugging Face "
            "(ou pip install duckdb pour la méthode recommandée, plus rapide)"
        ) from e

    recent_files = _list_recent_date_partitions(dataset_name, days_back=recent_days)

    # streaming=True : ne télécharge PAS tout le dataset d'un coup, lit au fil de l'eau.
    # Avec data_files, `datasets` ne liste/streame QUE les fichiers ciblés ->
    # beaucoup plus rapide ET on lit directement les offres récentes.
    if recent_files:
        ds = load_dataset(dataset_name, data_files=recent_files, split="train", streaming=True)
    else:
        ds = load_dataset(dataset_name, split="train", streaming=True)
    jobs = []

    for i, row in enumerate(ds):
        if i >= max_rows_scanned or len(jobs) >= max_matches:
            break
        job = _row_to_job(row, dataset_name)
        if job is None:
            continue
        haystack = f"{job.title} {job.description or ''}".lower()
        if kw_lower and not any(k in haystack for k in kw_lower):
            continue
        jobs.append(job)
    return jobs


def _first_present(row: dict, keys):
    for k in keys:
        if k in row and row[k] not in (None, ""):
            return row[k]
    return None


def _nested_company_name(row: dict):
    """Beaucoup de flux d'offres suivent le format schema.org JobPosting, où
    le nom de l'entreprise est imbriqué dans hiringOrganization.name plutôt
    qu'un champ plat. À vérifier/confirmer avec diagnose_edwarddgao.py."""
    for key in ("hiringOrganization", "hiring_organization", "employer_details"):
        nested = row.get(key)
        if isinstance(nested, dict):
            name = nested.get("name") or nested.get("companyName")
            if name:
                return name
    return None


def _ats_career_url(ats, slug: str):
    """Reconstruit l'URL publique de la page carrière à partir du tenant
    slug, selon les 3 patterns confirmés par le README officiel du dataset
    edwarddgao/open-apply-jobs (Greenhouse/Lever/Ashby)."""
    if not ats or not slug:
        return None
    patterns = {
        "greenhouse": f"https://boards.greenhouse.io/{slug}",
        "lever": f"https://jobs.lever.co/{slug}",
        "ashby": f"https://jobs.ashbyhq.com/{slug}",
    }
    return patterns.get(str(ats).lower())


def _as_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        return [t.strip() for t in value.split(",") if t.strip()]
    return []