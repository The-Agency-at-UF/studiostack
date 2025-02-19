import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getDoc, doc, setDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import CheckOutInPopUp from "../../components/CheckOutInPopUp";

function CheckInOut() { 
    const location = useLocation();
    const reservationID = location.state;
    const [reservation, setReservation] = useState();
    const [allEquipment, setAllEquipment] = useState([]);
    const [itemsToCheckOut, setItemsToCheckOut] = useState([]);

    const formatDate = (timestamp) => {
        if (timestamp && timestamp.seconds) {
            const date = new Date(timestamp.seconds * 1000); 
            const options = {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
            };
            return date.toLocaleString(undefined, options);
        }
        return 'Invalid date';
    };

    const handleCheckOut = async (equipmentID) => {
        const equipmentCheckedOut = itemsToCheckOut.find(equipment => equipment.id === equipmentID)
        const reservationRef = doc(db, 'reservations', reservation.reservationID);
        await setDoc(
            reservationRef, 
            { 
                checkedOutItems: [...reservation.checkedOutItems, {id: equipmentID, name: equipmentCheckedOut.name}] 
            }, 
            { merge: true } 
        );
        const updatedReservation = await getDoc(reservationRef);
        const updatedData = updatedReservation.data();
        setReservation({
            ...updatedData,
            reservationID: updatedReservation.id,
        });

        const itemsToCheckOutUpdated = itemsToCheckOut.filter((equipment) => equipment.id !== equipmentID);
        setItemsToCheckOut(itemsToCheckOutUpdated);
    };

    const handleCheckIn = async (equipmentID) => {
        const equipmentCheckedIn = itemsToCheckOut.find(equipment => equipment.id === equipmentID)
        const reservationRef = doc(db, 'reservations', reservation.reservationID);
        await setDoc(
            reservationRef, 
            { 
                checkedInItems: [...reservation.checkedInItems, {id: equipmentID, name: equipmentCheckedIn.name}] 
            }, 
            { merge: true } 
        );
        const updatedReservation = await getDoc(reservationRef);
        const updatedData = updatedReservation.data();
        setReservation({
            ...updatedData,
            reservationID: updatedReservation.id,
        });
    };

    useEffect(() => {
        const fetchEquipment = async () => {
            try {
                const equipmentRef = collection(db, 'inventory');
                
                const querySnapshot = await getDocs(equipmentRef);
                
                const allEquipmentList = querySnapshot.docs.map(doc => ({
                    equipmentID: doc.id, 
                    name: doc.data().name
                }));
                
                setAllEquipment(allEquipmentList);
            } catch (error) {
                console.error("Error fetching equipment:", error);
            }
        };

        fetchEquipment();

        const fetchReservations = async () => {
            try {
                const reservationRef = doc(db, 'reservations', reservationID);
                const reservationVar = await getDoc(reservationRef);
                setReservation(reservationVar.data());

                // Ensure allEquipment is loaded before processing reservation data
                if (allEquipment.length > 0 && reservationVar.exists()) {
                    const itemsToCheckOutList = reservationVar.data().equipmentIDs.map(ID => {
                        const equipment = allEquipment.find(equipment => equipment.equipmentID === ID);
                        return {
                            id: ID,
                            name: equipment.name
                        };
                    });

                    setItemsToCheckOut(itemsToCheckOutList);
                }
                
            } catch (error) {
                console.error("Error fetching reservation:", error);
            }
        };

        fetchReservations();
    }, [allEquipment, reservationID]); 

    return (
        <div className='bg-white m-8 p-8 rounded-lg relative'>
            <div className='pl-2 pr-2'>
                <h1 className='font-bold text-3xl pb-2'>{reservation?.name}</h1>
                <h3 className="text-xl pb-2 ">{reservation && formatDate(reservation.startDate)} - {reservation && formatDate(reservation.endDate)}</h3>
                <h3 className="text-xl">Items Held: {reservation?.equipmentIDs?.length}</h3>
                <div className="container py-4"> 
                    <div className="flex flex-col md:flex-row gap-4"> 
                        <div className="flex-1 p-4 rounded"> 
                            <h2 className="text-2xl text-center font-semibold pb-4">Check Out Items:</h2>
                            {itemsToCheckOut.map((item, index) => (
                                <div key={index} className="bg-[#ECECEC] w-full p-2 rounded-md border-2 border-black flex items-center justify-between mb-4"> 
                                    <div className="bg-white rounded-md p-2 w-2/3 text-center text-xl">
                                        <h3>{item.name}:</h3>
                                        <h3>{item.id}</h3> 
                                    </div>                                
                                    <CheckOutInPopUp handleCheckOutIn={() => handleCheckOut(item.id)} checkOut={true} correctID={item}/>
                                </div>                          
                            ))} 
                        </div>
                        <div className="flex-1 p-4 ml-2 rounded"> 
                            <h2 className="text-2xl text-center font-semibold pb-4">Check In Items:</h2>
                            {reservation?.checkedOutItems?.map((item, index) => (
                                <div key={index} className="bg-[#ECECEC] w-full p-2 rounded-md border-2 border-black flex items-center justify-between"> 
                                    <div className="bg-white rounded-md p-2 w-2/3 text-center text-xl">
                                        <h3>{item.name}:</h3>
                                        <h3>{item.id}</h3> 
                                    </div> 
                                    <CheckOutInPopUp handleCheckOutIn={() => handleCheckIn(item)} checkOut={false} correctID={item}/>
                                </div>                          
                            ))} 
                        </div>
                    </div>
                </div>
                <div>
                    <h2 className="text-2xl text-center font-semibold pb-4">Returned Items:</h2>
                    {reservation?.checkedInItems?.map((item, index) => (
                        <div key={index} className="bg-[#ECECEC] w-full p-2 rounded-md border-2 border-black flex items-center justify-between"> 
                            <div className="bg-white rounded-md p-2 w-2/3 text-center text-xl">
                                <h3>{item.name}:</h3>
                                <h3>{item.id}</h3> 
                            </div> 
                        </div>                          
                    ))}
                </div>
            </div>
        </div>
    );
}

export default CheckInOut;
