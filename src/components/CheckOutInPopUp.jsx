import React, { useState, useEffect } from 'react';
import Popup from 'reactjs-popup';
import 'reactjs-popup/dist/index.css';
import { IoIosCloseCircle } from "react-icons/io";

function CheckOutPopUp({handleCheckOutIn, checkOut, correctID}) { 
    const [equipmentID, setEquipmentID] = useState('');
    const [barcodeScanned, setBarcodeScanned] = useState(false);
    const [errorMessage, seterrorMessage] = useState('');

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Enter') {
              console.log('Scanned ID:', equipmentID);
              setBarcodeScanned(true);
            } else {
              setEquipmentID((prevNumber) => prevNumber + event.key);
            }
        };
    
        window.addEventListener('keydown', handleKeyDown);
    
        return () => {
          window.removeEventListener('keydown', handleKeyDown);
        };
    }, [equipmentID]);

    const handleSubmit = () => {
        if (equipmentID === correctID) {
            handleCheckOutIn(equipmentID);
            setBarcodeScanned(false);
            seterrorMessage('');
            setEquipmentID('');
            close();
        } else {
            seterrorMessage('Please make sure to scan the correct item.');
            setEquipmentID('');
        }
    }

    return (
        <Popup trigger=
            {<button className="bg-[#A3C1E0] w-2/7 rounded-md px-6 py-2 text-xl">{checkOut ? "Check Out" : "Check In"}</button> } 
            modal nested
            contentStyle={{ backgroundColor: '#ECECEC', borderRadius: '0.5rem', border: '2px solid black' }}  
            overlayStyle={{ backgroundColor: 'transparent'}} >
            {
                close => (
                    <div className='modal relative'>
                        <div className='content p-4 text-center'>
                            <h1 className='font-bold text-3xl pb-6'>{checkOut ? "Check Out" : "Check In"}</h1>
                            <p className='pb-2'>Please connect the scanner to your device and scan the barcode on the item.</p>
                            <p>Scanned barcode: {equipmentID}</p>
                            <p className='pt-2'>{errorMessage}</p>
                            <div className='actions flex justify-center space-x-4 pt-6 font-bold'>
                            <button
                                className="px-6 py-2 bg-[#A3C1E0] rounded-md"
                                disabled={!barcodeScanned}
                                onClick={() => {
                                    handleSubmit();
                                }}>
                                Submit
                            </button>
                            </div>
                            <IoIosCloseCircle 
                                color='#426276' 
                                className='w-10 h-10 absolute top-4 right-4' 
                                onClick={() => {
                                    setBarcodeScanned(false);
                                    setEquipmentID('');
                                    seterrorMessage('');
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
  
export default CheckOutPopUp;