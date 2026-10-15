import React, { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { db, getDocs, collection } from '../../data/localStore';
import type { EventClickArg } from '@fullcalendar/core'
import type { Equipment } from '../../types/models'

export interface CalendarReservation {
  id: string
  title: string
  start: Date
  end: Date
  equipment: Equipment[]
  email: string
  checkedOutItems: Equipment[]
  checkedInItems: Equipment[]
  team: string
}

const Calendar = ({ isAdmin }: { isAdmin: boolean }) => {
  const [reservations, setReservations] = useState<CalendarReservation[]>([]);
  const [calendarHeight, setCalendarHeight] = useState<string | number>("auto");
  const [selectedReservation, setSelectedReservation] = useState(false);
  const [reservation, setReservation] = useState<(CalendarReservation & { extendedProps: CalendarReservation }) | null>(null);

  //getting which reservation was selected
  const handleEventClick = (reservationClicked: EventClickArg) => {
    const selected = reservations.find(item => item.id === reservationClicked.event.id)
    if (!selected) return
    setReservation({ ...selected, extendedProps: selected });
    setSelectedReservation(true);

    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const fetchReservations = async () => {
      try {
        const reservationsRef = collection(db, "reservations");
        const querySnapshot = await getDocs(reservationsRef);

        const allReservationsList = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          title: doc.data().name,
          start: doc.data().startDate.toDate(),
          end: doc.data().endDate.toDate(),
          equipment: doc.data().equipmentIDs,
          email: doc.data().userEmail,
          checkedOutItems: doc.data().checkedOutItems,
          checkedInItems: doc.data().checkedInItems,
          team: doc.data().team,
        }));

        setReservations(allReservationsList);
        // console.log(allReservationsList);
      } catch (error) {
        console.error("Error fetching reservations:", error);
      }
    };

    fetchReservations();

    //resizing for the different screen sizes
    const handleResize = () => {
      setCalendarHeight(window.innerHeight + window.innerHeight / 5);
    };
    handleResize();

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="workspace-surface calendar-workspace m-8 bg-white p-8 rounded-md">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        events={reservations}
        dayMaxEvents={true}
        eventColor="var(--accent-light)"
        eventTextColor="black"
        height={calendarHeight}
        eventClick={handleEventClick}
      />

      <div className="calendar-selection mt-8 sm:p-4">
        {selectedReservation && reservation && (
          <div>
            <div>
              <h1 className="font-bold text-2xl sm:text-3xl py-2">
                {reservation.title}
              </h1>
              <p className="text-lg sm:text-xl py-2">
                <span className="font-semibold">Team:</span>{" "}
                {reservation.extendedProps.team}
              </p>
              <p className="text-lg sm:text-xl py-2">
                {reservation.start.toLocaleString()} -{" "}
                {reservation.end.toLocaleString()}
              </p>
              {isAdmin && (
                <p className="text-lg sm:text-xl py-2">
                  {" "}
                  <span className="font-semibold">Reserved by:</span>{" "}
                  {reservation.extendedProps.email}
                </p>
              )}
            </div>
            {isAdmin ? (
              <div>
                <p className="text-lg sm:text-xl py-2 font-semibold">
                  Equipment Reserved:{" "}
                </p>
                <div className="flex py-2 font-semibold">
                  <div className="flex-1 pl-4">Item</div>
                  <div className="flex-1">ID</div>
                  <div className="flex-1 pr-4 sm:pr-0 sm:text-left text-right">
                    Status
                  </div>
                </div>
                <ul>
                  {reservation.extendedProps.equipment.map(
                    (equipment, index) => (
                      <li key={index} className="flex py-2 border-t">
                        <div className="flex-1 pl-4 text-sm md:text-base">
                          {equipment.name}
                        </div>
                        <div className="flex-1 text-left text-sm md:text-base">
                          {equipment.id}
                        </div>
                        <div className="flex-1 pr-4 sm:pr-0 sm:text-left text-right text-sm md:text-base">
                          Awaiting Checkout
                        </div>
                      </li>
                    ),
                  )}
                  {reservation.extendedProps.checkedOutItems.map(
                    (equipment, index) => (
                      <li key={index} className="flex py-2 border-t">
                        <div className="flex-1 pl-4 text-sm md:text-base">
                          {equipment.name}
                        </div>
                        <div className="flex-1 text-sm md:text-base">
                          {equipment.id}
                        </div>
                        <div className="flex-1 pr-4 sm:pr-0 sm:text-left text-right text-sm md:text-base">
                          Checked Out
                        </div>
                      </li>
                    ),
                  )}
                  {reservation.extendedProps.checkedInItems.map(
                    (equipment, index) => (
                      <li key={index} className="flex py-2 border-t">
                        <div className="flex-1 pl-4 text-sm md:text-base">
                          {equipment.name}
                        </div>
                        <div className="flex-1 text-sm md:text-base">
                          {equipment.id}
                        </div>
                        <div className="flex-1 pr-4 sm:pr-0 sm:text-left text-right text-sm md:text-base">
                          Checked In
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ) : (
              <div className="flex">
                <p className="text-lg sm:text-xl py-2">Equipment Reserved: </p>
                <ul className="pl-4 min-w-1/4">
                  {reservation.extendedProps.equipment.map(
                    (equipment, index) => (
                      <li
                        key={index}
                        className="text-base sm:text-lg border-b p-2"
                      >
                        {equipment.name}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Calendar;
