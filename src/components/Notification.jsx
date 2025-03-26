import React from 'react';
import { IoIosTime } from "react-icons/io";
import { IoIosNotifications } from "react-icons/io";

function Notification({ notification, type }) { 

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

    return (
        <div>
            {type == "overdue" &&
            <div className='p-2 rounded-lg relative m-2 flex items-center' style={{backgroundColor: '#D1E0EF'}}>
                <IoIosTime color='#426276' className='w-8 h-8'/>
                    <h1 className='text-xs sm:text-sm md:text-base p-2'>
                        You have <strong>{notification?.amount}</strong> overdue items for <strong>{notification?.reservationName}</strong>.
                    </h1>
            </div>
            }
            {type == "report" &&
            <div className='p-2 rounded-lg relative m-2 flex items-center' style={{backgroundColor: '#D1E0EF'}}>
                <IoIosNotifications color='#426276' className='w-8 h-8'/>
                    <h1 className='text-xs sm:text-sm md:text-base p-2'>
                        A report for <strong>{notification?.item}</strong> was resolved by <strong>{notification?.resolvedBy}</strong> on {formatDate(notification?.time)}.
                    </h1>
                </div> 
            }
        </div>
    );
  }
  
  export default Notification;