import React, {useState, useEffect} from 'react'
import { collection, addDoc, getDocs } from "firebase/firestore"; 
import { db } from "../../firebase/firebaseConfig";
import Header from "../../components/Header"

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
      <Header />
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
  )
}

export default Inventory;