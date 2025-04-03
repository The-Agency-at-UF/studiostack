import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom';
import { collection, setDoc, deleteDoc, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import AddTeamPopup from './AddTeamPopup';
import RemoveTeamPopup from './RemoveTeamPopup';
import AdminNotification from './AdminNotification';

function AdminDash() {
  const navigate = useNavigate();
  const [teamsList, setTeamsList] = useState([]);
  const [notifications, setNotifications] = useState([])
  const [noNotifications, setNoNotifications] = useState(false);

  useEffect(() => {
    // fetch teams from DB
    const fetchTeams = async () => {
        try {
            const teamsRef = collection(db, "teams");
            const querySnapshot = await getDocs(teamsRef);
                
            // get the teams stored in the database
            const teams = querySnapshot.docs.map(doc => ({
                id: doc.id, 
                ...doc.data()
            }));
            setTeamsList(teams);

        } catch(error) {
            console.log("Error fetching teams from database", error)
        }
    }

    // fetch notifications from DB
    const fetchNotifications = async () => {
        try {
            const notificationsRef = collection(db, "notifications");
            const querySnapshot = await getDocs(notificationsRef);
                
            // get the notifications stored in the database
            const notifs = querySnapshot.docs.map(doc => ({
                id: doc.id, 
                ...doc.data()
            }));
            
            // do not notify admin of their own report notification
            const userEmail = localStorage.getItem('email');
            const userNotifications = notifs.filter(notification => 
                !(notification.type === "report" && notification.userEmail === userEmail)
            );

            // filter notifs by type and check that it hasn't been already closed
            const reportNotifs = userNotifications.filter(notification => 
                notification.type === "report" && 
                notification.resolved === false && 
                notification?.adminClosed != true
            );
            const overdueNotifs = userNotifications.filter(notification => 
                notification.type === "overdue" &&
                notification?.adminClosed != true
            );
            const notifList = [...reportNotifs, ...overdueNotifs]

            // user has no notifications
            if (notifList.length == 0) {
              setNoNotifications(true);
            } else {
              // sort notifications by most recent
              setNotifications(notifList.sort((a, b) => b.time.toDate() - a.time.toDate()));
            }

        } catch(error) {
            console.log("Error fetching reports from database", error)
        }
    }
    fetchNotifications();
    fetchTeams();
  }, [teamsList], [notifications])

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

  // close notification
  const closeNotif = async (notificationID) => {
    try {
        const notifRec = doc(db, 'notifications', notificationID);
        updateDoc(notifRec, {
            adminClosed: true
        });
    }
    catch(error) {
        console.log("Could not close notification", error);
    }
  }

  return (
    <div>
        <h1 className='font-bold text-2xl md:text-3xl pb-6'>Welcome, Admin!</h1>
        <div className="py-4"> 
            <div className="flex flex-col md:flex-row gap-4"> 
                <div className="flex-1 rounded"> 
                    <div className="flex flex-col p-4 h-87">
                        <div className="bg-[#ECECEC] p-4 rounded-[10px] items-center justify-between mb-2 sticky"> 
                            <h1 className='text-xl font-bold'>Notifications </h1> 
                        </div>  
                        <div className='overflow-scroll'>
                        { noNotifications ? 
                            <p className='justify-self-center mt-30'>You have no notifications!</p> 
                        :
                            <div>
                            {notifications.map((notification, index) => ( 
                                <AdminNotification key={index} notification={notification} type={notification.type} closeNotif={closeNotif}/>
                            ))}
                            </div>
                        }
                        </div>
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
                     <RemoveTeamPopup removeTeam={removeTeam} listOfTeams={teamsList.map(team => team.id)}/>                     
                </div>
            </div>
        </div>
    </div>
  )
}

export default AdminDash