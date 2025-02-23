import React, { useEffect, useState } from 'react';
import Popup from 'reactjs-popup';
import 'reactjs-popup/dist/index.css';
import Select from 'react-select';
import { IoIosRemoveCircle, IoIosCloseCircle } from "react-icons/io";
import { collection, query, where, getDocs } from "firebase/firestore"; 
import { db } from "../firebase/firebaseConfig";

function RemoveItemPopup({ removeItem, listOfNames, listofIDs }) { 
    const [selectedID, setSelectedID] = useState('');
    const [selectedName, setSelectedName] = useState(null);

    const [itemID, setItemID] = useState('');
    const [name, setName] = useState(null);

    const [idOptions, setIdOptions] = useState([]);
    const [nameOptions, setNameOptions] = useState([]);

    // item ID drop down
    useEffect(() => {
        setIdOptions(listofIDs.map(items => {
            return { value: items, label: items }
        }));
    }, [listofIDs]);

    // item name drop down
    useEffect(() => {
        setNameOptions(listOfNames.map(names => {
            return { value: names, label: names }
        }));
    }, [listOfNames]);

    // handle item ID selection
    const handleIDSelection = (selectedID) => {
        setSelectedID(selectedID);
        setItemID(selectedID?.value);
    }

    // handle item name selection
    const handleNameSelection = async (selectedName) => {
        setSelectedName(selectedName); // object
        setName(selectedName?.value); // get object value as a string

        // if an item has been selected
        if (selectedName?.value) {
            const inventoryRef = collection(db, "inventory");
            // get ID values for that name (there can be multiple items, but there are unique IDs for each)
            const q = query(inventoryRef, where("name", "==", selectedName.value));
    
            // set the second dropdown list (item IDs)
            const querySnapshot = await getDocs(q);
            const filteredIdList = querySnapshot.docs.map(doc => ({
                value: doc.id, 
                label: doc.id
            }));
            setIdOptions(filteredIdList);
        }
    };

    // overriding styles for the dropdown
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
                            {/* Select from Name options */}
                            <div className='px-5 pt-2'>
                                <Select
                                    value={selectedName}
                                    options={nameOptions}
                                    isClearable={true}
                                    isSearchable={true}
                                    onChange={handleNameSelection}
                                    styles={dropdownStyle}
                                /> 
                            </div>  
                            {/* Select from ID options */}
                            <div className={`px-5 pt-2 ${selectedName === null ? "hidden" : ""}`}>
                                <Select
                                    value={selectedID}
                                    options={idOptions}
                                    isClearable={true}
                                    isSearchable={true}
                                    onChange={handleIDSelection}
                                    styles={dropdownStyle}
                                /> 
                            </div>          
                        </div>
                        <div className='actions flex justify-center space-x-4 pb-6 pt-4 font-bold'>
                            <button
                                className="px-6 py-2 bg-[#A3C1E0] rounded-md cursor-pointer hover:bg-[#426276] hover:text-white"
                                onClick={() => {
                                    removeItem(itemID);
                                    // reset variables on submit
                                    setSelectedID(null);
                                    setSelectedName(null);
                                    close(); 
                                }}>
                                Submit
                            </button>
                            <IoIosCloseCircle 
                                color='#426276' 
                                className='w-10 h-10 absolute top-4 right-4 cursor-pointer' 
                                onClick={() => {
                                    // reset variables on close
                                    setSelectedID(null);
                                    setSelectedName(null);
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