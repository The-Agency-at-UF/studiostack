import React, {useState, useEffect} from 'react'
import { collection, orderBy, addDoc, onSnapshot, query, doc, deleteDoc, serverTimestamp } from "firebase/firestore"; 
import { db } from "../../firebase/firebaseConfig";
import AddItemPopup from '../../components/AddItemPopup';
import RemoveItemPopup from '../../components/RemoveItemPopup';
import BarcodeDownloader from '../../components/BarcodeGenerator';
import { IoIosAlert } from "react-icons/io";
import { IoIosCheckmarkCircle } from "react-icons/io";

function Inventory({ isAdmin }) {
  const [inventory, setInventory] = useState([]);
  const [filteredList, setFilteredList] = useState([]);
  const inventoryCollectionRef = collection(db, "inventory");

  // categories for a dropdown
  const categoryList = ["Camera & Accessories", "Audio", "Lights", "Production Design", "Cables & Cords", "Miscellaneous"];

  // filter functionality
  const handleFilter = async (category) => {
    const filtered = inventory.filter(item => item.category === category);
    setFilteredList(filtered);
  }
  // show all inventory items
  const showAll = async () => {
    const all = inventory;
    setFilteredList(all);
  }

  // retrive all inventory items
  useEffect(() => {
    // listens and updates in real time, ordered by most recently added
    const q = query(inventoryCollectionRef, orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // get items from the inventory collection 
      const items = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
      setInventory(items);
      setFilteredList(items);
    });
    return unsubscribe;
  }, []);

  // adds item to database
  const addItem = (name, category, availability) => {  
    try {
      addDoc(inventoryCollectionRef, { name: name, category: category, availability: availability, timestamp: serverTimestamp() });
    }
    catch(error) {
      alert("Error adding item.");
      console.log("Error adding item to inventory:", error);
    }
  }

  // remove item from database
  const removeItem = (itemID) => {  
    try {
      deleteDoc(doc(db, "inventory", itemID));
    }
    catch(error) {
      alert("Error removing item.");
      console.log("Error deleting item from inventory:", error);
    }
  }

  return (
    <div>
      <div className='bg-white m-8 p-8 rounded-lg relative'>
            <div className='pl-2 pr-2'>
                <h1 className='font-bold text-3xl pb-6'>Inventory</h1>
                {
                  isAdmin && 
                    <div className="absolute top-8 right-8 flex space-x-4">
                      <AddItemPopup addItem={addItem} categoryList={categoryList}/>
                      <RemoveItemPopup removeItem={removeItem} listOfNames={inventory.map(item => item.name)} listofIDs={inventory.map(item => item.id)}/>
                  </div>
                }
            </div>
            <div className='pl-2 pr-2'>
              <div className="font-light">Sort by:
              <button onClick={() => showAll()} className='bg-[#A3C1E0] hover:bg-[#426276] font-semibold cursor-pointer text-sm rounded-full m-1.5 pl-4 pr-4 pt-1 pb-1 text-white'>All</button>
              <button onClick={() => handleFilter('Camera & Accessories')} className='bg-[#A3C1E0] hover:bg-[#426276] font-semibold cursor-pointer text-sm rounded-full m-1.5 pl-4 pr-4 pt-1 pb-1 text-white'>Camera & Accessories</button>
              <button onClick={() => handleFilter('Lights')} className='bg-[#A3C1E0] hover:bg-[#426276] font-semibold cursor-pointer text-sm rounded-full m-1.5 pl-4 pr-4 pt-1 pb-1 text-white'>Lights</button>
              <button onClick={() => handleFilter('Production Design')} className='bg-[#A3C1E0] hover:bg-[#426276] font-semibold cursor-pointer text-sm rounded-full m-1.5 pl-4 pr-4 pt-1 pb-1 text-white'>Production Design</button>
              <button onClick={() => handleFilter('Audio')} className='bg-[#A3C1E0] hover:bg-[#426276] font-semibold cursor-pointer text-sm rounded-full m-1.5 pl-4 pr-4 pt-1 pb-1 text-white'>Audio</button>
              <button onClick={() => handleFilter('Cables & Cords')} className='bg-[#A3C1E0] hover:bg-[#426276] font-semibold cursor-pointer text-sm rounded-full m-1.5 pl-4 pr-4 pt-1 pb-1 text-white'>Cables & Cords</button>
              <button onClick={() => handleFilter('Miscellaneous')} className='bg-[#A3C1E0] hover:bg-[#426276] font-semibold cursor-pointer text-sm rounded-full m-1.5 pl-4 pr-4 pt-1 pb-1 text-white'>Miscellaneous</button>
              </div>
            </div>
            <div className="p-4">
                <div className="flex py-2 font-semibold">
                    <div className="flex-1 pl-4">Item Name</div>
                    <div className="flex-1 pl-4">Category</div>
                    <div className="flex-1 pl-4">Status</div>
                    <div className="flex-1">Download Barcode</div>
                </div>
                <ul>
                    {filteredList.map((item) => (
                      <li key={item.id} className="flex py-2 border-t">
                        <div className="flex-1 pl-4">{item.name}</div>
                        <div className="flex-1 pl-4">{item.category}</div>
                        <div className="flex-1 pl-4">
                        {item.availability == "reported" &&
                          <IoIosAlert color='#EB3223' className='w-5 h-5 ml-5 mr-5'/>
                        }
                        {item.availability == "available" &&
                          <IoIosCheckmarkCircle color='#426276' className='w-5 h-5 ml-5 mr-5'/>
                        }     
                         {item.availability == "checked out" &&
                          <IoIosCheckmarkCircle color='#426276' className='w-5 h-5 ml-5 mr-5'/>
                        }
                        </div>
                        <div className="flex-1 pl-4">
                          <BarcodeDownloader equipmentID={item.id}/>
                        </div>
                      </li>
                    ))}
                </ul>
                <ul>
                </ul>
            </div>
        </div>
    </div>
  )
}

export default Inventory;