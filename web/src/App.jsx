import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProvider } from "./store.jsx";
import Layout from "./Layout.jsx";
import TodayPage from "./pages/TodayPage.jsx";
import OffersPage from "./pages/OffersPage.jsx";
import ApplicationsPage from "./pages/ApplicationsPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<TodayPage />} />
            <Route path="offres" element={<OffersPage />} />
            <Route path="candidatures" element={<ApplicationsPage />} />
            <Route path="profil" element={<ProfilePage />} />
            {/* anciennes adresses : rien ne casse les favoris */}
            <Route path="search" element={<Navigate to="/" replace />} />
            <Route path="jobs" element={<Navigate to="/offres" replace />} />
            <Route path="family" element={<Navigate to="/offres" replace />} />
            <Route path="alerts" element={<Navigate to="/profil?tab=alerts" replace />} />
            <Route path="profile" element={<Navigate to="/profil?tab=cv" replace />} />
            <Route path="settings" element={<Navigate to="/profil?tab=account" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}