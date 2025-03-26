import React, { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import Calendar from 'react-calendar'
import Notification from './Notification';
import '../pages/Calendar/MiniCalendar.css'

function StudentDash() {
  const [notifications, setNotifications] = useState([])
  const [noNotifications, setNoNotifications] = useState(false);

  useEffect(() => {
    const fetchNotifications = async () => {
        try {
            const notificationsRef = collection(db, "notifications");
            const querySnapshot = await getDocs(notificationsRef);
                
            // get the notifications stored in the database
            const notifs = querySnapshot.docs.map(doc => ({
                notification: doc.id, 
                ...doc.data()
            }));
            
            // get user's notifications
            const userNotifications = notifs.filter(notification => notification.userEmail === localStorage.getItem('email'));

            const reportNotifs = userNotifications.filter(notif => notif.type == "report");
            const overdueNotifs = userNotifications.filter(notif => notif.type == "overdue");
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
  }, [notifications])

  return (
    <div>
        <h1 className='font-bold text-2xl md:text-3xl pb-6'>Welcome, Student!</h1>
        <div className="w-full"> 
            <div className="flex flex-col md:flex-row"> 
                <div className="flex-1 p-3 rounded"> 
                    <div className="bg-[#ECECEC] p-2 rounded-[10px] flex items-center justify-between mb-2"> 
                      <Calendar
                      />
                    </div>                          
                </div>
                <div className="flex flex-col p-4 h-87 lg:w-3/4">
                    <div className="bg-[#ECECEC] p-4 rounded-[10px] items-center justify-between mb-2 sticky"> 
                      <h1 className='text-xl font-bold'>Notifications </h1> 
                    </div>  
                    <div className='overflow-scroll'>
                      { noNotifications ? 
                        <p className='justify-self-center mt-30'>You have no notifications!</p> 
                      :
                        <div>
                          {notifications.map((notification, index) => ( 
                            <Notification key={index} notification={notification} type={notification.type}/>
                          ))}
                        </div>
                      }
                    </div>
                </div>
            </div>
        </div>
    </div>
  )
}

export default StudentDash