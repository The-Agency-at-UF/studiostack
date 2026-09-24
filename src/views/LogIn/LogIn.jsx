import React, { useEffect, useState } from "react";
import { getAuth, setPersistence, signInWithPopup, browserSessionPersistence, GoogleAuthProvider } from "firebase/auth";
import { db } from '../../firebase/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import logo from '../../assets/studioByAgency.png';
import googleSignIn from '../../assets/googleSignIn.png';

function LogIn({ setEmail, setIsAdmin }) {
    const [error, setError] = useState(null);

    //signs in with Google and checks if the email exists in the database
    const handleClick = async () => {
        try {
            const auth = getAuth();
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({
                prompt: "select_account",
            });

            await setPersistence(auth, browserSessionPersistence);

            const data = await signInWithPopup(auth, provider);
            const email = data.user.email;

            //check if the email exists in the 'users' collection in Firestore
            const userRef = doc(db, "users", email);
            const userDoc = await getDoc(userRef);

            if (userDoc.exists()) {
                setEmail(email);
                setIsAdmin(userDoc.data().isAdmin);
                localStorage.setItem("email", email);
                localStorage.setItem("isAdmin", userDoc.data().isAdmin);
            } else {
                setError('Unable to authorize your email. Please contact the production department manager.');
            }
        } catch (err) {
            console.error('Error during sign-in:', err);
            setError('Sign-in failed, please try again.');
        }
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
              <img src={googleSignIn.src ?? googleSignIn} className="google-sign-in" onClick={handleClick} alt="Sign In with Google"/>
              {error && <p className="login-error">{error}</p>}
            </div>
            <small>For approved students and production staff.</small>
          </div>
        </div>
    );
}

export default LogIn;
