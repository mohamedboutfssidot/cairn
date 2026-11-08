# -*- coding: utf-8 -*-
"""
Structure commune (le "interface cohérent" demandé) : peu importe la source
(API, MCP, dataset, JobSpy...), chaque offre est convertie dans CETTE forme
avant d'être combinée. C'est ce qui permet de dédupliquer, trier et noter
toutes les offres ensemble, quelle que soit leur origine.
"""
from dataclasses import dataclass, field, asdict
from typing import Optional, List
import hashlib


@dataclass
class Job:
    title: str
    company: str
    url: str                       # sert de clé de déduplication principale
    source: str                    # "remoteok", "remotive", "wwr", "himalayas",
                                    # "jobspy:linkedin", "hf:jobicy", "ats:greenhouse", ...
    location: Optional[str] = None
    remote: Optional[bool] = None
    posted_date: Optional[str] = None   # format ISO "YYYY-MM-DD" si connu
    description: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_currency: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    # Logo entreprise : seules RemoteOK, Remotive et Jobicy en fournissent un
    # dans leur réponse brute (voir api_sources.py / dataset_sources.py) ;
    # None pour toutes les autres sources (WWR, Himalayas, ATS, JobSpy,
    # datasets HF) qui n'exposent rien d'exploitable -> le frontend doit
    # gérer logo_url absent normalement (pas une erreur, juste pas d'image).
    logo_url: Optional[str] = None

    # rempli plus tard par l'étape de notation (pas la découverte)
    score: Optional[float] = None
    score_reason: Optional[str] = None

    def dedup_key(self) -> str:
        """Clé de dédoublonnage : URL normalisée, sinon titre+entreprise."""
        base = (self.url or "").strip().lower().rstrip("/")
        if not base:
            base = f"{self.title}|{self.company}".strip().lower()
        return hashlib.sha1(base.encode("utf-8")).hexdigest()

    def to_dict(self) -> dict:
        return asdict(self)
