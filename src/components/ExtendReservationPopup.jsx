import React, {useState, useEffect} from 'react';
import Popup from 'reactjs-popup';
import 'reactjs-popup/dist/index.css';
import { getDocs, collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { IoIosCloseCircle } from "react-icons/io";

function ExtendReservationPopup({ handleEdit, reservation, reservationID }) { 
    const [reservationEndDate, setReservationEndDate] = useState('');
    const [otherReservations, setOtherReservations] = useState([]);

    const handle = (close) => {
        if (reservation.startDate.toDate() > new Date(reservationEndDate)) {
            alert('New check-out date must be later than the previous one.');
            setReservationEndDate('');
            return;
        }

        //check if other reservation has this one checked out
        const reservationConflict = otherReservations.filter(res => 
            res.equipmentIDs.some(id => reservation.equipmentIDs.includes(id)) && 
            res.startDate.toDate() <= new Date(reservationEndDate)
        );
            
        //has conflicts
        if (reservationConflict.length > 0) {
            let latestAvailableDate = new Date(reservationConflict[0].startDate.toDate());
            for (let i = 1; i < reservationConflict.length; i++) {
                if (reservationConflict[i].startDate.toDate() < latestAvailableDate) {
                    latestAvailableDate = new Date(reservationConflict[i].startDate.toDate());
                }
            }
            latestAvailableDate.setMinutes(latestAvailableDate.getMinutes() - 1);
            alert('Cannot extend reservation, as this equipment specific equipment is already reserved for that date. The latest check-out date is available' + latestAvailableDate.toLocaleString());
            setReservationEndDate('');
            return;
        }

        //update reservation
        const reservationRef = doc(db, 'reservations', reservationID);
        setDoc(reservationRef, {
            ...reservation,
            endDate: new Date(reservationEndDate),
        })
        .then(() => {
            console.log('Reservation updated successfully');
        })
        .catch((error) => {
            console.error('Error updating reservation:', error);
        });

        handleEdit(reservationEndDate);
        close();
    }

    useEffect(() => {
            const fetchReservations = async () => {
                try {
                    const reservationRef = collection(db, 'reservations');
                    const querySnapshot = await getDocs(reservationRef);
                    
                    const allReservations = querySnapshot.docs.map(doc => ({
                        id: doc.id, 
                        ...doc.data()
                    }));
                    setOtherReservations(allReservations.filter(e => e.id !== reservationID && e.startDate.toDate() >= reservation.startDate.toDate()));

                } catch (error) {
                    console.error("Error fetching reservation:", error);
                }
            };
        
            fetchReservations();
        }, []);

    return (
        <Popup trigger=
            {
                <button className="absolute top-1 right-1 sm:top-8 sm:right-65 bg-[#A3C1E0] rounded-md text-base sm:text-xl font-bold p-1 sm:p-2">
                    Extend Reservation
                </button>
            } 
            modal nested
            contentStyle={{ backgroundColor: '#ECECEC', borderRadius: '0.5rem', border: '2px solid black' }}  
            overlayStyle={{ backgroundColor: 'rgba(105, 105, 105, 0.5)'}} >
            {
                close => (
                    <div className='modal relative'>
                        <div className='content p-4'>
                            <h1 className='font-bold text-lg sm:text-xl sm:pb-6 text-center pt-8'>Choose the new check-in date below:</h1>
                            <input type="datetime-local" 
                                className="text-sm sm:text-base border-2 border-black-300 focus:border-[#426276] focus:outline-none p-2 rounded-md w-full bg-white h-12" 
                                value={reservationEndDate}
                                onChange={(e) => setReservationEndDate(e.target.value)}
                            />
                        </div>
                        <div className='text-sm sm:text-lg actions flex justify-center space-x-4 pb-6 pt-4 font-bold'>
                            <button
                                className="px-6 py-2 bg-[#A3C1E0] rounded-md"
                                onClick={() => {
                                    handle(close);
                                }}>
                                Confirm
                            </button>
                            <IoIosCloseCircle 
                                color='#426276' 
                                className='w-8 h-8 sm:w-10 sm:h-10 absolute top-2 right-2 sm:top-4 sm:right-4' 
                                onClick={() => {
                                    close()
                                }}
                            />
                        </div>
                    </div>
                )
            }
        </Popup>
    );
}
  
export default ExtendReservationPopup;