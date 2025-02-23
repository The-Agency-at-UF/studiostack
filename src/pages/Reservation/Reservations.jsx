import React, { useEffect, useState } from 'react';
import { getDocs, collection } from 'firebase/firestore';
import { IoIosAddCircle } from "react-icons/io";
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase/firebaseConfig';
import ReservationLabel from '../../components/ReservationLabel';

function Reservations() { 
    const [reservations, setReservations] = useState([]);
    const [activeReservations, setActiveReservations] = useState([]);
    const [pastReservations, setPastReservations] = useState([]);
    const navigate = useNavigate();
    const currentDate = new Date();

    useEffect(() => {
            const fetchReservations = async () => {
                try {
                    const reservationsRef = collection(db, 'reservations');
                    
                    //get all the reservations in the 'reservations' collection
                    const querySnapshot = await getDocs(reservationsRef);
                    
                    //map through each reservation and extract the data
                    const allReservationsList = querySnapshot.docs.map(doc => ({
                        reservationId: doc.id,
                        ...doc.data()
                    }));

                    const allReservations = allReservationsList.filter(reservation => reservation.userEmail === localStorage.getItem('email'));
                    setReservations(allReservations);

                    const activeReservationsList = allReservations.filter((reservation) => {
                        const endDate = reservation.endDate.toDate();
                        return endDate >= currentDate;
                      });
                    setActiveReservations(activeReservationsList);
                    
                    const pastReservationsList = allReservations.filter((reservation) => {
                        const endDate = reservation.endDate.toDate();
                        return endDate < currentDate;
                    });
                    setPastReservations(pastReservationsList);
    
                } catch (error) {
                    console.error("Error fetching reservations:", error);
                }
            };
            fetchReservations();
        }, []);
        
    return (
        <div className='bg-white m-8 p-8 rounded-lg relative'>
            <div className='pl-2 pr-2'>
                <div className='absolute top-6 right-6 sm:top-8 sm:right-8 flex space-x-4'>
                    <IoIosAddCircle color='#426276' className='w-8 h-8 sm:w-10 sm:h-10' onClick={ () => navigate('/create-reservation')}/>
                </div>
                <div>
                    <h1 className='font-bold text-2xl md:text-3xl pb-6'>Active Reservations</h1>
                    <div className='w-full'>
                        {activeReservations.map((reservation, index) => (
                            <ReservationLabel key={index} reservation={reservation} backgroundColor={'#D1E0EF'}/>
                        ))} 
                    </div>
                </div>
                <div>
                    <h1 className='font-bold text-2xl md:text-3xl py-6'>Past Reservations</h1>
                    <div className='w-full'>
                        {pastReservations.map((reservation, index) => (
                            <ReservationLabel key={index} reservation={reservation} backgroundColor={'#D1E0EF'}/>
                        ))} 
                    </div>
                </div>
            </div>
        </div>
    );
  }
  
  export default Reservations;