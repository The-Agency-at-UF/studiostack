import React, {useState, useEffect} from 'react'
import { collection, getDocs, addDoc, serverTimestamp, doc, updateDoc, query, where} from "firebase/firestore"; 
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

function Report({ userEmail }) {
  // Select Dropdowns
  const [subjectDropdown, setSubjectDropdown] = useState([])
  const [itemDropdown, setItemDropdown] = useState([])
  const [itemIdDropdown, setItemIdDropdown] = useState([])
  const [userDropdown, setUserDropdown] = useState([])

  // variables to store data
  const [subject, setSubject] = useState('')
  const [item, setItem] = useState('')
  const [itemId, setItemId] = useState('')
  const [message, setMessage] = useState('')
  const [user, setUser] = useState('')

  // selected data
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedItem, setSelectedItem] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [selectedReportedBy, setSelectedReportedBy] = useState('')

  const [inventory, setInventory] = useState([])
  const [isSelected, setIsSelected] = useState(false);
  
  // handle email submission
  const handleSubmit = async () => {
    if (subject && item && itemId && message && user) {
        try {
            // TO DO: change to production email
            const mailRef = await addDoc(collection(db, "mail"), {
                'to': ['theagencyatufdevs@gmail.com'],
                'type': {subject},
                'message': {
                    'subject': 'StudioStack Item Report',
                    'text': 'There is an issue with an item.',
                    'html': 
                    `
                    <p>Item Name: ${item}</p>
                    <p>Item ID: ${itemId}</p>
                    <p>Type: ${subject}</p>
                    <p>Reported By: ${user}</p>
                    <p>Description: ${message}</p>
                    `
                }
              });

              const reportRef = await addDoc(collection(db, "reports"), {
                item: item, 
                itemId: itemId,
                subject: subject, 
                user: user,
                message: message, 
                resolved: false,
                timestamp: serverTimestamp()
              });

              console.log("Email sent successfully", mailRef.id);
              console.log("Item added successfully", reportRef.id);
              setSubject('')
              setItem('')
              setItemId('')
              setMessage('')
              setIsSelected(false);
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
    setItemDropdown(inventory.map(item => {
        return { 
            value: `${item.name}`, 
            label: `${item.name}`            
        }
    }));
  }, [inventory]);

  useEffect(() => {
    setItemIdDropdown(inventory.map(item => {
        return { 
            value: `${item.id}`, 
            label: `${item.id}`            
        }
    }));
  }, [inventory]);
 
  useEffect(() => {
    // set user email for the ReportedBy dropdown
    setUserDropdown([{ value: userEmail, label: userEmail }]);

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

  const handleItemSelection = async (selectedItem) => {
    setSelectedItem(selectedItem); // object
    setItem(selectedItem?.value); // get object value as a string

    // if an item has been selected
    if (selectedItem?.value) {
        const inventoryRef = collection(db, "inventory");
        // get ID values for that name (there can be multiple items, but there are unique IDs for each)
        const q = query(inventoryRef, where("name", "==", selectedItem.value));

        // set the second dropdown list (item IDs)
        const querySnapshot = await getDocs(q);
        const filteredIdList = querySnapshot.docs.map(doc => ({
            value: doc.id, 
            label: doc.id
        }));
        setIsSelected(true);
        setItemIdDropdown(filteredIdList);
    }
  }

  const handleItemIdSelection = (selectedItemId) => {
    setSelectedItemId(selectedItemId); // object
    setItemId(selectedItemId?.value); // get object value as a string
  }

  const handleUserSelection = (selectedReportedBy) => {
    setSelectedReportedBy(selectedReportedBy); // object
    setUser(selectedReportedBy?.value); // get object value as a string
  }

  const setItemtoReported = (itemId) => { 
    // set item availability/status to reported
    const itemRef = doc(db, 'inventory', itemId);
    updateDoc(itemRef, {
        availability: "reported"
    });
 }   

 const checkItemSelection = () => {
    if (!isSelected) {
        alert("Select an item name before selecting an ID");
    }
 }
  
  return (
    <div className='bg-white m-8 p-8 rounded-lg relative'>
        <div className='pl-2 pr-2'>
            <h1 className='font-bold text-3xl pb-6'>Report an Issue</h1>
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
                <div>
                    <h2 className='pl-2 pt-2 text-lg sm:text-xl'>Choose Item Name:</h2>
                    <div className='pl-2 py-2'>
                        <Select
                            placeholder="Select Item Name..."
                            value={selectedItem}
                            options={itemDropdown}
                            isClearable={true}
                            isSearchable={true}
                            onChange={handleItemSelection}
                            styles={dropdownStyle}
                            />
                    </div>
                </div>
                <div>
                    <h2 className='pl-2 pt-2 text-lg sm:text-xl'>Choose Item ID:</h2>
                    <div className='pl-2 py-2' onClick={checkItemSelection}>
                        <Select
                            placeholder="Select Item ID..."
                            value={selectedItemId}
                            options={itemIdDropdown}
                            isClearable={true}
                            isSearchable={true}
                            onChange={handleItemIdSelection}
                            styles={dropdownStyle}
                            isDisabled={!isSelected}
                            />
                    </div>
                </div>
            <div>
                <h2 className='pl-2 pt-2 text-lg sm:text-xl'>Reported By:</h2>
                <div className='pl-2 py-2'>
                    <Select
                        placeholder="Select User..."
                        value={selectedReportedBy}
                        options={userDropdown}
                        isClearable={true}
                        isSearchable={true}
                        onChange={handleUserSelection}
                        styles={dropdownStyle}
                        /> 
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
                onClick={() => {
                    handleSubmit();
                    setItemtoReported(itemId);
                  }}
            >
            Submit
            </button>
        </div>
    </div>
    );
}

export default Report