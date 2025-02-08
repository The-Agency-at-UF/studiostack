import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { getAuth, signOut } from "firebase/auth";
import Dashboard from './pages/Dashboard/Dashboard';
import LogIn from './pages/LogIn/LogIn';
import Users from "./pages/Users/Users";
import './App.css';

const App = () => {

  //email that the user logged in with
  const [email,setEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

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
      <Routes>
      <Route path="" element={<Dashboard isAdmin={isAdmin} logOut={logOut} />} />
      <Route path="/users" element={<Users isAdmin={isAdmin} />} />
      </Routes>
    </Router>
  );
};

export default App
