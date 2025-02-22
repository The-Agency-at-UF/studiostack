import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IoIosArrowDroprightCircle } from "react-icons/io";

function ReservationLabel({ reservation, backgroundColor }) { 
    const navigate = useNavigate();

    const formatDate = (timestamp) => {
        const date = timestamp?.toDate();
        if (!date) return 'Invalid date';
        
        const options = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        };
        return date.toLocaleString(undefined, options); // format the date and time
    };
        

    return (

        <div className='p-4 rounded-lg relative my-4' style={{backgroundColor: backgroundColor}}>
            <IoIosArrowDroprightCircle 
                className='absolute right-4 top-1/2 transform -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10' 
                color='#426276'
                onClick={() => navigate('/check-in-out', {state: reservation.reservationId})}/>
            <h2 className='font-bold text-lg sm:text-xl md:text-2xl p-2'>{reservation.name}</h2>
            <p className='pl-2 text-sm sm:text-base md:text-lg'>Items Held: {reservation.equipmentIDs.length}</p>
            <p className='p-2 text-sm sm:text-base md:text-lg'>{formatDate(reservation.startDate)} - {formatDate(reservation.endDate)}</p>
        </div>
    );
  }
  
  export default ReservationLabel;