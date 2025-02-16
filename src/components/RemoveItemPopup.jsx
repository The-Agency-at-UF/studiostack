import React, { useEffect, useState } from 'react';
import Popup from 'reactjs-popup';
import 'reactjs-popup/dist/index.css';
import Select from 'react-select';
import { IoIosRemoveCircle, IoIosCloseCircle } from "react-icons/io";

function RemoveItemPopup({ removeItem, listofIDs }) { 
    const [selectedID, setSelectedID] = useState('');
    const [itemID, setItemID] = useState('');

    const [options, setOptions] = useState([]);
    const [selectedOption, setSelectedOption] = useState('');

    //converts the list of categories to the format required by the dropdown
    useEffect(() => {
        console.log(listofIDs);
        setOptions(listofIDs.map(items => {
            return { value: items, label: items }
        }));
    }, [listofIDs]);

    // handle drop down for id
    const handleSelection = (selectedOption) => {
        setSelectedOption(selectedOption);
        setItemID(selectedOption?.value)
    }

    //overriding styles for the dropdown
    const dropdownStyle = {
        control: (provided) => ({
            ...provided,
            border: '2px solid black', 
            boxShadow: 'none', 
            '&:hover': {
                borderColor: 'black', 
            }
        }),
        option: (provided, state) => ({
            ...provided,
            backgroundColor: state.isFocused ? '#A3C1E0' : 'white',
            color: 'black',
            '&:hover': {
                backgroundColor: '#A3C1E0',
            }
        }),
    };


    // TO DO: add another drop down for item names, then filter id's for it

    return (
        <Popup trigger=
            {<IoIosRemoveCircle color='#EB3223' className='w-10 h-10 cursor-pointer' />} 
            modal nested
            contentStyle={{ backgroundColor: '#ECECEC', borderRadius: '0.5rem', border: '2px solid black' }}  
            overlayStyle={{ backgroundColor: 'transparent'}} >
            {
                close => (
                    <div className='modal relative'>
                        <div className='content p-4'>
                            <h1 className='font-bold text-3xl pb-6'>Remove Item</h1>
                            <div className='px-5 pt-2'>
                                <Select
                                    value={selectedOption}
                                    options={options}
                                    isClearable={true}
                                    isSearchable={true}
                                    onChange={setSelectedOption}
                                    styles={dropdownStyle}
                                /> 
                            </div>            
                        </div>
                        <div className='actions flex justify-center space-x-4 pb-6 pt-4 font-bold'>
                            <button
                                className="px-6 py-2 bg-[#A3C1E0] rounded-md"
                                onClick={() => {
                                    //handleSubmit(); t0 do: create removal function
                                    close(); 
                                }}>
                                Submit
                            </button>
                            <IoIosCloseCircle 
                                color='#426276' 
                                className='w-10 h-10 absolute top-4 right-4' 
                                onClick={() => {
                                    setSelectedOption(null);
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
  
  export default RemoveItemPopup;