import React, { useEffect } from "react";
import logo from '../../assets/studioByAgency.png';

function LogIn({ setEmail, setIsAdmin }) {
    const handleClick = () => {
        const email = 'demo@studiostack.com';
        setEmail(email);
        setIsAdmin(true);
        localStorage.setItem('email', email);
        localStorage.setItem('isAdmin', 'true');
    };

    //checks if the email and isAdmin are stored in the local storage
    useEffect(() => {
        const storedEmail = localStorage.getItem('email');
        const storedIsAdmin = localStorage.getItem('isAdmin');
        if (storedEmail) {
            setEmail(storedEmail);
        }
        if (storedIsAdmin) {
            setIsAdmin(storedIsAdmin);
        }
    }, [setEmail, setIsAdmin]);

    return (
        <div className="login-page">
          <div className="login-statement">
            <p className="eyebrow">The Agency at UF / Production operations</p>
            <h1>Gear ready.<br/><em>Ideas rolling.</em></h1>
            <p>One place to book, track, and return the tools behind the work.</p>
          </div>
          <div className="login-panel">
            <img src={logo.src ?? logo} className="login-logo" alt="StudioStack by The Agency"/>
            <div>
              <p className="eyebrow">Authorized access</p>
              <h2>Enter the studio.</h2>
              <button type="button" className="google-sign-in" onClick={handleClick}>Continue to StudioStack</button>
            </div>
            <small>For approved students and production staff.</small>
          </div>
        </div>
    );
}

export default LogIn;
