import React, { useEffect, useState } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { getDocs, collection, doc } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';

const localizer = momentLocalizer(moment);

const CalendarPage = () => {
  const [reservations, setReservations] = useState([]);

  useEffect(() => {
    const fetchReservations = async () => {
      const reservationsRef = collection(db, 'reservations');
      const querySnapshot = await getDocs(reservationsRef);

      const allReservationsList = querySnapshot.docs.map(doc => ({
        title: doc.data().name,
        start: doc.data().startDate.toDate(),
        end: doc.data().endDate.toDate(), 
      }));

      setReservations(allReservationsList);
    }

    fetchReservations();
  }
  , []);

  return (
    <div>
      <Calendar
        localizer={localizer}
        events={reservations}
        startAccessor="start"
        endAccessor="end"
        style={{ height: '75vh', backgroundColor: 'white'}}
        popup
      />
    </div>
  );
}

export default CalendarPage;