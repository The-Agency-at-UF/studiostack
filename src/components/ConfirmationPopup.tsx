import React from 'react';
import Popup from './Popup';
import { IoIosCloseCircle, IoIosRemoveCircle } from "react-icons/io";

function ConfirmationPopup({ handle, text, wholeReservation, isReservation }: { handle: () => void | Promise<void>; text: string; wholeReservation?: boolean; isReservation: boolean }) {

    return (
        <Popup trigger=
            {//look of the trigger depends on the type of action (from the input)
                !isReservation ? <div className='flex-1'><button className='bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-xs lg:text-sm cursor-pointer rounded-full text-white px-6 py-1'>Change Role</button></div> :
                wholeReservation ? <button className="bg-[var(--accent-light)] rounded-md text-base sm:text-xl font-bold p-1 sm:p-2 hover:cursor-pointer hover:scale-105">Cancel Reservation</button> :
                <div>
                <IoIosRemoveCircle color='#EB3223' className='w-6 h-6 sm:w-8 sm:h-8 hover:cursor-pointer hover:scale-110' />
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
                                className="px-6 py-2 bg-[var(--accent-light)] rounded-md hover:cursor-pointer hover:scale-110"
                                onClick={() => {
                                    handle();
                                    close();
                                }}>
                                Confirm
                            </button>
                            <IoIosCloseCircle
                                color='var(--accent)'
                                className='w-8 h-8 sm:w-10 sm:h-10 absolute top-2 right-2 sm:top-4 sm:right-4 hover:cursor-pointer hover:scale-110'
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
