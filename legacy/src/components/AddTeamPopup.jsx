import React, { useState } from 'react';
import Popup from 'reactjs-popup';
import 'reactjs-popup/dist/index.css';
import { IoIosAddCircle, IoIosCloseCircle } from "react-icons/io";
import { BsSquare, BsCheckSquare } from "react-icons/bs";

function AddTeamPopup({ addTeam }) { 
    const [team, setTeam] = useState('');
    const [isClient, setIsClient] = useState(false);

    //sets the state of isClient to the value of the checkbox
    const handleCheckboxChange = (e) => {
        setIsClient(e.target.checked); 
    };

    return (
        <Popup trigger=
        {<div><IoIosAddCircle color='#426276' className='w-8 h-8 sm:w-10 sm:h-10 hover:scale-110 hover:cursor-pointer'/></div>} 
        modal nested
            className="workspace-popup"
            overlayStyle={{ backgroundColor: 'rgba(16, 16, 16, 0.68)'}} >
            {
                close => (
                    <div className='workspace-modal modal relative'>
                        <div className='workspace-modal-content content p-4'>
                            <h1 className='font-bold text-2xl sm:text-3xl pb-6'>Add Team</h1>
                            <label className="workspace-modal-check flex items-center space-x-2 text-sm sm:text-base pb-4">
                                <input 
                                type="checkbox" 
                                checked={isClient} 
                                onChange={handleCheckboxChange} 
                                style={{ opacity: 0 }}
                                />
                                {!isClient && <BsSquare fill={"black"} className='w-4 h-4 sm:w-5 sm:h-5' />}
                                {isClient && <BsCheckSquare fill={"#426276"} className='w-4 h-4 sm:w-5 sm:h-5' />}
                                <span>Is this a client team?</span>
                            </label>
                            <div className='px-5'>
                                <input type="text" 
                                    placeholder="Team Name"
                                    className="workspace-modal-control text-sm sm:text-base border-2 border-black-300 focus:outline-none p-2 w-full bg-white"
                                    value={team}
                                    onChange={(e) => setTeam(e.target.value)} 
                                />
                            </div>
                        </div>
                        <div className='workspace-modal-actions text-sm sm:text-lg actions flex justify-center space-x-4 pb-6 pt-4 font-bold'>
                            <button
                                className="workspace-modal-submit px-6 py-2"
                                onClick={() => {
                                    addTeam(isClient, team);
                                    close(); 
                                }}>
                                Submit
                            </button>
                            <IoIosCloseCircle 
                                color='#2446ff'
                                className='workspace-modal-close w-8 h-8 sm:w-10 sm:h-10 absolute hover:cursor-pointer'
                                onClick={() => {
                                    setTeam('');
                                    setIsClient(false);
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
