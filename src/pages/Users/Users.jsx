
import React, { useEffect, useState } from 'react';
import { getDocs, collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import AddUserPopup from '../../components/AddUserPopup';
import RemoveUserPopup from '../../components/RemoveUserPopUp';

function Users({ isAdmin }) { 
    const [users, setUsers] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [students, setStudents] = useState([]);

    //fetches all the students and admins from the database
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const usersRef = collection(db, 'users');
                
                //get all the users in the 'users' collection
                const querySnapshot = await getDocs(usersRef);
                
                //map through each user and extract the data
                const allUsersList = querySnapshot.docs.map(doc => ({
                    email: doc.id, 
                    ...doc.data()
                }));
                
                setUsers(allUsersList);
                const studentsList = allUsersList.filter(user => !user.isAdmin);
                const adminsList = allUsersList.filter(user => user.isAdmin);

                setStudents(studentsList);
                setAdmins(adminsList);

            } catch (error) {
                console.error("Error fetching users:", error);
            }
        };
        fetchUsers();
    }, []);

    //adds user to database
    const addEmail = (isAdminBool, email) => { 
        //TO DO: email.includes("@ufl.edu") after website/testing is over
        if (!students.some(user => user.email === email) && !admins.some(user => user.email === email)) {
            const userRef = doc(db, 'users', email);
            setDoc(userRef, { isAdmin: isAdminBool });
            alert("User added successfully.");
            setTimeout(() => window.location.reload(), 1000);
        } else {
            alert("Invalid email. Must be a UFL email and not already in the database.");
        }
    }

    //removes user from database
    const removeEmail = async (selectedEmail) => {
        if (students.some(user => user.email === selectedEmail)) {
            const userRef = doc(db, 'users', selectedEmail);
            await deleteDoc(userRef);
            alert("Student removed successfully.");
            setTimeout(() => window.location.reload(), 1000);
        } else if (admins.some(user => user.email === selectedEmail)) {
            if (admins.length === 1) {
                alert("Cannot remove the last admin. Please add another admin before removing this one.");
            } else {
                const userRef = doc(db, 'users', selectedEmail);
                await deleteDoc(userRef);
                alert("Admin removed successfully.");
                setTimeout(() => window.location.reload(), 1000);
            }
        } else {
            alert("Invalid email. Must be in the database.");
        }
    }

    if (!isAdmin) {
        return <h1>You must be an admin to view this page.</h1>;
    }

    return (
        <div className='bg-white m-8 p-8 rounded-lg relative'>
            <div className='pl-2 pr-2'>
                <h1 className='font-bold text-3xl pb-6'>Users</h1>
                <div className="absolute top-8 right-8 flex space-x-4">
                    <AddUserPopup addEmail={addEmail}/>
                    <RemoveUserPopup removeEmail={removeEmail} listOfEmails={users.map(user => user.email)}/>
                </div>
            </div>
            <div className="p-4">
                <div className="flex py-2 font-semibold">
                    <div className="flex-1 pl-4">Email</div>
                    <div className="flex-1">Role</div>
                </div>
                <ul>
                    {admins.map((user) => (
                        <li key={user.email} className="flex py-2 border-t">
                            <div className="flex-1 pl-4">{user.email}</div>
                            <div className="flex-1">Admin</div>
                        </li>
                    ))}
                </ul>
                <ul>
                    {students.map((user) => (
                        <li key={user.email} className="flex py-2 border-t">
                            <div className="flex-1 pl-4">{user.email}</div>
                            <div className="flex-1">Student</div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
  }
  
  export default Users;