import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { getAuth, signOut } from "firebase/auth";
import Dashboard from './pages/Dashboard/Dashboard'
import Inventory  from "./pages/Inventory/Inventory";
import CalendarPage from "./pages/Calendar/Calendar";
import Report from "./pages/Report/Report";
import Statistics from "./pages/Statistics/Statistics";
import LogIn from './pages/LogIn/LogIn';
import Users from "./pages/Users/Users";
import Reservations from "./pages/Reservation/Reservations";
import CreateReservation from "./pages/Reservation/CreateReservation";
import CheckInOut from "./pages/Reservation/CheckInOut";
import Header from "./components/Header";
import './App.css';

const App = () => {
  //email that the user logged in with
  const [email, setEmail] = useState(localStorage.getItem("email") || '');
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem("isAdmin") === 'true' || false);

  //inactivity timeout
  const inactivity_timeout = 60 * 60 * 1000; // 1 hour

  //reset local storage and sign out after inactivity
  //TO DO: this should be passed to the navbar
  const logOut = () => {
  const auth = getAuth();
  signOut(auth).then(() => {
      localStorage.removeItem("email");
      localStorage.removeItem("isAdmin");
      window.location.reload();
    }).catch((error) => {
      console.error("Error signing out: ", error);
    });
};

  //reset inactivity timer
  const resetInactivityTimer = () => {
    if (localStorage.getItem("email")) {
      logOut();
    }
  };

  //monitors user activity to reset inactivity timer
  useEffect(() => {
    const activityEvents = ['mousemove', 'keydown', 'click'];
    const resetTimer = () => {
      clearTimeout(window.inactivityTimer);
      window.inactivityTimer = setTimeout(resetInactivityTimer, inactivity_timeout);
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    //initial inactivity timer
    window.inactivityTimer = setTimeout(resetInactivityTimer, inactivity_timeout);

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
      clearTimeout(window.inactivityTimer);
    };
  }, []);

  //if they havent logged in yet, send them to the login page
  if (!email) {
    return <LogIn setEmail={setEmail} setIsAdmin={setIsAdmin}/>
  }

  //regular paths of the website
  return (
    <Router>
      <Header isAdmin={isAdmin} logOut={logOut}/>
      <Routes>
        <Route path="" element={<Dashboard isAdmin={isAdmin} />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/report" element={<Report />} />
        <Route path="/statistics" element={<Statistics />} />
        <Route path="/users" element={<Users isAdmin={isAdmin} />} />
        <Route path="/reservations" element={<Reservations />} />
        <Route path="/create-reservation" element={<CreateReservation />} />
        <Route path="/check-in-out" element={<CheckInOut />} />
      </Routes>
    </Router>
  );
};

export default App