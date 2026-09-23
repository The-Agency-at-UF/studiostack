import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import AdminNotification from './AdminNotification';
import { HiOutlineArrowUpRight } from "react-icons/hi2";

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
  }, [])


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
    <div className="admin-dash">
        <div className="control-panel-heading">
          <div><p className="eyebrow">Command center</p><h2>Welcome, Admin!</h2></div>
        </div>
        <div className="admin-dash-grid">
          <div className="notification-well">
            <div className="subsection-heading">
              <h3>Notifications</h3>
              <span>{notifications.length.toString().padStart(2, '0')}</span>
            </div>
            <div className='notification-list'>
                        { noNotifications ? 
                            <div className="dark-empty-state"><span>All clear</span><p>You have no notifications!</p></div>
                        :
                            <div>
                            {notifications.map((notification, index) => ( 
                                <AdminNotification key={index} notification={notification} type={notification.type} closeNotif={closeNotif}/>
                            ))}
                            </div>
                        }
            </div>
          </div>
          <div className="quick-actions">
            <div className="subsection-heading"><h3>Quick actions</h3><span>04</span></div>
            {[
              ['/reports', 'Review reports', 'Issues & resolutions'],
              ['/teams', 'Manage teams', 'Assignments & clients'],
              ['/users', 'Manage users', 'Roles & access'],
              ['/inventory', 'Update inventory', 'Gear & availability'],
            ].map(([path, label, detail], index) => (
              <button key={path} onClick={() => navigate(path)} className="quick-action">
                <span className="action-index">0{index + 1}</span>
                <span><strong>{label}</strong><small>{detail}</small></span>
                <HiOutlineArrowUpRight />
              </button>
            ))}
          </div>
        </div>
    </div>
  )
}

export default AdminDash
