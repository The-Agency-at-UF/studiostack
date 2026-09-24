import React, { useState, useEffect } from 'react'
import { getDocs, collection } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import StudentDash from "../../components/StudentDash";
import AdminDash from "../../components/AdminDash";
import UpcomingReservationLabel from '../../components/UpcomingReservationLabel';

function Dashboard({ isAdmin }) {
  const [upcomingReservations, setUpcomingReservations] = useState([]);
  const [noReservations, setNoReservations] = useState(false);
  const currentDate = new Date();

  useEffect(() => {
    // display upcoming reservations
    const fetchUpcomingReservations = async () => {
      try {
        const reservationsRef = collection(db, 'reservations');
        const querySnapshot = await getDocs(reservationsRef);

        const reservationsList = querySnapshot.docs.map(doc => ({
          reservationId: doc.id,
          ...doc.data()
        }));

        // get reservations under user's email
        const userReservations = reservationsList.filter(reservation => reservation.userEmail === localStorage.getItem('email'));

        // check that it is upcoming (active) and not a past reservation
        const reservations = userReservations.filter((reservation) => {
          const endDate = reservation.endDate.toDate();
          return endDate >= currentDate;
        });

        // there are no active reservations under this user's name
        if (reservations.length == 0) {
          setNoReservations(true);
        }

        // reservations are sorted by earliest start date
        setUpcomingReservations(reservations.sort((a, b) => a.startDate.toDate() - b.startDate.toDate()));

      } catch (error) {
        console.log("Error fetching upcoming reservations", error);
        setNoReservations(true);
      }
    };
    fetchUpcomingReservations()
  }, [])

  const reservedEquipment = upcomingReservations.flatMap((reservation) => reservation.equipmentIDs || []);
  const today = currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });


  return (
    <main className="dashboard-page">
      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">Studio operations / {today}</p>
          <h1>Keep the work<br/><em>moving.</em></h1>
        </div>
        <div className="dashboard-metrics" aria-label="Current workspace summary">
          <div><strong>{upcomingReservations.length}</strong><span>Upcoming bookings</span></div>
          <div><strong>{reservedEquipment.length}</strong><span>Reserved items</span></div>
          <div><strong>{isAdmin ? 'A' : 'S'}</strong><span>{isAdmin ? 'Admin workspace' : 'Student workspace'}</span></div>
        </div>
      </section>

      <section className="dashboard-panel dashboard-panel-dark">
        {isAdmin ? <AdminDash/> : <StudentDash/>}
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-panel bookings-panel">
          <div className="section-heading">
            <div><p className="eyebrow">Next up</p><h2>Upcoming Reservations</h2></div>
            <a href="/reservations">View all <span>↗</span></a>
          </div>
          { noReservations ?
            <div className="empty-state"><span>01</span><p>You have no upcoming reservations!</p></div>
          :
            <div className='reservation-strip'>
              {upcomingReservations.map((reservation, index) => (
                  <UpcomingReservationLabel key={index} reservation={reservation} backgroundColor={'#111111'}/>
              ))}
            </div>
          }
        </section>

        <section className="dashboard-panel equipment-panel">
        <div className="section-heading"><div><p className="eyebrow">In your care</p><h2>Reserved Equipment</h2></div></div>
        { noReservations ?
          <div className="empty-state"><span>00</span><p>You have no equipment reserved!</p></div>
        :
        <div className="equipment-table">
          <div className="equipment-row equipment-row-head">
            <div>Item</div>
            <div>ID</div>
          </div>
          <ul>
            {upcomingReservations.map((reservation) => (
              <li key={reservation.reservationId}>
                  <ul>
                  {reservation.equipmentIDs.map((item) => (
                    <li key={item.id} className="equipment-row">
                        <div>{item.name}</div>
                        <div>{item.id}</div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
        }
        </section>
      </div>
    </main>
  );
}

export default Dashboard;
