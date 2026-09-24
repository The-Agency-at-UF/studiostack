
import React, { useEffect, useState } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import AddTeamPopup from '../../components/AddTeamPopup';
import RemoveTeamPopup from '../../components/RemoveTeamPopup';

function Teams({ isAdmin }) { 
    const [teams, setTeams] = useState([]);
    const [message, setMessage] = useState(null);

    // retrive all teams 
    useEffect(() => {
        // listens and updates in real time
        const teamsRef = collection(db, 'teams');
        const unsubscribe = onSnapshot(teamsRef, (snapshot) => {
            // get teams from the teams collection 
            const teamNames = snapshot.docs.map((doc) => ({ 
                name: doc.id,
                ...doc.data()
            }));
            setTeams(teamNames);
        });
        return unsubscribe;
    }, []);

    // adds team to database
    const addTeam = (isClient, team) => {  
        try {
            const teamRef = doc(db, 'teams', team);
            if (isClient == true) {
                setDoc(teamRef, {type: "Client"});
            } else {
                setDoc(teamRef, {type: "Internal"});
            }
            setMessage({ text: "Team added successfully.", type: "success" });
        }
        catch(error) {
            setMessage({ text: "Error adding team to database.", type: "error" });
            console.log("Error adding team to database:", error);
        }
    }

    // remove team from database
    const removeTeam = (team) => {  
        try {
            deleteDoc(doc(db, "teams", team));
            setMessage({ text: "Team removed successfully.", type: "success" });
        }
        catch(error) {
            setMessage({ text: "Error removing team from database.", type: "error" });
            console.log("Error removing team from database.", error);
        }
    }

    return (
        <div className='bg-white m-8 p-8 rounded-lg relative'>
            <div className='pl-2 pr-2'>
                <h1 className='font-bold text-2xl md:text-3xl pb-6'>Teams</h1>
                {message && (
                    <div className={`p-4 mb-4 rounded ${message.type === 'success' ? 'bg-green-100 text-green-800 border border-green-400' : 'bg-red-100 text-red-800 border border-red-400'}`}>
                        {message.text}
                        <button onClick={() => setMessage(null)} className="float-right font-bold">×</button>
                    </div>
                )}
                {
                  isAdmin && 
                    <div className="absolute top-8 right-8 flex space-x-4">
                        <AddTeamPopup addTeam={addTeam}/>
                        <RemoveTeamPopup removeTeam={removeTeam} listOfTeams={teams.map(team => team.name)}/>
                  </div>
                }
            </div>
            <div className="p-4">
                <div className="flex py-2 font-semibold">
                    <div className="flex-1 pl-4">Name</div>
                    <div className="flex-1 pr-4 sm:pr-0 sm:text-left text-right">Type</div>
                </div>
                <ul>
                    {teams.map((team) => (
                        <li key={team.name} className="flex py-2 border-t">
                            <div className="flex-1 pl-4 text-sm sm:text-base">{team.name}</div>
                            <div className="flex-1 pr-4 sm:pr-0 sm:text-left text-right text-sm sm:text-base">{team.type}</div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
  }
  
  export default Teams;