"""Noms des sites d'origine des offres (ce que voit l'utilisateur).

Les offres gardent leur identifiant technique (« jobspy:linkedin », « ats:lever »…) ;
cette table sert seulement à l'affichage et aux filtres : on montre LinkedIn, Indeed,
Greenhouse… et non « jobspy » ou « hf:edwarddgao », qui sont des moyens d'accès."""

NAMES = {
    "remoteok": "RemoteOK",
    "remotive": "Remotive",
    "wwr": "We Work Remotely",
    "himalayas": "Himalayas",
    "jobicy-api": "Jobicy",
    "hf:jobicy-direct": "Jobicy",
    "jobspy:linkedin": "LinkedIn",
    "jobspy:indeed": "Indeed",
    "jobspy:glassdoor": "Glassdoor",
    "jobspy:zip_recruiter": "ZipRecruiter",
    "jobspy:google": "Google Jobs",
    "jobspy:naukri": "Naukri",
    "jobspy:bayt": "Bayt",
    "ats:greenhouse": "Greenhouse",
    "ats:lever": "Lever",
    "ats:ashby": "Ashby",
    "ats:workable": "Workable",
    "ats:recruitee": "Recruitee",
    "hf:edwarddgao": "Autres sites (dataset edwarddgao)",
}

# Sites interrogés par l'app, pour l'affichage sur la page Recherche.
SITES = ["LinkedIn", "Indeed", "Glassdoor", "ZipRecruiter", "Jobicy", "RemoteOK",
         "Remotive", "We Work Remotely", "Himalayas", "Greenhouse", "Lever", "Ashby",
         "Workable", "Recruitee"]


def display(source):
    """Identifiant technique -> nom du site d'origine."""
    if not source:
        return "?"
    if source in NAMES:
        return NAMES[source]
    tail = source.split(":", 1)[-1].replace("_", " ").replace("-", " ")
    return tail[:1].upper() + tail[1:]


def display_list(sources):
    out = []
    for s in sources or []:
        d = display(s)
        if d not in out:
            out.append(d)
    return out