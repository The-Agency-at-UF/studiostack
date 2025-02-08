import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import './App.css'
import Dashboard from './pages/Dashboard/Dashboard'
import Inventory  from "./pages/Inventory/Inventory";
import Calendar from "./pages/Calendar/Calendar";
import Reservations from "./pages/Reservations/Reservations";
import Report from "./pages/Report/Report";
import Statistics from "./pages/Statistics/Statistics";

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/reservations" element={<Reservations />} />
        <Route path="/report" element={<Report />} />
        <Route path="/statistics" element={<Statistics />} />
        {/* Add other routes as needed */}
      </Routes>
    </Router>
  );
};

export default App
