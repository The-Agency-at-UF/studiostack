import React, { useEffect, useState } from 'react'
import { db, collection, getDocs, doc, updateDoc } from '../data/localStore';
import Calendar from 'react-calendar'
import StudentNotification from './StudentNotification';

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
                id: doc.id,
                ...doc.data()
            }));

            // get user's notifications
            const userNotifications = notifs.filter(notification => notification.userEmail === localStorage.getItem('email'));

            // filter notifs by type and check that it hasn't been already closed
            const reportNotifs = userNotifications.filter(notification =>
              notification.type === "report" &&
              notification.resolved == true &&
              notification?.userClosed === false
            );
            const overdueNotifs = userNotifications.filter(notification =>
              notification.type === "overdue" &&
              notification?.userClosed === false
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
            console.log("Error fetching notifications from database", error)
        }
    }
    fetchNotifications();
  }, [])

  // close notification
  const closeNotif = async (notificationID) => {
    try {
        const notifRec = doc(db, 'notifications', notificationID);
        updateDoc(notifRec, {
            userClosed: true
        });
    }
    catch(error) {
        console.log("Could not close notification", error);
    }
  }

  return (
    <div className="student-dash">
        <div className="control-panel-heading">
          <div><p className="eyebrow">Your production desk</p><h2>Welcome, Student!</h2></div>
        </div>
        <div className="student-dash-grid">
                <div className="calendar-well">
                      <Calendar
                      />
                </div>
                <div className="notification-well">
                    <div className="subsection-heading"><h3>Notifications</h3><span>{notifications.length.toString().padStart(2, '0')}</span></div>
                    <div className='notification-list'>
                      { noNotifications ?
                        <div className="dark-empty-state"><span>All clear</span><p>You have no notifications!</p></div>
                      :
                        <div>
                          {notifications.map((notification, index) => (
                            <StudentNotification key={index} notification={notification} type={notification.type} closeNotif={closeNotif} canClose={true} iconColor={'#426276'} backgroundColor={'#D1E0EF'}/>
                          ))}
                        </div>
                      }
                    </div>
                </div>
        </div>
    </div>
  )
}

export default StudentDash
