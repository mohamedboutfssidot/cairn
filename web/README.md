# Interface web — Offres découvertes

Interface React pour lancer la recherche ET parcourir/filtrer les résultats.
100% local — aucune donnée ne quitte ta machine. `python discover.py` en CLI
reste disponible mais n'est plus nécessaire : tout se fait depuis l'app.

## Démarrage (2 terminaux)

**Terminal 1 — serveur local (pilote la recherche + sert les données) :**
```bash
cd job_discovery
pip install -r requirements_server.txt
python server.py
```
Reste ouvert sur http://localhost:5000

**Terminal 2 — interface React :**
```bash
cd job_discovery/web
npm install        # une seule fois
npm run dev
```
Ouvre ensuite http://localhost:5173 dans ton navigateur.

## Utilisation

1. Dans la barre latérale, section **Recherche** : choisis le mode —
   mots-clés par défaut de `config.py`, un mot-clé personnalisé, ou **Par
   pays** (sélectionne un pays, l'app propose une liste de postes IA/ML à
   cocher/décocher) — coche les sources à interroger, puis clique
   **Lancer la recherche**.

   Le mode **Par pays** filtre réellement par pays sur les sources qui le
   permettent : JobSpy/LinkedIn (lieu), Indeed et Glassdoor (paramètre pays
   dédié, nécessaire en plus du lieu — sans lui ces deux-là ignoraient le
   pays malgré le filtre), et Jobicy (paramètre `geo` natif de son API,
   pour les pays que sa taxonomie couvre). Les autres sources (RemoteOK,
   Remotive, Himalayas, ATS, dataset HF) n'exposent pas de filtre pays côté
   API — elles restent filtrées par les postes choisis uniquement ; c'est
   une limite réelle de ces sources, pas un oubli.
2. La progression s'affiche en direct, source par source (terminée / en
   cours / échouée), avec le nombre d'offres trouvées à mesure qu'elles
   arrivent — pas besoin d'attendre que tout soit fini pour voir les
   premiers résultats.
3. `jobs_discovered.json`/`.csv` sont automatiquement nettoyés au début de
   chaque recherche, puis réécrits à la fin (dédupliqués).

## Vues

- **Liste** : toutes les offres, avec recherche texte, filtres (source,
  fraîcheur, télétravail, pays) et tri par date.
- **Par poste** : les offres regroupées par famille de poste (AI Engineer,
  ML Engineer, Data Scientist, MLOps...), avec le volume de chacune —
  pratique pour voir d'un coup d'œil où se concentre le marché plutôt que
  de parcourir source par source.

Les offres dont l'âge dépasse 90 jours sont marquées en orange/rouge dans la
liste (souvent périmées, à vérifier avant de postuler).
