import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { getDocs, collection } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import './Calendar.css';

const CalendarPage = () => {
  const [reservations, setReservations] = useState([]);
  const [calendarHeight, setCalendarHeight] = useState('auto');
  const [selectedReservation, setSelectedReservation] = useState(false);
  const [reservation, setReservation] = useState(null);

  const handleEventClick = (reservationClicked) => {
    setReservation(reservationClicked.event);
    setSelectedReservation(true);
  }

  useEffect(() => {
    const fetchReservations = async () => {
      try {
        const reservationsRef = collection(db, 'reservations');
        const querySnapshot = await getDocs(reservationsRef);

        let allReservationsList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          title: doc.data().name,
          start: doc.data().startDate.toDate(),
          end: doc.data().endDate.toDate(),
          equipment: doc.data().equipmentIDs
        }));

        setReservations(allReservationsList);
      } catch (error) {
        console.error("Error fetching reservations:", error);
      }
    };

    fetchReservations();

    const handleResize = () => {
      setCalendarHeight(window.innerHeight + (window.innerHeight / 5));
    };
    handleResize();

    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);


  return (
    <div className='m-8 bg-white p-8 rounded-md'>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView='dayGridMonth'
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay'
        }}
        events={reservations}
        dayMaxEvents={true}
        eventColor='#A3C1E0'
        eventTextColor='black'
        height={calendarHeight} 
        eventClick={handleEventClick}
      />

      <div className='mt-8'>
        {selectedReservation && (
          <div>
            <div>
              <h1 className='font-bold text-2xl sm:text-3xl py-2'>{reservation.title}: </h1>
              <p className='text-lg sm:text-xl py-2'>{reservation.start.toLocaleString()} - {reservation.end.toLocaleString()}</p>
            </div>
            <div className='flex'>
              <p className='text-lg sm:text-xl py-2'>Equipment Reserved: </p>
              <ul className='pl-4 min-w-1/4'>
                {reservation.extendedProps.equipment.map((equipment, index) => (
                  <li key={index} className='text-base sm:text-lg border-b p-2'>{equipment.name}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>

  );
}

export default CalendarPage;
