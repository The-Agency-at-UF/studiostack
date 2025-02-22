import React, { useState, useEffect } from 'react';
import Popup from 'reactjs-popup';
import 'reactjs-popup/dist/index.css';
import { IoIosCloseCircle } from "react-icons/io";

function CheckOutPopUp({ handleCheckOutIn, checkOut, correctID }) { 
    const [equipmentID, setEquipmentID] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [startedScanning, setStartedScanning] = useState(false);
    let barcode = ""; 

    const handleKeyDown = (event) => {
        if (event.key === "Enter") {
                setEquipmentID(barcode);
                handleSubmit(barcode);
                barcode = ""; 
        } else if (event.key !== "Shift"){
            barcode += event.key; 
        }
    };

    const scanBarcode = () => {
        setStartedScanning(true);
        window.addEventListener("keydown", handleKeyDown); 
    };

    const handleSubmit = (scannedID) => {
        window.removeEventListener("keydown", handleKeyDown); 
    
        if (scannedID === correctID.id) {
            console.log("here");
            handleCheckOutIn(scannedID);
            resetState();
            close();
        } else {
            alert("Please make sure to scan the correct item.");
            resetState();
        }
    };

    const resetState = () => {
        setStartedScanning(false);
        setEquipmentID('');
        setErrorMessage('');
    };

    return (
        <Popup 
            trigger={
                <button className="bg-[#A3C1E0] w-2/7 rounded-md px-6 py-2 lg:text-xl sm:text-lg text-sm">
                    {checkOut ? "Check Out" : "Check In"}
                </button>
            } 
            modal 
            nested
            contentStyle={{ backgroundColor: '#ECECEC', borderRadius: '0.5rem', border: '2px solid black' }}  
            overlayStyle={{ backgroundColor: 'transparent' }}
        >
            {close => (
                <div className='modal relative'>
                    <div className='content p-4 text-center text-sm sm:text-lg'>
                        <h1 className='font-bold text-2xl sm:text-3xl pb-6'>{checkOut ? "Check Out" : "Check In"}</h1>
                        <p>1. Please connect the scanner to your device</p>
                        <p>2. Press the "Start Scanning" button</p>
                        <p className='pb-3'>3. Scan the barcode on the item.</p>
                        <p>Scanned barcode: {equipmentID}</p>
                        <p className='pt-2 text-red-500'>{errorMessage}</p>
                        <div className='actions flex justify-center space-x-4 pt-4 font-bold'>
                            <button
                                className="px-6 py-2 bg-[#A3C1E0] rounded-md"
                                onClick={() => scanBarcode()}
                            >
                                {!startedScanning ? "Start Scanning" : "Scanning..."}
                            </button>
                        </div>
                        <IoIosCloseCircle 
                            color='#426276' 
                            className='w-8 h-8 sm:w-10 sm:h-10 absolute top-2 right-2 sm:top-4 sm:right-4' 
                            onClick={() => {
                                resetState();
                                close();
                            }}
                        />
                    </div>
                </div>
            )}
        </Popup>
    );
}

export default CheckOutPopUp;