import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import AdminNotification from './AdminNotification';

function AdminDash() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([])
  const [noNotifications, setNoNotifications] = useState(false);

  useEffect(() => {

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
            const userNotifications = notifs.filter(notification => notification.userEmail !== localStorage.getItem('email'));

            // filter notifs by type and check that it hasn't been already closed
            const reportNotifs = userNotifications.filter(notification => 
                notification.type === "report" && 
                notification.resolved === false && 
                notification?.adminClosed != true
            );
            const overdueNotifs = userNotifications.filter(notification => 
                notification.type === "overdue" && 
                notification.resolved === false && 
                notification?.adminClosed != true
            );
            const notifList = [...reportNotifs, ...overdueNotifs]

            // user has no notifications
            if (notifList.length == 0) {
              setNoNotifications(true);
            } else {
              // sort notifications by most recent
              console.log("admin list:", notifList)
              setNotifications(notifList.sort((a, b) => b.time.toDate() - a.time.toDate()));
            }

        } catch(error) {
            console.log("Error fetching reports from database", error)
        }
    }
    fetchNotifications();
  }, [notifications])


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
                    <div className="flex flex-col p-4 h-75">
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
                        onClick={() => navigate('/teams')}
                        className="px-6 py-2 bg-[#D1E0EF] hover:bg-[#426276] hover:text-white rounded-md text-lg sm:text-xl font-bold cursor-pointer mb-4"> 
                        Update Teams
                    </button>
                    <button 
                        onClick={() => navigate('/users')}
                        className="px-6 py-2 bg-[#D1E0EF] hover:bg-[#426276] hover:text-white rounded-md text-lg sm:text-xl font-bold cursor-pointer mb-4"> 
                        Update Users
                    </button> 
                    <button 
                        onClick={() => navigate('/inventory')}
                        className="px-6 py-2 bg-[#D1E0EF] hover:bg-[#426276] hover:text-white rounded-md text-lg sm:text-xl font-bold cursor-pointer mb-4"> 
                        Update Inventory
                    </button>             
                </div>
            </div>
        </div>
    </div>
  )
}

export default AdminDash