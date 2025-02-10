import React, {useState, useEffect} from 'react'
import { collection, addDoc, getDocs } from "firebase/firestore"; 
import { db } from "../../firebase/firebaseConfig";

const Inventory = () => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [inventory, setInventory] = useState([]);

  const inventoryCollectionRef = collection(db, "inventory");

  // categories for a dropdown
  const categories = ["Camera & Accessories", "Audio", "Lights", "Production Design", "Cables & Cords", "Miscellaneous"];

  // add item to inventory
  const addItem = async () => {
    await addDoc(inventoryCollectionRef, { name: name, category: category });
  }

  // get all inventory items
  useEffect(() => {
    const getInventory = async () => {
      try {
        const data = await getDocs(inventoryCollectionRef);
        setInventory(data.docs.map((doc) => ({...doc.data(), id:doc.id})))
      } 
      catch(error) {
        console.log(error);
      }
    }
    getInventory();
  }, []);

  return (
    <div>
      <div className='bg-white m-8 p-8 rounded-lg relative'>
        <input placeholder="Enter item name..." 
          onChange={(event) => {
            setName(event.target.value)
          }}
        />
        {/* replace this with a dropdown */}
        <input placeholder="Enter item category..." 
          onChange={(event) => {
            setCategory(event.target.value)
          }}
        />
        <button 
          className="bg-blue-600 text-white font-semibold py-2 px-4"
          onClick={addItem}> 
          Add Item 
        </button>
      </div>

      <div className='bg-white m-8 p-8 rounded-lg relative'>
            <div className='pl-2 pr-2'>
                <h1 className='font-bold text-3xl pb-6'>All Items</h1>
                <div className="absolute top-8 right-8 flex space-x-4"></div>
            </div>
            <div className="p-4">
            </div>
        </div>
    </div>
  )
}

export default Inventory;