import SearchPanel from "../SearchPanel";

export default function SearchPage() {
  return (
    <div className="page page--search">
      <header className="page__header">
        <div>
          <h1>Recherche</h1>
          <p className="page__subtitle">Choisis le pays et les postes : l'app interroge tous les sites pour toi</p>
        </div>
      </header>

      <SearchPanel />
    </div>
  );
}