
import React, { useEffect, useState } from 'react';
import { getDocs, collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import AddUserPopup from '../../components/AddUserPopup';
import RemoveUserPopup from '../../components/RemoveUserPopUp';
import ConfirmationPopup from "../../components/ConfirmationPopup";

function Users({ isAdmin }) { 
    const [users, setUsers] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [students, setStudents] = useState([]);
    const [message, setMessage] = useState(null);

    //fetches all the students and admins from the database
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

    useEffect(() => {
        fetchUsers();
    }, []);

    //adds user to database
    const addEmail = (isAdminBool, email) => { 
        if (!students.some(user => user.email === email) && !admins.some(user => user.email === email) && email.includes("@ufl.edu")) {
            const userRef = doc(db, 'users', email);
            setDoc(userRef, { isAdmin: isAdminBool });
            setMessage({ text: "User added successfully.", type: "success" });
            fetchUsers();
        } else {
            setMessage({ text: "Invalid email. Must be a UFL email and not already in the database.", type: "error" });
        }
    }

    //removes user from database
    const removeEmail = async (selectedEmail) => {
        if (students.some(user => user.email === selectedEmail)) {
            //removes student
            const userRef = doc(db, 'users', selectedEmail);
            await deleteDoc(userRef);
            setMessage({ text: "Student removed successfully.", type: "success" });
            fetchUsers();
        } else if (admins.some(user => user.email === selectedEmail)) {
            //removes admin
            //cant remove last admin
            if (admins.length === 1) {
                setMessage({ text: "Cannot remove the last admin. Please add another admin before removing this one.", type: "error" });
            } else {
                const userRef = doc(db, 'users', selectedEmail);
                await deleteDoc(userRef);
                setMessage({ text: "Admin removed successfully.", type: "success" });
                fetchUsers();
            }
        } else {
            setMessage({ text: "Invalid email. Must be in the database.", type: "error" });
        }
    }

    //changes the role of the user (student -> admin and vice versa)
    const handleRoleChange = async (email) => {
        const userRef = doc(db, 'users', email);
        if (admins.some(user => user.email === email)) {
            if (admins.length === 1) {
                setMessage({ text: "Cannot remove the last admin. Please add another admin before removing this one.", type: "error" });
                return;
            }
            await setDoc(userRef, { isAdmin: false }, { merge: true });
        } else {
            await setDoc(userRef, { isAdmin: true }, { merge: true });
        }
        setMessage({ text: "User role updated successfully.", type: "success" });
        fetchUsers();
    }

    if (!isAdmin) {
        return <h1>You must be an admin to view this page.</h1>;
    }

    return (
        <div className='bg-white m-8 p-8 rounded-lg relative'>
            <div className='pl-2 pr-2'>
                <h1 className='font-bold text-2xl md:text-3xl pb-6'>Users</h1>
                {message && (
                    <div className={`p-4 mb-4 rounded ${message.type === 'success' ? 'bg-green-100 text-green-800 border border-green-400' : 'bg-red-100 text-red-800 border border-red-400'}`}>
                        {message.text}
                        <button onClick={() => setMessage(null)} className="float-right font-bold">×</button>
                    </div>
                )}
                <div className="absolute top-8 right-8 flex space-x-4">
                    <AddUserPopup addEmail={addEmail}/>
                    <RemoveUserPopup removeEmail={removeEmail} listOfEmails={users.map(user => user.email)}/>
                </div>
            </div>
            <div className="p-4 overflow-x-auto">
                <div className='min-w-[700px]'>
                    <div className="flex py-2 font-semibold">
                        <div className="flex-1 pl-4">Email</div>
                        <div className="flex-1">Role</div>
                        <div className="flex-1">Change Role</div>
                    </div>
                    <ul>
                        {admins.map((user) => (
                            <li key={user.email} className="flex py-2 border-t">
                                <div className="flex-1 pl-4 text-sm md:text-base">{user.email}</div>
                                <div className="flex-1 text-sm md:text-base">Admin</div>
                                <ConfirmationPopup handle={() => handleRoleChange(user.email)} text={`change ${user.email}'s role from admin to student`} isReservation={false} />
                            </li>
                        ))}
                    </ul>
                    <ul>
                        {students.map((user) => (
                            <li key={user.email} className="flex py-2 border-t">
                                <div className="flex-1 pl-4 text-sm md:text-base">{user.email}</div>
                                <div className="flex-1 text-sm md:text-base">Student</div>
                                <ConfirmationPopup handle={() => handleRoleChange(user.email)} text={`change ${user.email}'s role from student to admin`} isReservation={false} />
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
  }
  
  export default Users;