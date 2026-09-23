import React from 'react';
import { IoIosTime } from "react-icons/io";
import { IoIosNotifications } from "react-icons/io";
import { IoIosClose } from "react-icons/io";

function AdminNotification({ notification, type, closeNotif }) { 
    return (
        <div>
            {type == "overdue" &&
            notification?.adminClosed == false &&
            <div className='p-2 rounded-lg relative m-2 flex items-center' style={{backgroundColor: '#D1E0EF'}}>
                <IoIosTime color='#426276' className='w-8 h-8'/>
                        {notification?.userEmail === localStorage.getItem("email") ? 
                        <h1 className='text-xs sm:text-sm md:text-base p-2'>
                            You have <strong>{notification?.amount}</strong> overdue items for <strong>{notification?.reservationName}</strong>.
                        </h1>
                        :
                        <h1 className='text-xs sm:text-sm md:text-base p-2'>
                        <strong>{notification?.userEmail}</strong> has <strong>{notification?.amount}</strong> overdue items for <strong>{notification?.reservationName}</strong>.
                        </h1>
                    }
                <IoIosClose color='#426276' className='absolute right-5 transform -translate-y-1/2 m-1 sm:w-8 sm:h-8'
                    onClick={() => closeNotif(notification.id)}
                />
            </div>
            }
            {type == "report" &&
            notification?.resolved == false &&
            notification?.adminClosed == false &&
            <div className='p-2 rounded-lg relative m-2 flex items-center' style={{backgroundColor: '#D1E0EF'}}>
                <IoIosNotifications color='#426276' className='w-8 h-8'/>
                    <h1 className='text-xs sm:text-sm md:text-base p-2'>
                        <strong>{notification?.userEmail}</strong> submitted a report for <strong>{notification?.item}</strong>.
                    </h1>
                <IoIosClose color='#426276' className='absolute right-5 transform -translate-y-1/2 m-1 sm:w-8 sm:h-8'
                    onClick={() => closeNotif(notification.id)}
                />
             </div> 
            }
        </div>
    );
  }
  
  export default AdminNotification;