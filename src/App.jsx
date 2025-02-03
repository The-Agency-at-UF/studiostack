import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import './App.css'
import Dashboard from './pages/Dashboard/Dashboard'

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="" element={<Dashboard />} />
        {/* Add other routes as needed */}
      </Routes>
    </Router>
  );
};

export default App
