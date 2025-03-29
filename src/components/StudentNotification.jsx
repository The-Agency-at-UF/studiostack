import React from 'react';
import { IoIosTime } from "react-icons/io";
import { IoIosNotifications } from "react-icons/io";
import { IoIosClose } from "react-icons/io";

function StudentNotification({ notification, type, closeNotif }) { 

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
            notification?.userClosed == false &&
            <div className='p-2 rounded-lg relative m-2 flex items-center' style={{backgroundColor: '#D1E0EF'}}>
                <IoIosTime color='#426276' className='w-8 h-8'/>
                    <h1 className='text-xs sm:text-sm md:text-base p-2'>
                        You have <strong>{notification?.amount}</strong> overdue items for <strong>{notification?.reservationName}</strong>.
                    </h1>
                <IoIosClose color='#426276' className='absolute right-5 transform -translate-y-1/2 m-1 sm:w-8 sm:h-8'
                    onClick={() => closeNotif(notification.id)}
                />            
            </div>
            }
            {type == "report" && 
            notification?.resolved == true &&
            notification?.userClosed == false &&
            <div className='p-2 rounded-lg relative m-2 flex items-center' style={{backgroundColor: '#D1E0EF'}}>
                <IoIosNotifications color='#426276' className='w-8 h-8'/>
                    <h1 className='text-xs sm:text-sm md:text-base p-2'>
                        A report for <strong>{notification?.item}</strong> was resolved by <strong>{notification?.resolvedBy}</strong> on {formatDate(notification?.time)}.
                    </h1>
                <IoIosClose color='#426276' className='absolute right-5 transform -translate-y-1/2 m-1 sm:w-8 sm:h-8'
                    onClick={() => closeNotif(notification.id)}
                />              
            </div> 
            }
        </div>
    );
  }
  
  export default StudentNotification;