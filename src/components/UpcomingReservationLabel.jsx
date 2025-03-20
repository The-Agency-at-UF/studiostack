import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IoIosArrowDroprightCircle } from "react-icons/io";

function UpcomingReservationLabel({ reservation, backgroundColor }) { 
    const navigate = useNavigate();

    //format the date and time
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
        return date.toLocaleString(undefined, options); 
    };
        
    return (
        <div className='min-w-120 p-4 rounded-lg relative my-4 text-white' style={{backgroundColor: backgroundColor}}>
            <IoIosArrowDroprightCircle 
                className='absolute right-5 top-1/2 transform -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10' 
                color='white'
                onClick={() => navigate('/check-in-out', {state: reservation.reservationId})}/>
            <h2 className='font-bold text-md sm:text-lg md:text-xl p-2'>{reservation.name}</h2>
            <p className='mr-10 p-2 text-xs sm:text-sm md:text-base'>{formatDate(reservation.startDate)} - {formatDate(reservation.endDate)}</p>
        </div>
    );
  }
  
  export default UpcomingReservationLabel;