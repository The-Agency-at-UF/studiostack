import React, { useState, useEffect } from 'react';
import Popup from 'reactjs-popup';
import Select from 'react-select';
import 'reactjs-popup/dist/index.css';
import { IoIosAddCircle, IoIosCloseCircle } from "react-icons/io";

function AddItemPopup({ addItem, categoryList }) { 
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [availability] = useState('available');
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');

    // set category dropdown
    useEffect(() => {
        setCategories(categoryList.map(categories => {
            return { value: categories, label: categories }
        }));
    }, [categoryList]);

    // handle category selection 
    const handleSelection = (selectedCategory) => {
        setSelectedCategory(selectedCategory); // object
        setCategory(selectedCategory?.value); // get object value as a string
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

    return (
        <Popup trigger=
            {<div><IoIosAddCircle color='#426276' className='w-10 h-10 cursor-pointer'/></div>} 
            modal nested
            className="workspace-popup"
            overlayStyle={{ backgroundColor: 'rgba(16, 16, 16, 0.68)'}} >
            {
                close => (
                    <div className='workspace-modal modal relative'>
                        <div className='workspace-modal-content content p-4 '>
                            <h1 className='font-bold text-3xl pb-6'>Add Item</h1>
                            <div className='px-5 py-2'>
                                <input type="text" 
                                    placeholder="Enter Item Name"
                                    className="workspace-modal-control border-2 border-black-300 focus:outline-none p-2 w-full bg-white"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)} 
                                />
                            </div>
                            <div className='px-5 py-2'>
                                <Select
                                    classNamePrefix="workspace-select"
                                    placeholder="Select Category"
                                    value={selectedCategory}
                                    options={categories}
                                    isClearable={true}
                                    isSearchable={true}
                                    onChange={handleSelection}
                                    styles={dropdownStyle}
                                /> 
                            </div>
                        </div>
                        <div className='workspace-modal-actions actions flex justify-center space-x-4 pb-6 pt-4 font-bold'>
                            <button
                                className="workspace-modal-submit px-6 py-2 cursor-pointer"
                                onClick={() => {
                                    addItem(name, category, availability);
                                    // reset variables on submit
                                    setName('');
                                    setCategory(null);
                                    setSelectedCategory(null);
                                    close(); 
                                }}>
                                Submit
                            </button>
                            <IoIosCloseCircle 
                                color='#2446ff'
                                className='workspace-modal-close w-10 h-10 absolute cursor-pointer'
                                onClick={() => {
                                    // reset variables on close
                                    setName('');
                                    setCategory(null);
                                    setSelectedCategory(null);
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
  
export default AddItemPopup;
