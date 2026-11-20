import { Route, Routes } from "react-router-dom";
import DashboardLayout from "./components/Layout";
import { FiltersProvider } from "./context/Filters";
import DataQuality from "./pages/DataQuality";
import Landing from "./pages/Landing";
import MapPage from "./pages/MapPage";
import Overview from "./pages/Overview";
import Pollutants from "./pages/Pollutants";
import Rankings from "./pages/Rankings";
import Seasonal from "./pages/Seasonal";
import SqlExplorer from "./pages/SqlExplorer";
import Trends from "./pages/Trends";
import { EmptyState } from "./components/ui";
import { Link } from "react-router-dom";

export default function App() {
  return (
    <FiltersProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Overview />} />
          <Route path="rankings" element={<Rankings />} />
          <Route path="trends" element={<Trends />} />
          <Route path="seasonal" element={<Seasonal />} />
          <Route path="pollutants" element={<Pollutants />} />
          <Route path="map" element={<MapPage />} />
          <Route path="data-quality" element={<DataQuality />} />
          <Route path="sql" element={<SqlExplorer />} />
        </Route>
        <Route path="*" element={<EmptyState title="Page not found" mood="moderate" text="Nimbus couldn't find that page." action={<Link className="rounded-xl bg-forest-900 px-4 py-2 text-sm font-semibold text-white" to="/">Back home</Link>} />} />
      </Routes>
    </FiltersProvider>
  );
}
