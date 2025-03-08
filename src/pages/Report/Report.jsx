import React, {useState, useEffect} from 'react'
import { collection, getDocs, addDoc } from "firebase/firestore"; 
import { db } from "../../firebase/firebaseConfig";
import Select from 'react-select';

// types of issues/subjects
const subjectList = [
  "Water Damage/Rust", 
  "Dirt/Dust Damage", 
  "Extreme Heat/Cold Damage", 
  "Dropped/Banged/Scraped",
  "Sun Damage",
  "App Not Working",
  "Item Cannot Connect to App",
  "Other"
]

function Report({ isAdmin }) {
  const [subjectDropdown, setSubjectDropdown] = useState([])
  const [itemDropdown, setItemDropdown] = useState([])

  const [subject, setSubject] = useState('')
  const [item, setItem] = useState('')
  const [message, setMessage] = useState('')

  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedItem, setSelectedItem] = useState('')

  const [inventory, setInventory] = useState([])
  
  // handle email submission
  const handleSubmit = async () => {
    if (subject && item && message) {
        try {
            // add user who reported it
            // TO DO: change to production email
            const mailRef = await addDoc(collection(db, "mail"), {
                'to': ['theagencyatufdevs@gmail.com'],
                'message': {
                    'subject': 'StudioStack Item Report',
                    'text': 'There is an issue with an item.',
                    'html': 
                    `
                    <p>Item Name & ID: ${item}</p>
                    <p>Type: ${subject}</p>
                    <p>Description: ${message}</p>
                    `
                }
              });
              console.log("Email sent successfully", mailRef.id);
              setSubject('')
              setItem('')
              setMessage('')
              setTimeout(() => window.location.reload(), 1000);
        }
        catch(error) {
            alert("Error sending email.");
            console.log("Error sending email:", error);
        }
    } else {
        alert('Missing information')
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

  useEffect(() => {
    // set subject list dropdown
    setSubjectDropdown(subjectList.map(subject => {
        return { value: subject, label: subject }
    }));

    // get inventory items
    const fetchInventory = async () => {
        try {
            const inventoryRef = collection(db, "inventory");
            const data = await getDocs(inventoryRef);
            setInventory(data.docs.map((doc) => ({...doc.data(), id:doc.id})))
        } 
        catch(error) {
            console.log("Error getting all inventory items:", error);
        }
    }
    fetchInventory();
  }, [subjectList]);

  // handle subject selection 
  const handleSubjectSelection = (selectedSubject) => {
    setSelectedSubject(selectedSubject); // object
    setSubject(selectedSubject?.value); // get object value as a string
  }

  const handleItemSelection = (selectedItem) => {
    setSelectedItem(selectedItem); // object
    setItem(selectedItem?.value); // get object value as a string
  }

  useEffect(() => {
    setItemDropdown(inventory.map(item => {
        return { 
            value: `${item.name} (${item.id})`, 
            label: `${item.name} (${item.id})`            
        }
    }));
 }, [inventory]);
  
  return (
    <div className='bg-white m-8 p-8 rounded-lg relative'>
        <div className='pl-2 pr-2'>
            <h1 className='font-bold text-2xl md:text-3xl pb-6'>Report an Issue</h1>
        </div>
        <div className='flex flex-wrap'>
            <div className='flex-auto'>
                <div>
                    <h2 className='pl-2 pt-2 text-lg sm:text-xl'>Subject:</h2>
                    <div className='pl-2 py-2'>
                    <Select
                        placeholder="Select Issue..."
                        value={selectedSubject}
                        options={subjectDropdown}
                        isClearable={true}
                        isSearchable={true}
                        onChange={handleSubjectSelection}
                        styles={dropdownStyle}
                        /> 
                    </div>
                </div>
                <div className='flex-auto relative'>
                <h1 className='pl-2 pt-2 text-lg sm:text-xl'>Choose Item:</h1>
                <div className="pl-2 py-2">
                    <div className="flex items-center space-x-2">
                        <div className='w-3/4 md:w-full'>
                            <Select
                                placeholder="Select Item..."
                                value={selectedItem}
                                options={itemDropdown}
                                isClearable={true}
                                isSearchable={true}
                                onChange={handleItemSelection}
                                styles={dropdownStyle}
                            />
                        </div>
                    </div>
                </div>
            </div>
            <div className='flex-auto relative'>
                <h2 className='pl-2 pt-2 text-lg sm:text-xl'>Description of the Issue:</h2>
                    <div className='pl-2 py-2'>
                        <textarea
                        required
                        placeholder="Message..."
                        className="text-sm sm:text-base border-2 border-black-300 focus:border-[#426276] focus:outline-none p-2 rounded-md w-full h-60" 
                        onChange={(e) => setMessage(e.target.value)} 
                        />
                </div>
            </div>
            </div>
        </div>
        <div className='flex justify-center'>
            <button 
                className="px-6 py-2 bg-[#A3C1E0] hover:bg-[#426276] hover:text-white rounded-md text-lg sm:text-xl font-bold mt-4 cursor-pointer"
                onClick={handleSubmit}
            >
            Submit Report
            </button>
        </div>
    </div>
    );
}

export default Report