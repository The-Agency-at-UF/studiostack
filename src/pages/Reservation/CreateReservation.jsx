import React, { useState, useEffect } from 'react';
import { getDocs, collection, doc, addDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase/firebaseConfig';
import Select from 'react-select';
import { IoIosAddCircle, IoIosRemoveCircle } from "react-icons/io";

function CreateReservation() { 
    const [reservationName, setReservationName] = useState('');
    const [reservationCategory, setReservationCategory] = useState({ value: '', label: '' });
    const [reservationOtherCategory, setReservationOtherCategory] = useState();
    const [reservationStartDate, setReservationStartDate] = useState('');
    const [reservationStartTime, setReservationStartTime] = useState('');
    const [reservationEndDate, setReservationEndDate] = useState('');
    const [reservationEndTime, setReservationEndTime] = useState('');
    const [availableEquipment, setAvailableEquipment] = useState([]);
    const [allEquipment, setAllEquipment] = useState([]);
    const [allReservations, setAllReservations] = useState([]);
    const [allTeams, setAllTeams] = useState([]);
    const [dateFilled, setDateFilled] = useState(false);
    const [otherCategorySelected, setOtherCategorySelected] = useState(false);
    const [dateError, setDateError] = useState('');
    const navigate = useNavigate();

    // Helper to combine date and time into a full datetime string
    const getFullDateTime = (date, time) => {
        if (!date || !time) return '';
        return `${date}T${time}`;
    };

    // Helper to format time with AM/PM
    const formatTimeWithAMPM = (hours, mins) => {
        const hour12 = hours % 12 || 12;
        const ampm = hours >= 12 ? 'PM' : 'AM';
        return `${hour12}:${String(mins).padStart(2, '0')} ${ampm}`;
    };

    // Helper to get available times (all 30-min intervals for entire day)
    const getAvailableTimes = () => {
        const times = [];
        for (let i = 0; i < 24 * 60; i += 30) {
            const hours = Math.floor(i / 60);
            const mins = i % 60;
            const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
            times.push({ value: timeStr, display: formatTimeWithAMPM(hours, mins) });
        }
        return times;
    };
    
    //tracking the items that the user chooses for the reservation
    const [selectedEquipment, setSelectedEquipment] = useState([{ equipment: null }]);

    //making sure that the date is filled in before they can choose the equipment
    const checkIfDateFilled = (sendAlert) => {
        const fullStart = getFullDateTime(reservationStartDate, reservationStartTime);
        const fullEnd = getFullDateTime(reservationEndDate, reservationEndTime);
        if (!fullStart || !fullEnd) {
            if (sendAlert) {
                alert('Please fill in the check-in and check-out dates');
            }
            setDateFilled(false);
        } else {
            setDateError('');
            findAvailableEquipment();
            setDateFilled(true);
        }
    };


    
        const handleCheckoutTimeChange = (time) => {
            setReservationStartTime(time);
            if (!reservationStartDate || !time || !reservationEndDate || !reservationEndTime) {
                setDateError('');
                return;
            }
            setDateError(validateDateTimes(reservationStartDate, time, reservationEndDate, reservationEndTime));
        };

        const handleCheckinDateChange = (date) => {
            setReservationEndDate(date);
            if (!reservationStartDate || !reservationStartTime || !date || !reservationEndTime) {
                setDateError('');
                return;
            }
            setDateError(validateDateTimes(reservationStartDate, reservationStartTime, date, reservationEndTime));
        };

        const handleCheckinTimeChange = (time) => {
            setReservationEndTime(time);
            if (!reservationStartDate || !reservationStartTime || !reservationEndDate || !time) {
                setDateError('');
                return;
            }
            setDateError(validateDateTimes(reservationStartDate, reservationStartTime, reservationEndDate, time));
        };

    // Helper to normalize time input from various formats to HH:MM
    const normalizeTimeInput = (input) => {
        if (!input) return null;
        
        // Remove extra spaces
        input = input.trim();
        
        // Handle 24-hour format: "13:30"
        if (/^\d{1,2}:\d{2}$/.test(input)) {
            const [h, m] = input.split(':');
            const hours = parseInt(h);
            const mins = parseInt(m);
            if (hours >= 0 && hours < 24 && mins >= 0 && mins < 60) {
                return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
            }
        }
        
        // Handle 12-hour format: "1:30 PM" or "1:30PM"
        const match = input.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/);
        if (match) {
            let [, h, m, ampm] = match;
            let hours = parseInt(h);
            const mins = parseInt(m);
            const isPM = ampm.toUpperCase() === 'PM';
            
            if (hours >= 1 && hours <= 12 && mins >= 0 && mins < 60) {
                if (isPM && hours !== 12) hours += 12;
                if (!isPM && hours === 12) hours = 0;
                return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
            }
        }
        
        return null;
    };

    // Centralized validation for start/end date-times
    function validateDateTimes(startDate, startTime, endDate, endTime) {
        const normalizedStart = normalizeTimeInput(startTime);
        const normalizedEnd = normalizeTimeInput(endTime);
        if (!normalizedStart || !normalizedEnd) {
            return 'Please enter valid times (e.g., "1:30 PM" or "13:30")';
        }
        const start = new Date(`${startDate}T${normalizedStart}`);
        const end = new Date(`${endDate}T${normalizedEnd}`);
        if (start >= end) return 'Check-in must be after check-out';
        return '';
    }

    const findAvailableEquipment = () => {
        const fullStart = getFullDateTime(reservationStartDate, reservationStartTime);
        const fullEnd = getFullDateTime(reservationEndDate, reservationEndTime);
        if (!fullStart || !fullEnd) return;
        const currentReservationStart = new Date(fullStart);
        const currentReservationEnd = new Date(fullEnd);
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
                reservedEquipmentSet.add(equipmentid.id);
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

    //handle changes for the team dropdown
    const handleTeamChange = (value) => {
        setReservationCategory(value);
        if (value === null) {
            setReservationCategory({ value: '', label: '' });
            setOtherCategorySelected(false);
            setReservationOtherCategory('');
        } else if (value.label === "Other") {
            setOtherCategorySelected(true);
        } else {
            setReservationOtherCategory('');
            setOtherCategorySelected(false);
        }
    };    
    
    //add a new item dropdown
    const addItemDropdown = () => {
        if (dateFilled) {
            setSelectedEquipment([...selectedEquipment, { equipment: null }]);
        }
    };

    //remove an item dropdown
    const removeItemDropdown = (index) => {
        const updatedEquipment = selectedEquipment.filter((_, i) => i !== index);
        setSelectedEquipment(updatedEquipment);
    };

    const createReservation = async () => {
        //get the team name
        let teamName = '';
        if (reservationCategory.label !== "Other") {
            teamName = reservationCategory.label;
        } else {
            teamName = reservationOtherCategory;
        }

        //make sure every input field is filled out
        if (reservationName === '' || teamName === '' || reservationStartDate === '' || reservationEndDate === '' || 
            (selectedEquipment.length === 1 && selectedEquipment[0].equipment === null)) {

            alert("Please fill out every category.");
            return;
        }

        //check if checkout is before checkin
        const fullStart = getFullDateTime(reservationStartDate, reservationStartTime);
        const fullEnd = getFullDateTime(reservationEndDate, reservationEndTime);
        
        // Normalize the times for validation
        const normalizedStart = normalizeTimeInput(reservationStartTime);
        const normalizedEnd = normalizeTimeInput(reservationEndTime);
        
        if (!normalizedStart || !normalizedEnd) {
            setDateError('Please enter valid times (e.g., "1:30 PM" or "13:30")');
            return;
        }
        
        if (new Date(getFullDateTime(reservationStartDate, normalizedStart)) >= new Date(getFullDateTime(reservationEndDate, normalizedEnd))) {
            setDateError('Check-in must be after check-out');
            return;
        }
        setDateError('');

        const selectedEquipmentIDs = [];
        // Check for duplicate items
        for (const item of selectedEquipment) {
            if (item.equipment !== null) {
                const availableItem = availableEquipment.find(option => option.label === item.equipment.label);
                if (selectedEquipmentIDs.some(e => e.id === availableItem.value)) {
                    alert('Unable to create reservation. Please make sure items aren\'t duplicated.');
                    return;
                }
                selectedEquipmentIDs.push({ id: availableItem.value[0], name: item.equipment.label });
            }
        }
                
        //check for availability again
        const availableEquipmentList = await fetchEquipment();
        for (const item of selectedEquipmentIDs) {
            if (!availableEquipmentList.some(e => e.equipmentID === item.id)) {
                alert(`The item ${item.name} is no longer available.`);
                return;
            }
        }

        //check for reservation conflicts again
        const reservationsUpdated = await fetchReservations();
        const sameTimeReservations = reservationsUpdated.filter((reservation) => {
            const startDate = reservation.startDate.toDate();
            const endDate = reservation.verifiedBy.toDate();

            return (new Date(fullStart) < endDate) && (new Date(fullEnd) > startDate)
        });
        if (sameTimeReservations.length > 0) {
            for (const reservation of sameTimeReservations) {
                for (const equipmentid of reservation.equipmentIDs) {
                    if (selectedEquipmentIDs.some(e => e.id === equipmentid.id)) {
                        alert(`The item ${equipmentid.name} is already reserved for the selected dates.`);
                        return;
                    }
                }
            }            
        }

        try {

            // Verify date is the next business day at 8am
            const verifyDate = new Date(reservationEndDate);
            if (verifyDate.getDay() === 0 || verifyDate.getDay() === 5 || verifyDate.getDay() === 6) {
                verifyDate.setDate(verifyDate.getDate() + (1 + 7 - verifyDate.getDay()) % 7);
            } else {
                verifyDate.setDate(verifyDate.getDate() + 1);
            }
            verifyDate.setHours(9, 0, 0, 0);

            // Using addDoc to create a new document in the reservations collection
            const finalStart = normalizeTimeInput(reservationStartTime);
            const finalEnd = normalizeTimeInput(reservationEndTime);
            
            await addDoc(collection(db, 'reservations'), {
                name: reservationName,
                userEmail: localStorage.getItem('email'),
                team: teamName,
                startDate: new Date(getFullDateTime(reservationStartDate, finalStart)), 
                endDate: new Date(getFullDateTime(reservationEndDate, finalEnd)),     
                equipmentIDs: selectedEquipmentIDs,
                verifiedBy: verifyDate,
                checkedOutItems: [],
                checkedInItems: [],
                overdueItems: []
            });

            //logging the reservation timestamp in the user's document
            const userRef = doc(db, 'users', localStorage.getItem('email'));
            await setDoc(
                        userRef, 
                        { 
                            reservations: arrayUnion(new Date())
                        }, 
                        { merge: true } 
                    );
    
            alert("Reservation created successfully.");
            navigate("/reservations");
        } catch (error) {
            console.error("Error creating reservation: ", error);
            alert("There was an error creating the reservation.");
            navigate("/reservations");
        }
    }

    //overriding styles for the dropdown
    const timeSelectStyle = {
        base: 'text-sm sm:text-base border-2 border-black-300 focus:border-[#426276] focus:outline-none p-2 rounded-md flex-1 bg-white h-12 cursor-pointer'
    };

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
            
            setAllEquipment(allEquipmentList.filter(equipment => equipment.availability !== "reported"));
            return allEquipmentList.filter(equipment => equipment.availability !== "reported");
        } catch (error) {
            console.error("Error fetching equipment:", error);
        }
    };

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
            return allReservationsList;
        } catch (error) {
            console.error("Error fetching reservations:", error);
        }
    };
    

    useEffect(() => {
        // Set checkout to current date and time (rounded to nearest 30 min)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        
        // Round to nearest 30 minutes
        const minutes = now.getMinutes();
        const roundedMins = minutes < 30 ? 0 : 30;
        const roundedHours = minutes < 30 ? now.getHours() : (now.getHours() + (minutes >= 30 ? 1 : 0)) % 24;
        
        const hours = String(roundedHours).padStart(2, '0');
        const mins = String(roundedMins).padStart(2, '0');
        
        const checkoutDate = `${year}-${month}-${day}`;
        const checkoutTime = `${hours}:${mins}`;
        
        // Set checkin to 1 hour later
        const checkin = new Date(now.getTime() + 60 * 60 * 1000);
        const checkinYear = checkin.getFullYear();
        const checkinMonth = String(checkin.getMonth() + 1).padStart(2, '0');
        const checkinDay = String(checkin.getDate()).padStart(2, '0');
        const checkinHours = String(checkin.getHours()).padStart(2, '0');
        const checkinMins = String(checkin.getMinutes()).padStart(2, '0');
        
        const checkinDate = `${checkinYear}-${checkinMonth}-${checkinDay}`;
        const checkinTime = `${checkinHours}:${checkinMins}`;
        
        setReservationStartDate(checkoutDate);
        setReservationStartTime(checkoutTime);
        setReservationEndDate(checkinDate);
        setReservationEndTime(checkinTime);

        fetchEquipment();

        fetchReservations();

        const fetchTeams = async () => {
            try {
                const teamsRef = collection(db, 'teams');
                
                //get all the teams in the 'teams' collection
                const querySnapshot = await getDocs(teamsRef);
                
                //map through each team and extract the data
                const allTeamsList = querySnapshot.docs.map(doc => ({
                    value: doc.id,
                    label: doc.id
                }));
                allTeamsList.push({value: "Other", label: "Other"});

                setAllTeams(allTeamsList);
            } catch (error) {
                console.error("Error fetching teams:", error);
            }
        };

        fetchTeams();

    }, []);

    return (
        <div className='bg-white m-8 p-8 rounded-lg relative'>
            <div className='pl-2 pr-2'>
                <h1 className='font-bold text-2xl md:text-3xl pb-6'>Create a New Reservation</h1>
            </div>
            <div className='flex flex-wrap'>
                <div className='flex-auto'>
                    <div>
                        <h2 className='pl-2 pt-2 text-lg sm:text-xl'>Reservation Name</h2>
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
                        <h2 className='pl-2 pt-2 text-lg sm:text-xl'>Client or Internal Team</h2>
                        <div className='pl-2 py-2'>
                            <Select
                                value={reservationCategory.label === '' ? reservationCategory.label : reservationCategory}
                                options={allTeams}
                                isClearable={true}
                                isSearchable={true}
                                onChange={(value) => handleTeamChange(value)}
                                styles={dropdownStyle}
                            />
                        </div>
                    </div>
                    {otherCategorySelected && (
                    <div>
                        <h2 className='pl-2 pt-2 text-lg sm:text-xl'>Enter Client/Team Name</h2>
                        <div className='pl-2 py-2'>
                            <input type="text" 
                                placeholder="ex) Bartram"
                                className="text-sm sm:text-base border-2 border-black-300 focus:border-[#426276] focus:outline-none p-2 rounded-md w-full bg-white h-12" 
                                value={reservationOtherCategory}
                                onChange={(e) => setReservationOtherCategory(e.target.value)} 
                            />
                        </div>
                    </div>
                    )}
                    <div>
                        <h2 className='pl-2 pt-2 text-lg sm:text-xl'>Check-Out</h2>
                        <div className='pl-2 py-2 flex gap-2'>
                            <input type="date" 
                                className="text-sm sm:text-base border-2 border-black-300 focus:border-[#426276] focus:outline-none p-2 rounded-md flex-1 bg-white h-12" 
                                value={reservationStartDate}
                                onChange={(e) => handleCheckoutDateChange(e.target.value)} 
                            />
                            <select 
                                className={timeSelectStyle.base}
                                value={reservationStartTime}
                                onChange={(e) => handleCheckoutTimeChange(e.target.value)}
                            >
                                <option value="">Select time</option>
                                {getAvailableTimes().map((time) => (
                                    <option key={time.value} value={time.display}>{time.display}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <h2 className='pl-2 pt-2 text-lg sm:text-xl'>Check-In</h2>
                        <div className='pl-2 py-2 flex gap-2'>
                            <input type="date" 
                                className="text-sm sm:text-base border-2 border-black-300 focus:border-[#426276] focus:outline-none p-2 rounded-md flex-1 bg-white h-12" 
                                value={reservationEndDate}
                                onChange={(e) => handleCheckinDateChange(e.target.value)}
                            />
                            <select 
                                className={timeSelectStyle.base}
                                value={reservationEndTime}
                                onChange={(e) => handleCheckinTimeChange(e.target.value)}
                            >
                                <option value="">Select time</option>
                                {getAvailableTimes().map((time) => (
                                    <option key={time.value} value={time.display}>{time.display}</option>
                                ))}
                            </select>
                        </div>
                        {dateError && <p className='pl-2 text-red-600 font-semibold'>{dateError}</p>}
                    </div>
                </div>

            <div className='flex-auto relative'>
                <h1 className='pl-2 pt-2 text-lg sm:text-xl'>Choose Item(s)</h1>
                <div onClick={() => checkIfDateFilled(true)}>
                    {selectedEquipment.map((item, index) => (
                        <div key={index} className="pl-2 py-2">
                            <div className="flex items-center space-x-2">
                                <div className='min-w-75 w-full'>
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
                                { index !== 0 && <IoIosRemoveCircle 
                                    color='#EB3223' className='w-4 h-4 sm:w-6 sm:h-6 hover:scale-110 hover:cursor-pointer' 
                                    onClick={() => removeItemDropdown(index)}
                                />}
                            </div>
                        </div>
                    ))}
                    <div className='pl-2 absolute top-2 sm:top-1 right-0'>
                        <IoIosAddCircle color='#426276' className='w-6 h-6 sm:w-8 sm:h-8 hover:scale-110 hover:cursor-pointer'
                            onClick={addItemDropdown}
                            />
                    </div>
                </div>
            </div>
            </div>
            <div className='flex justify-center'>
                <button 
                    className="px-6 py-2 bg-[#A3C1E0] rounded-md text-lg sm:text-xl font-bold mt-4 hover:scale-110 hover:cursor-pointer"
                    onClick={() => createReservation()}
                    >
                    Reserve
                </button>
            </div>
        </div>
    );
}

export default CreateReservation;