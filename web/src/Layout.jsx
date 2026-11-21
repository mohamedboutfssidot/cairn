import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useApp } from "./store.jsx";
import { CairnMark, Icon, ICONS, ProgressStrip } from "./ui.jsx";
import { HelpDrawer, Palette } from "./modals/Dialogs.jsx";
import { FiltersDrawer, RefreshChoice, SearchesSheet } from "./modals/Dialogs.jsx";
import SearchWizard from "./modals/SearchWizard.jsx";
import KitModal from "./modals/KitModal.jsx";

const NAV = [["/", "Aujourd’hui", "today"], ["/offres", "Offres", "offers"], ["/candidatures", "Candidatures", "apps"], ["/profil", "Profil", "profile"]];

export default function Layout() {
  const a = useApp();
  const { modal, setModal, run, due, fresh, cand, toast, offline } = a;
  const nav = useNavigate();

  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setModal((m) => (m?.type === "palette" ? null : { type: "palette" })); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [setModal]);

  const ini = (cand.name || "").split(" ").map((x) => x[0] || "").join("").slice(0, 2).toUpperCase();
  const close = () => setModal(null);

  return (
    <>
      <header className="top">
        <div className="wrap">
          <NavLink className="brand" to="/" aria-label="Cairn, aujourd’hui"><CairnMark /><b>Cairn</b></NavLink>
          <nav className="nav" aria-label="Navigation principale">
            {NAV.map(([to, label, ic]) => (
              <NavLink key={to} to={to} end={to === "/"} aria-current={undefined}>
                <Icon>{ICONS[ic]}</Icon>{label}
                {to === "/candidatures" && due.length > 0 && <span className="bdg">{due.length}</span>}
                {to === "/offres" && fresh.length > 0 && <span className="dot" title={`${fresh.length} nouvelles offres`} />}
              </NavLink>
            ))}
          </nav>
          <div className="top-right">
            <button type="button" className="palbtn" onClick={() => setModal({ type: "palette" })} aria-label="Rechercher ou lancer une action">
              <Icon size={16}>{ICONS.search}</Icon><span>Rechercher ou agir</span><kbd>Ctrl K</kbd>
            </button>
            <button type="button" className="iconbtn" onClick={() => setModal({ type: "help" })} aria-label="Aide" title="Aide"><Icon size={18}>{ICONS.help}</Icon></button>
            <button type="button" className="iconbtn" onClick={a.toggleTheme} aria-label="Changer de thème" title="Changer de thème"><Icon size={17}>{a.isDark ? ICONS.sun : ICONS.moon}</Icon></button>
            <NavLink className="avatar" to="/profil" aria-label="Mon profil">{ini || "?"}</NavLink>
          </div>
        </div>
        <ProgressStrip progress={a.progress} refresh={a.refresh} run={run} onSeeOffers={() => nav("/offres")} onStop={a.stopAll} stopping={a.stopping} />
      </header>
      <main className="wrap" id="app">
        {offline && (
          <div className="notice" role="alert" style={{ marginTop: 18 }}>
            Cairn ne joint pas le serveur local. Lance <code>python server.py</code> dans le dossier job_discovery, puis recharge la page.
            <button type="button" className="btn sm" onClick={() => a.loadJobs().catch(() => {})}>Réessayer</button>
          </div>
        )}
        <Outlet />
      </main>

      {modal?.type === "wizard" && <SearchWizard onClose={close} />}
      {modal?.type === "kit" && <KitModal url={modal.url} start={modal.start} onClose={close} />}
      {modal?.type === "filters" && <FiltersDrawer onClose={close} />}
      {modal?.type === "searches" && <SearchesSheet onClose={close} />}
      {modal?.type === "refresh" && <RefreshChoice ids={modal.ids} atOpen={modal.atOpen} onClose={close} />}
      {modal?.type === "help" && <HelpDrawer onClose={close} />}
      {modal?.type === "palette" && <Palette onClose={close} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}