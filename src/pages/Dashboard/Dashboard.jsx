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
      }
    };
    fetchUpcomingReservations()
  })


  return (
    <div>
      <div className='bg-white m-8 p-8 rounded-lg relative'>
        {isAdmin ? <AdminDash/> : <StudentDash/>}
      </div>
      <div className='bg-white m-8 p-8 rounded-lg'>
          <h1 className='font-bold text-xl md:text-2xl pb-3 border-b'>Upcoming Reservations</h1>
          { noReservations ? 
            <p className='mt-4'>You have no upcoming reservations!</p> 
          :
            <div className='flex flex-row gap-4 overflow-y-scroll'>
              {upcomingReservations.map((reservation, index) => (
                  <UpcomingReservationLabel key={index} reservation={reservation} backgroundColor={'#426276'}/>
              ))} 
            </div>
          }
      </div>
      <div className='bg-white m-8 p-8 rounded-lg relative'>
        <h1 className='font-bold text-xl md:text-2xl pb-3'>Reserved Equipment</h1>
        { noReservations ? 
          <div className='border-t'>
            <p className='mt-4'>You have no equipment reserved!</p> 
          </div>
        :
        <div>
          <div className="flex py-2 font-semibold">
            <div className="flex-1 pl-4">Item</div>
            <div className="flex-1">ID</div>
          </div>
          <ul>
            {upcomingReservations.map((reservation) => (
              <li key={reservation.reservationId}>
                  <ul>
                  {reservation.equipmentIDs.map((item) => (
                    <li key={item.id} className="flex py-2 border-t">
                        <div className="flex-1 pl-4 text-sm md:text-base">{item.name}</div>
                        <div className="flex-1 text-sm md:text-base">{item.id}</div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
        }
      </div>
    </div>
  );
}

export default Dashboard;