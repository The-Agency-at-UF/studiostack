import React, { useEffect, useState } from 'react';
import Popup from 'reactjs-popup';
import Select from 'react-select';
import { IoIosRemoveCircle, IoIosCloseCircle } from "react-icons/io";
import { db, collection, query, where, getDocs } from '../data/localStore';

function RemoveItemPopup({ removeItem, listOfNames, listofIDs }) {
    const [selectedID, setSelectedID] = useState('');
    const [selectedName, setSelectedName] = useState(null);

    const [itemID, setItemID] = useState('');
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
            {<div><IoIosRemoveCircle color='#EB3223' className='w-10 h-10 cursor-pointer' /></div>}
            modal nested
            className="workspace-popup"
            overlayStyle={{ backgroundColor: 'rgba(16, 16, 16, 0.68)'}} >
            {
                close => (
                    <div className='workspace-modal workspace-modal-destructive modal relative'>
                        <div className='workspace-modal-content content p-4'>
                            <h1 className='font-bold text-3xl pb-6'>Remove Item</h1>
                            {/* Select from Name options */}
                            <div className='px-5 pt-2'>
                                <Select
                                    classNamePrefix="workspace-select"
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
                                    classNamePrefix="workspace-select"
                                    value={selectedID}
                                    options={idOptions}
                                    isClearable={true}
                                    isSearchable={true}
                                    onChange={handleIDSelection}
                                    styles={dropdownStyle}
                                />
                            </div>
                        </div>
                        <div className='workspace-modal-actions actions flex justify-center space-x-4 pb-6 pt-4 font-bold'>
                            <button
                                className="workspace-modal-submit px-6 py-2 cursor-pointer"
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
                                color='#2446ff'
                                className='workspace-modal-close w-10 h-10 absolute cursor-pointer'
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
