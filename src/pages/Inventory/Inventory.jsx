import React, {useState, useEffect} from 'react'
import { collection, addDoc, getDocs, doc, deleteDoc } from "firebase/firestore"; 
import { db } from "../../firebase/firebaseConfig";
import AddItemPopup from '../../components/AddItemPopup';
import RemoveItemPopup from '../../components/RemoveItemPopup';
import QRCodeGenerator from '../../components/QRCodeGenerator';

const Inventory = () => {
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
    const filtered = inventory;
    setFilteredList(filtered);
  }

  // retrieve all inventory items
  useEffect(() => {
    const getInventory = async () => {
      try {
        const data = await getDocs(inventoryCollectionRef);
        setInventory(data.docs.map((doc) => ({...doc.data(), id:doc.id})))
        setFilteredList(data.docs.map((doc) => ({...doc.data(), id:doc.id})));
      } 
      catch(error) {
        console.log("Error getting all inventory items:", error);
      }
    }
    getInventory();
  }, []);

  // adds item to database
  const addItem = (name, category, availability) => {  
    addDoc(inventoryCollectionRef, { name: name, category: category, availability: availability });
    alert("Item added successfully.");
    setTimeout(() => window.location.reload(), 1000);
  }

  // remove item from database
  const removeItem = (itemID) => {  
    try {
      deleteDoc(doc(db, "inventory", itemID));
      alert("Item removed successfully.");
    }
    catch(error) {
      console.log("Error deleting inventory item:", error);
    }
    setTimeout(() => window.location.reload(), 1000);
  }

  return (
    <div>
      <div className='bg-white m-8 p-8 rounded-lg relative'>
            <div className='pl-2 pr-2'>
                <h1 className='font-bold text-3xl pb-6'>All Items</h1>
                <div className="absolute top-8 right-8 flex space-x-4">
                  <AddItemPopup addItem={addItem} categoryList={categoryList}/>
                  <RemoveItemPopup removeItem={removeItem} listOfNames={inventory.map(item => item.name)} listofIDs={inventory.map(item => item.id)}/>
                </div>
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
                    <div className="flex-1 pl-4">Availability</div>
                    <div className="flex-1">Download QR Code</div>
                </div>
                <ul>
                    {filteredList.map((item) => (
                      <li key={item.id} className="flex py-2 border-t">
                        <div className="flex-1 pl-4">{item.name}</div>
                        <div className="flex-1 pl-4">{item.category}</div>
                        <div className="flex-1 pl-4">{item.availability}</div>
                        <QRCodeGenerator equipmentID={item.id}/>
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