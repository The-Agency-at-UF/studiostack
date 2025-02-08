import React, { useState } from 'react';
import Popup from 'reactjs-popup';
import 'reactjs-popup/dist/index.css';
import { IoIosAddCircle, IoIosCloseCircle } from "react-icons/io";
import { BsSquare, BsCheckSquare } from "react-icons/bs";

function AddUserPopup({ addEmail }) { 
    const [email, setEmail] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);

    //sets the state of isAdmin to the value of the checkbox
    const handleCheckboxChange = (e) => {
        setIsAdmin(e.target.checked); 
      };

    return (
        <Popup trigger=
            {<IoIosAddCircle color='#426276' className='w-10 h-10'/>} 
            modal nested
            contentStyle={{ backgroundColor: '#ECECEC', borderRadius: '0.5rem', border: '2px solid black' }}  
            overlayStyle={{ backgroundColor: 'transparent'}} >
            {
                close => (
                    <div className='modal relative'>
                        <div className='content p-4'>
                            <h1 className='font-bold text-3xl pb-6'>Add User</h1>
                            <label className="flex items-center space-x-2 text-lg pb-4">
                                <input 
                                type="checkbox" 
                                checked={isAdmin} 
                                onChange={handleCheckboxChange} 
                                style={{ opacity: 0 }}
                                />
                                {!isAdmin && <BsSquare fill={"black"} className='w-5 h-5' />}
                                {isAdmin && <BsCheckSquare fill={"#426276"} className='w-5 h-5' />}
                                <span>Is the user an admin?</span>
                            </label>
                            <div className='px-5'>
                                <input type="text" 
                                    placeholder="Email"
                                    className="border-2 border-black-300 focus:border-[#426276] focus:outline-none p-2 rounded-md w-full bg-white" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)} 
                                />
                            </div>
                        </div>
                        <div className='actions flex justify-center space-x-4 pb-6 pt-4 font-bold'>
                            <button
                                className="px-6 py-2 bg-[#A3C1E0] rounded-md"
                                onClick={() => {
                                    addEmail(isAdmin, email);
                                    close(); 
                                }}>
                                Submit
                            </button>
                            <IoIosCloseCircle 
                                color='#426276' 
                                className='w-10 h-10 absolute top-4 right-4' 
                                onClick={() => {
                                    setEmail('');
                                    setIsAdmin(false);
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
  
export default AddUserPopup;