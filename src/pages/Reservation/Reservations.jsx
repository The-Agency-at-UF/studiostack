import React, { useEffect, useState } from "react";
import { getDocs, collection, deleteDoc, doc } from "firebase/firestore";
import { IoIosAddCircle } from "react-icons/io";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase/firebaseConfig";
import ReservationLabel from "../../components/ReservationLabel";
import StudentNotification from "../../components/StudentNotification";
import ConfirmationPopup from "../../components/ConfirmationPopup";

function Reservations() {
  const [reservations, setReservations] = useState([]);
  const [activeReservations, setActiveReservations] = useState([]);
  const [pastReservations, setPastReservations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();
  const currentDate = new Date();
  const isAdmin = localStorage.getItem("isAdmin") === "true";

  const handleDeleteReservation = async (reservationId) => {
    try {
      if (!isAdmin) {
        console.error("Only admins can delete reservations");
        return;
      }
      await deleteDoc(doc(db, "reservations", reservationId));
      setPastReservations((prev) =>
        prev.filter((r) => r.reservationId !== reservationId),
      );
    } catch (error) {
      console.error("Error deleting reservation:", error);
    }
  };

  useEffect(() => {
    const fetchReservations = async () => {
      try {
        const reservationsRef = collection(db, "reservations");

        //get all the reservations in the 'reservations' collection
        const querySnapshot = await getDocs(reservationsRef);

        //map through each reservation and extract the data
        const allReservationsList = querySnapshot.docs.map((doc) => ({
          reservationId: doc.id,
          ...doc.data(),
        }));

        const allReservations = allReservationsList.filter(
          (reservation) =>
            reservation.userEmail === localStorage.getItem("email"),
        );
        setReservations(allReservations);

        //get the active reservations & sort
        const activeReservationsList = allReservations.filter((reservation) => {
          const endDate = reservation.endDate.toDate();
          return endDate >= currentDate;
        });

        activeReservationsList.sort((a, b) => {
          return a.startDate.toDate() - b.startDate.toDate();
        });
        setActiveReservations(activeReservationsList);

        //get the past reservations & sort
        const pastReservationsList = allReservations.filter((reservation) => {
          const endDate = reservation.endDate.toDate();
          return endDate < currentDate;
        });

        pastReservationsList.sort((a, b) => {
          return b.startDate.toDate() - a.startDate.toDate();
        });
        setPastReservations(pastReservationsList);
      } catch (error) {
        console.error("Error fetching reservations:", error);
      }
    };
    fetchReservations();

    //fetch overdue equipment notifications
    const fetchOverdueEquipment = async () => {
      try {
        const notifRef = collection(db, "notifications");
        const querySnapshot = await getDocs(notifRef);

        const allNotifications = querySnapshot.docs
          .filter(
            (doc) =>
              doc.data().type === "overdue" &&
              doc.data().userClosed === false &&
              doc.data().userEmail === localStorage.getItem("email"),
          )
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

        setNotifications(
          allNotifications.sort((a, b) => b.time.toDate() - a.time.toDate()),
        );
      } catch (error) {
        console.error("Error fetching overdue equipment:", error);
      }
    };

    fetchOverdueEquipment();
  }, []);

  return (
    <div>
      <div className="bg-white m-8 p-8 rounded-lg relative">
        <div className="pl-2 pr-2">
          {notifications.length === 0 ? (
            <div className="absolute top-6 right-6 sm:top-8 sm:right-8 flex space-x-4 hover:scale-110 hover:cursor-pointe">
              <IoIosAddCircle
                color="#426276"
                className="w-8 h-8 sm:w-10 sm:h-10"
                onClick={() => navigate("/create-reservation")}
              />
            </div>
          ) : (
            <div>
              <div className="pb-8">
                {notifications.map((notification, index) => (
                  <StudentNotification
                    key={index}
                    notification={notification}
                    type={notification.type}
                    canClose={false}
                    iconColor={"#EB3223"}
                    backgroundColor={"#f7ada7"}
                  />
                ))}
              </div>
              <div className="absolute top-32 sm:top-33 right-6 sm:right-8 flex space-x-4 hover:scale-110 hover:cursor-pointer">
                <IoIosAddCircle
                  color="#426276"
                  className="w-8 h-8 sm:w-10 sm:h-10"
                  onClick={() => navigate("/create-reservation")}
                />
              </div>
            </div>
          )}

          <div>
            <h1 className="font-bold text-2xl md:text-3xl pb-6">
              Active Reservations
            </h1>
            {activeReservations.length === 0 ? (
              <div className="border-t">
                <p className="mt-4">You have no active reservations!</p>
              </div>
            ) : (
              <div className="w-full">
                {activeReservations.map((reservation, index) => (
                  <ReservationLabel
                    key={index}
                    reservation={reservation}
                    backgroundColor={"#D1E0EF"}
                  />
                ))}
              </div>
            )}
          </div>
          <div>
            <h1 className="font-bold text-2xl md:text-3xl py-6">
              Past Reservations
            </h1>
            {pastReservations.length === 0 ? (
              <div className="border-t">
                <p className="mt-4">You have no past reservations!</p>
              </div>
            ) : (
              <div className="w-full">
                {pastReservations.map((reservation, index) => (
                  <div key={index} className="relative">
                    <ReservationLabel
                      reservation={reservation}
                      backgroundColor={"#D1E0EF"}
                    />
                    {isAdmin && (
                      <div className="absolute top-2 right-16">
                        <ConfirmationPopup
                          handle={() =>
                            handleDeleteReservation(reservation.reservationId)
                          }
                          text={"delete this reservation"}
                          wholeReservation={false}
                          isReservation={true}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Reservations;
