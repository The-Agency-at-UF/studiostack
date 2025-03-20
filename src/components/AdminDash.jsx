import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom';
import { collection, setDoc, deleteDoc, getDocs, doc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import AddTeamPopup from './AddTeamPopup';
import RemoveTeamPopup from './RemoveTeamPopup';

function AdminDash() {
  const navigate = useNavigate();
  const [teamsList, setTeamsList] = useState([]);

  useEffect(() => {
    const fetchTeams = async () => {
        try {
            const teamsRef = collection(db, "teams");
            const querySnapshot = await getDocs(teamsRef);
                
            // get the teams stored in the database
            const teams = querySnapshot.docs.map(doc => ({
                teams: doc.id, 
                ...doc.data()
            }));
            setTeamsList(teams);

        } catch(error) {
            console.log("Error fetching teams from database", error)
        }
    }
    fetchTeams();
  }, [])

  // adds team to database
  const addTeam = (team) => {  
    try {
        const teamRef = doc(db, 'teams', team);
        setDoc(teamRef, {});
        alert("Team added successfully.");
    }
    catch(error) {
        alert("Error adding team to database.");
        console.log("Error adding team to database:", error);
    }
  }

  // remove team from database
  const removeTeam = (team) => {  
    try {
        deleteDoc(doc(db, "teams", team));
        alert("Team removed successfully");
    }
    catch(error) {
        alert("Error removing team from database.");
        console.log("Error removing team from database.", error);
    }
  }

  return (
    <div>
        <h1 className='font-bold text-2xl md:text-3xl pb-6'>Welcome, Admin!</h1>
        <div className="container py-4"> 
            <div className="flex flex-col md:flex-row gap-4"> 
                <div className="flex-1 p-4 rounded"> 
                    <div className="bg-[#ECECEC] w-full p-2 rounded-md flex items-center justify-between mb-2"> 
                    Statistics Section
                    </div>                          
                </div>
                <div className="flex flex-col p-4 lg:w-1/3"> 
                    <button 
                        onClick={() => navigate('/reports')}
                        className="px-6 py-2 bg-[#D1E0EF] hover:bg-[#426276] hover:text-white rounded-md text-lg sm:text-xl font-bold cursor-pointer mb-4"> 
                        View Reports
                    </button>      
                    <button 
                        onClick={() => navigate('/inventory')}
                        className="px-6 py-2 bg-[#D1E0EF] hover:bg-[#426276] hover:text-white rounded-md text-lg sm:text-xl font-bold cursor-pointer mb-4"> 
                        Update Inventory
                    </button>       
                     <AddTeamPopup addTeam={addTeam}/> 
                     <RemoveTeamPopup removeTeam={removeTeam} listOfTeams={teamsList.map(team => team.teams)}/>                     
                </div>
            </div>
        </div>
    </div>
  )
}

export default AdminDash