import React, { useState, useEffect } from 'react';
import { getDocs, collection, doc, addDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase/firebaseConfig';
import Select from 'react-select';
import { IoIosAddCircle, IoIosRemoveCircle } from "react-icons/io";

function CreateReservation() { 
    const [reservationName, setReservationName] = useState('');
    const [reservationStartDate, setReservationStartDate] = useState('');
    const [reservationEndDate, setReservationEndDate] = useState('');
    const [availableEquipment, setAvailableEquipment] = useState([]);
    const [allEquipment, setAllEquipment] = useState([]);
    const [allReservations, setAllReservations] = useState([]);
    const [dateFilled, setDateFilled] = useState(false);

    const navigate = useNavigate();
    
    //tracking the items that the user chooses for the reservation
    const [selectedEquipment, setSelectedEquipment] = useState([{ equipment: null, quantity: 1 }]);

    const checkIfDateFilled = (sendAlert) => {
        if (!reservationStartDate || !reservationEndDate) {
            if (sendAlert) {
                alert('Please fill in the check-in and check-out dates');
            }
            setDateFilled(false);
        } else {
            findAvailableEquipment();
            setDateFilled(true);
        }
    };

    const checkReservationEndDate = (date) => {
        if (new Date(reservationStartDate) > new Date(date)) {
            alert('Check-out date must be after check-in date.');
            return;
        }
        setReservationEndDate(date);
    };

    const findAvailableEquipment = () => {
        const currentReservationStart = new Date(reservationStartDate);
        const currentReservationEnd = new Date(reservationEndDate);
        const reservedEquipmentSet = new Set();

        //find the reservations happening during the current one being created
        const sameTimeReservations = allReservations.filter((reservation) => {
            const startDate = reservation.startDate.toDate();
            const endDate = reservation.verifiedBy.toDate();

            return (currentReservationStart < endDate) && (currentReservationEnd > startDate)
        });

        //get the equipment that is reserved for these reservations
        sameTimeReservations.forEach((reservation) => {
            reservation.equipmentIDs.forEach((equipmentid) => {
                reservedEquipmentSet.add(equipmentid);
            });
        });

        //available equipment to reserve for these dates
        const availableEquipmentList = allEquipment.filter((equipment) => !reservedEquipmentSet.has(equipment.equipmentID));

        //dictionary where key is the equipment name and an array of equipmentIDs is the value
        const equipmentDict = availableEquipmentList.reduce((acc, equipment) => {
            if (acc[equipment.name]) {
                acc[equipment.name].push(equipment.equipmentID);
            } else {
                acc[equipment.name] = [equipment.equipmentID];
            }
            return acc;
        }, {});

        const equipmentOptions = Object.keys(equipmentDict).map(equipmentName => ({
            value: equipmentDict[equipmentName], 
            label: equipmentName,
            quantity: availableEquipmentList.filter(equipment => equipment.name === equipmentName).length, // Add quantity info
        }));

        equipmentOptions.sort((a, b) => a.label.localeCompare(b.label));
        setAvailableEquipment(equipmentOptions);
    };

    //handle changes for a specific item
    const handleItemChange = (index, value) => {
        const updatedEquipment = [...selectedEquipment];
        updatedEquipment[index] = value;
        setSelectedEquipment(updatedEquipment);
    };

    //handle quantity change for a specific item
    const handleQuantityChange = (index, selectedOption) => {
        const updatedEquipment = [...selectedEquipment];
        updatedEquipment[index].quantity = selectedOption.value;
        setSelectedEquipment(updatedEquipment);
    };
    
    //add a new item dropdown
    const addItemDropdown = () => {
        if (dateFilled) {
            setSelectedEquipment([...selectedEquipment, { equipment: null, quantity: 1 }]);
        }
    };

    //remove an item dropdown
    const removeItemDropdown = (index) => {
        const updatedEquipment = selectedEquipment.filter((_, i) => i !== index);
        setSelectedEquipment(updatedEquipment);
    };

    const getQuantityOptions = (equipmentName) => {
        const equipment = allEquipment.filter(item => item.name === equipmentName)[0];
        const availableQuantity = equipment ? availableEquipment.filter(item => item.label === equipmentName)[0]?.quantity : 0;
    
        return Array.from({ length: availableQuantity }, (_, i) => ({
            value: i + 1,
            label: (i + 1).toString()
        }));
    };

    const createReservation = async () => {
        if (selectedEquipment.length === 1 && selectedEquipment[0].equipment === null) {
            alert('Please select at least one equipment item.');
            return;
        }

        const selectedEquipmentIDs = [];

        selectedEquipment.forEach(item => {
            if (item.equipment !== null) {
                const availableItem = availableEquipment.find(option => option.label === item.equipment.label);
    
                for (let i = 0; i < item.quantity; i++) {
                    if (selectedEquipmentIDs.includes(availableItem.value[i])) {
                        alert('Unable to create reservation. Please make sure items aren\'t duplicated.')
                        return;
                    }
                    selectedEquipmentIDs.push(availableItem.value[i]);
                }
            }
        });

        try {

            const verifyDate = new Date(reservationEndDate);
            if (verifyDate.getDay() === 0 || verifyDate.getDay() === 5 || verifyDate.getDay() === 6) {
                verifyDate.setDate(verifyDate.getDate() + (1 + 7 - verifyDate.getDay()) % 7);
                verifyDate.setHours(17, 0, 0, 0);
            } else {
                verifyDate.setDate(verifyDate.getDate() + 1);
            }

            // Using addDoc to create a new document in the reservations collection
            await addDoc(collection(db, 'reservations'), {
                name: reservationName,
                userEmail: localStorage.getItem('email'),
                startDate: new Date(reservationStartDate), 
                endDate: new Date(reservationEndDate),     
                equipmentIDs: selectedEquipmentIDs,
                verifiedBy: verifyDate,
                checkedOutItems: [],
                checkedInItems: []
            });
    
            alert("Reservation created successfully.");
            navigate("/reservations");
        } catch (error) {
            console.error("Error creating reservation: ", error);
            alert("There was an error creating the reservation.");
        }
    }

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
    

    useEffect(() => {
        const fetchEquipment = async () => {
            try {
                const equipmentRef = collection(db, 'inventory');
                
                //get all the equipment in the 'equipment' collection
                const querySnapshot = await getDocs(equipmentRef);
                
                //map through each equipment and extract the data
                const allEquipmentList = querySnapshot.docs.map(doc => ({
                    equipmentID: doc.id, 
                    ...doc.data()
                }));
                
                setAllEquipment(allEquipmentList.filter(equipment => equipment.availability !== "unavailable"));
            } catch (error) {
                console.error("Error fetching equipment:", error);
            }
        };
        fetchEquipment();

        const fetchReservations = async () => {
            try {
                const reservationsRef = collection(db, 'reservations');
                
                //get all the reservations in the 'reservations' collection
                const querySnapshot = await getDocs(reservationsRef);
                
                //map through each reservation and extract the data
                const allReservationsList = querySnapshot.docs.map(doc => ({
                    ...doc.data()
                }));
                
                setAllReservations(allReservationsList);
            } catch (error) {
                console.error("Error fetching reservations:", error);
            }
        };
        fetchReservations();
    }, []);

    return (
        <div className='bg-white m-8 p-8 rounded-lg relative'>
            <div className='pl-2 pr-2'>
                <h1 className='font-bold text-2xl md:text-3xl pb-6'>Create a New Reservation</h1>
            </div>
            <div className='flex flex-wrap'>
                <div className='flex-auto'>
                    <div>
                        <h2 className='pl-2 pt-2 text-lg sm:text-xl'>Reservation Name:</h2>
                        <div className='pl-2 py-2'>
                            <input type="text" 
                                placeholder="ex) Bartram Photoshoot..."
                                className="text-sm sm:text-base border-2 border-black-300 focus:border-[#426276] focus:outline-none p-2 rounded-md w-full bg-white h-12" 
                                value={reservationName}
                                onChange={(e) => setReservationName(e.target.value)} 
                            />
                        </div>
                    </div>
                    <div>
                        <h2 className='pl-2 pt-2 text-lg sm:text-xl'>Check-Out Date:</h2>
                        <div className='pl-2 py-2'>
                            <input type="datetime-local" 
                                className="text-sm sm:text-base border-2 border-black-300 focus:border-[#426276] focus:outline-none p-2 rounded-md w-full bg-white h-12" 
                                value={reservationStartDate}
                                onChange={(e) => setReservationStartDate(e.target.value)} 
                            />
                        </div>
                    </div>
                    <div>
                        <h2 className='pl-2 pt-2 text-lg sm:text-xl'>Check-In Date:</h2>
                        <div className='pl-2 py-2'>
                            <input type="datetime-local" 
                                className="text-sm sm:text-base border-2 border-black-300 focus:border-[#426276] focus:outline-none p-2 rounded-md w-full bg-white h-12" 
                                value={reservationEndDate}
                                onChange={(e) => checkReservationEndDate(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

            <div className='flex-auto relative'>
                <h1 className='pl-2 pt-2 text-lg sm:text-xl'>Choose Item(s) and Quantity:</h1>
                <div onClick={() => checkIfDateFilled(true)}>
                    {selectedEquipment.map((item, index) => (
                        <div key={index} className="pl-2 py-2">
                            <div className="flex items-center space-x-2">
                                <div className='w-3/4 md:w-full'>
                                <Select
                                    value={item.equipment}
                                    options={availableEquipment}
                                    isClearable={true}
                                    isSearchable={true}
                                    onChange={(value) => handleItemChange(index, { ...item, equipment: value })}
                                    styles={dropdownStyle}
                                    isDisabled={!dateFilled}
                                />
                                </div>
                                    <div className='min-w-1/7'>
                                    <Select
                                        id={`quantity-${index}`}
                                        value={{ value: item.quantity, label: item.quantity.toString() }} 
                                        onChange={(selectedOption) => handleQuantityChange(index, selectedOption)}  
                                        styles={dropdownStyle}
                                        isDisabled={!dateFilled}
                                        options={item.equipment ? getQuantityOptions(item.equipment.label) : []}
                                    />
                                    </div>
                                { index !== 0 && <IoIosRemoveCircle 
                                    color='#EB3223' className='w-4 h-4 sm:w-6 sm:h-6' 
                                    onClick={() => removeItemDropdown(index)}
                                />}
                            </div>
                        </div>
                    ))}
                    <div className='pl-2 absolute top-2 sm:top-1 right-0'>
                        <IoIosAddCircle color='#426276' className='w-6 h-6 sm:w-8 sm:h-8'
                            onClick={addItemDropdown}
                            />
                    </div>
                </div>
            </div>
            </div>
            <div className='flex justify-center'>
                <button 
                    className="px-6 py-2 bg-[#A3C1E0] rounded-md text-lg sm:text-xl font-bold mt-4"
                    disabled={!dateFilled}
                    onClick={() => createReservation()}
                    >
                    Reserve
                </button>
            </div>
        </div>
    );
}

export default CreateReservation;