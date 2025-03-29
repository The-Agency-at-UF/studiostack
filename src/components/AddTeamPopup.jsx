import React, { useState } from 'react';
import Popup from 'reactjs-popup';
import 'reactjs-popup/dist/index.css';
import { IoIosCloseCircle } from "react-icons/io";

function AddTeamPopup({ addTeam }) { 
    const [team, setTeam] = useState('');

    return (
        <Popup trigger=
            {<button 
                className="px-6 py-2 bg-[#D1E0EF] hover:bg-[#426276] hover:text-white rounded-md text-lg sm:text-xl font-bold cursor-pointer mb-4"> 
                Add Team
            </button>}    
            modal nested
            contentStyle={{ backgroundColor: '#ECECEC', borderRadius: '0.5rem', border: '2px solid black' }}  
            overlayStyle={{ backgroundColor: 'rgba(105, 105, 105, 0.5)'}} >
            {
                close => (
                    <div className='modal relative'>
                        <div className='content p-4'>
                            <h1 className='font-bold text-2xl sm:text-3xl pb-6'>Add Team</h1>
                            <div className='px-5'>
                                <input type="text" 
                                    placeholder="Team Name"
                                    className="text-sm sm:text-base border-2 border-black-300 focus:border-[#426276] focus:outline-none p-2 rounded-md w-full bg-white" 
                                    value={team}
                                    onChange={(e) => setTeam(e.target.value)} 
                                />
                            </div>
                        </div>
                        <div className='text-sm sm:text-lg actions flex justify-center space-x-4 pb-6 pt-4 font-bold'>
                            <button
                                className="px-6 py-2 bg-[#A3C1E0] rounded-md"
                                onClick={() => {
                                    addTeam(team);
                                    close(); 
                                }}>
                                Submit
                            </button>
                            <IoIosCloseCircle 
                                color='#426276' 
                                className='w-8 h-8 sm:w-10 sm:h-10 absolute top-2 right-2 sm:top-4 sm:right-4' 
                                onClick={() => {
                                    setTeam('');
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
  
export default AddTeamPopup;