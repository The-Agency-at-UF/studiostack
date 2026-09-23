import React, { useCallback, useEffect, useState } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { getAuth, signOut } from "firebase/auth";
import Dashboard from './pages/Dashboard/Dashboard'
import Inventory  from "./pages/Inventory/Inventory";
import Calendar from "./pages/Calendar/Calendar";
import Report from "./pages/Report/Report";
import Reports from "./pages/Report/Reports";
import ReportSummary from "./pages/Report/ReportSummary";
import Statistics from "./pages/Statistics/Statistics";
import LogIn from './pages/LogIn/LogIn';
import Users from "./pages/Users/Users";
import Teams from "./pages/Teams/Teams";
import Reservations from "./pages/Reservation/Reservations";
import CreateReservation from "./pages/Reservation/CreateReservation";
import CheckInOut from "./pages/Reservation/CheckInOut";
import Header from "./components/Header";
import BugReportPopup from "./components/BugReportPopup";
import './App.css';

const INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 1 hour

const App = () => {
  //email that the user logged in with (defaults to demo user to bypass login)
  const [email, setEmail] = useState(localStorage.getItem("email") || 'demo@studiostack.com');
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem("isAdmin") !== 'false');

  //reset local storage and sign out after inactivity
  //TO DO: this should be passed to the navbar
  const logOut = useCallback(() => {
    const auth = getAuth();
    signOut(auth).then(() => {
      localStorage.removeItem("email");
      localStorage.removeItem("isAdmin");
      window.location.reload();
    }).catch((error) => {
      console.error("Error signing out: ", error);
    });
  }, []);

  //reset inactivity timer
  const resetInactivityTimer = useCallback(() => {
    if (localStorage.getItem("email")) {
      logOut();
    }
  }, [logOut]);

  //monitors user activity to reset inactivity timer
  useEffect(() => {
    const activityEvents = ['mousemove', 'keydown', 'click'];
    const resetTimer = () => {
      clearTimeout(window.inactivityTimer);
      window.inactivityTimer = setTimeout(resetInactivityTimer, INACTIVITY_TIMEOUT);
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    //initial inactivity timer
    window.inactivityTimer = setTimeout(resetInactivityTimer, INACTIVITY_TIMEOUT);

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
      clearTimeout(window.inactivityTimer);
    };
  }, [resetInactivityTimer]);

  //regular paths of the website
  return (
    <Router>
      <Header isAdmin={isAdmin} logOut={logOut}/>
      <div className="app-content">
        <Routes>
          <Route path="" element={<Dashboard isAdmin={isAdmin} />} />
          <Route path="/login" element={<LogIn setEmail={setEmail} setIsAdmin={setIsAdmin}/>} />
          <Route path="/inventory" element={<Inventory isAdmin={isAdmin}/>} />
          <Route path="/teams" element={<Teams isAdmin={isAdmin}/>} />
          <Route path="/reports" element={<Reports isAdmin={isAdmin}/>} />
          <Route path="/create-report" element={<Report userEmail={email}/>} />
          <Route path="/report-summary" element={<ReportSummary isAdmin={isAdmin} userEmail={email}/>} />
          <Route path="/calendar" element={<Calendar isAdmin={isAdmin} />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/users" element={<Users isAdmin={isAdmin} />} />
          <Route path="/reservations" element={<Reservations />} />
          <Route path="/create-reservation" element={<CreateReservation />} />
          <Route path="/check-in-out" element={<CheckInOut />} />
        </Routes>
      </div>
      <footer className="sticky-footer">
        <span className="footer-status"><i /> Studio operations online</span>
        <BugReportPopup userEmail={email} />
      </footer>
    </Router>
  );
};

export default App
