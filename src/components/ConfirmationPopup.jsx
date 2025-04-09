import React from 'react';
import Popup from 'reactjs-popup';
import 'reactjs-popup/dist/index.css';
import { IoIosCloseCircle, IoIosRemoveCircle } from "react-icons/io";

function ConfirmationPopup({ handle, text, wholeReservation, isReservation }) { 

    return (
        <Popup trigger=
            {!isReservation ? <div className='flex-1'><button className='bg-[#A3C1E0] hover:bg-[#426276] text-xs lg:text-sm cursor-pointer rounded-full text-white px-6 py-1'>Change Role</button></div> :
                wholeReservation ? <button className="absolute top-1 right-1 sm:top-8 sm:right-8 bg-[#A3C1E0] rounded-md text-base sm:text-xl font-bold p-1 sm:p-2">Cancel Reservation</button> :
                <div>
                <IoIosRemoveCircle color='#EB3223' className='w-6 h-6 sm:w-8 sm:h-8' />
                </div>
            } 
            modal nested
            contentStyle={{ backgroundColor: '#ECECEC', borderRadius: '0.5rem', border: '2px solid black' }}  
            overlayStyle={{ backgroundColor: 'rgba(105, 105, 105, 0.5)'}} >
            {
                close => (
                    <div className='modal relative'>
                        <div className='content p-4'>
                            <h1 className='font-bold text-lg sm:text-xl sm:pb-3 text-center pt-8'>Are you sure you want to {text}?</h1>
                        </div>
                        <div className='text-sm sm:text-lg actions flex justify-center space-x-4 pb-6 pt-4 font-bold'>
                            <button
                                className="px-6 py-2 bg-[#A3C1E0] rounded-md"
                                onClick={() => {
                                    handle();
                                    close(); 
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
  
export default ConfirmationPopup;