import React, { useEffect, useState } from 'react';
import Popup from 'reactjs-popup';
import 'reactjs-popup/dist/index.css';
import Select from 'react-select';
import { IoIosRemoveCircle, IoIosCloseCircle } from "react-icons/io";

function RemoveTeamPopup({ removeTeam, listOfTeams }) { 
    const [teamsList, setTeamsList] = useState([]);
    const [selectedTeam, setSelectedTeam] = useState(null);

    // setup objects for the dropdown
    useEffect(() => {
        setTeamsList(listOfTeams.map(team => {
            return { value: team, label: team }
        }));
    }, [listOfTeams]);

    // send team name to removeTeam function
    const handleSubmit = () => {
        if (selectedTeam) {
            removeTeam(selectedTeam?.value);
            setSelectedTeam(null);
        }
    };

    //overriding styles for the dropdown
    const dropdownStyle = {
        control: (provided) => ({
            ...provided,
            border: '2px solid black',
            boxShadow: 'none',
            '&:hover': {
                borderColor: 'black',
            },
            borderRadius: '0.375rem',
            height: 'calc(var(--spacing) * 12)',
            fontSize: '0.875rem', 
            '@media (min-width: 640px)': {
                fontSize: '1rem', 
            }
        }),
        option: (provided, state) => ({
            ...provided,
            backgroundColor: state.isFocused ? '#A3C1E0' : 'white',
            color: 'black',
            '&:hover': {
                backgroundColor: '#A3C1E0',
            },
            fontSize: '0.875rem',
            '@media (min-width: 640px)': {
                fontSize: '1rem',
            }
        }),
        singleValue: (provided) => ({
            ...provided,
            fontSize: '0.875rem',
            '@media (min-width: 640px)': {
                fontSize: '1rem',
            }
        }),
        input: (provided) => ({
            ...provided,
            fontSize: '0.875rem',
            '@media (min-width: 640px)': {
                fontSize: '1rem',
            }
        })
    };

    return (
        <Popup trigger=
            {<IoIosRemoveCircle color='#EB3223' className='w-8 h-8 sm:w-10 sm:h-10' />} 
            modal nested
            contentStyle={{ backgroundColor: '#ECECEC', borderRadius: '0.5rem', border: '2px solid black' }}  
            overlayStyle={{ backgroundColor: 'rgba(105, 105, 105, 0.5)'}} >
            {
                close => (
                    <div className='modal relative'>
                        <div className='content p-4'>
                            <h1 className='font-bold text-2xl sm:text-3xl pb-6'>Remove Team</h1>
                            <div className='px-5 pt-2'>
                                <Select
                                    value={selectedTeam}
                                    options={teamsList}
                                    isClearable={true}
                                    isSearchable={true}
                                    onChange={setSelectedTeam}
                                    styles={dropdownStyle}
                                /> 
                            </div>            
                        </div>
                        <div className='text-sm sm:text-lg actions flex justify-center space-x-4 pb-6 pt-4 font-bold'>
                            <button
                                className="px-6 py-2 bg-[#A3C1E0] rounded-md"
                                onClick={() => {
                                    handleSubmit();
                                    close(); 
                                }}>
                                Submit
                            </button>
                            <IoIosCloseCircle 
                                color='#426276' 
                                className='w-8 h-8 sm:w-10 sm:h-10 absolute top-2 right-2 sm:top-4 sm:right-4' 
                                onClick={() => {
                                    setSelectedTeam(null);
                                    close();
                                }}
                            />
                        </div>
                    </div>
                )
            }
        </Popup>
    );
  }
  
  export default RemoveTeamPopup;