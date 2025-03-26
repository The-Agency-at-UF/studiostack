import React, {useState, useEffect} from 'react'
import { getDoc, doc, serverTimestamp, updateDoc, addDoc, collection } from "firebase/firestore"; 
import { useLocation } from "react-router-dom";
import { db } from "../../firebase/firebaseConfig";
import ResolvedLabel from '../../components/ResolvedLabel';

function ReportSummary({ isAdmin, userEmail }) {
    const location = useLocation();
    const reportID = location.state;
    const [report, setReport] = useState();

    const formatDate = (timestamp) => {
        if (timestamp && timestamp.seconds) {
            const date = new Date(timestamp.seconds * 1000); 
            const options = {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
            };
            return date.toLocaleString(undefined, options);
        }
        return 'Invalid date';
    };

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

    // get report item information
    useEffect(() => {
        const fetchReports = async () => {
            try {
                const reportRef = doc(db, 'reports', reportID);
                const reportVar = await getDoc(reportRef);

                if (reportVar.exists()) {
                    const reportData = reportVar.data();
                    setReport(reportData);
                }
            } catch(error) {
                console.log("Could not fetch report", error);
            }
        }
        fetchReports();
    }, [reportID])


    // update a report once it has been resolved
    const resolveReport = async (reportID) => {  
        try {
            const reportRef = doc(db, 'reports', reportID);
            updateDoc(reportRef, {
                resolved: true,
                resolvedOn: serverTimestamp(),
                resolvedBy: userEmail
              });

            // send a notification to user
            const reportDoc = await getDoc(reportRef);
            const notificationsRef = await addDoc(collection(db, "notifications"), {
                item: reportDoc.data().item, 
                itemId: reportDoc.data().itemId,
                userEmail: reportDoc.data().user,
                resolvedBy: userEmail,
                type: "report",
                time: serverTimestamp()
            });
            setTimeout(() => window.location.reload(), 500);
        }
        catch(error) {
            alert("Error resolving report.");
            console.log("Error resolving report.", error);
        }
    }

    const setItemToAvailable = (itemId) => { 
        // set item availability/status back to available
        const itemRef = doc(db, 'inventory', itemId);
        updateDoc(itemRef, {
            availability: "available"
        });
    }

  return (
    <div className='bg-white m-8 p-8 rounded-lg relative'>
        <div className='pl-2 pr-2 font-semibold'>
            <h1 className='text-3xl pb-4'>Report Summary</h1>
            <p>Reported On: {formatDate(report?.timestamp)}</p>
        </div>
        {/* If the report has been resolved, show a message */}
        {report?.resolved == true &&
            <ResolvedLabel resolvedBy={report?.resolvedBy} resolvedOn={formatDate(report?.resolvedOn)}/>
        }
        <div className="container py-4"> 
            <div className="flex flex-col md:flex-row gap-4"> 
                <div className="flex-1 p-4 rounded"> 
                    <h2 className="text-xl sm:text-2xl text-left pb-4">Subject:</h2>
                    <div className="bg-[#ECECEC] w-full p-2 rounded-md border-2 border-black flex items-center justify-between mb-2"> 
                        <div className="bg-white rounded-md p-2 w-full text-left lg:text-xl sm:text-lg text-sm">
                            <h3>{report?.subject}</h3>
                        </div>                                
                    </div>                          
                </div>
                <div className="flex-1 p-4 ml-2 rounded"> 
                    <h2 className="text-xl sm:text-2xl text-left pb-4">Reported By:</h2>
                    <div className="bg-[#ECECEC] w-full p-2 rounded-md border-2 border-black flex items-center justify-between"> 
                        <div className="bg-white rounded-md p-2 w-full text-left lg:text-xl sm:text-lg text-sm">
                            <h3>{report?.user}</h3>
                        </div> 
                    </div>                          
                </div>
            </div>
            <div className="flex flex-col md:flex-row gap-4"> 
                <div className="flex-1 p-4 rounded"> 
                    <h2 className="text-xl sm:text-2xl text-left pb-4">Item Name:</h2>
                    <div className="bg-[#ECECEC] w-full p-2 rounded-md border-2 border-black flex items-center justify-between mb-2"> 
                        <div className="bg-white rounded-md p-2 w-full text-left lg:text-xl sm:text-lg text-sm">
                            <h3>{report?.item}</h3>
                        </div>                                
                    </div>                          
                </div>
                <div className="flex-1 p-4 ml-2 rounded"> 
                    <h2 className="text-xl sm:text-2xl text-left pb-4">Item ID:</h2>
                    <div className="bg-[#ECECEC] w-full p-2 rounded-md border-2 border-black flex items-center justify-between"> 
                        <div className="bg-white rounded-md p-2 w-full text-left lg:text-xl sm:text-lg text-sm">
                            <h3>{report?.itemId}</h3>
                        </div> 
                    </div>                          
                </div>
            </div>
            <div className="flex flex-col md:flex-row gap-4"> 
                <div className="flex-1 p-4 rounded"> 
                    <h2 className="text-xl sm:text-2xl text-left pb-4">Description of the Issue:</h2>
                    <div className="bg-[#ECECEC] w-full p-2 rounded-md border-2 border-black flex items-center justify-between mb-2"> 
                        <div className="bg-white rounded-md p-2 w-full text-left lg:text-xl sm:text-lg text-sm">
                            <h3>{report?.message}</h3>
                        </div>                                
                    </div>                          
                </div>
            </div>
        </div>
        <div className='flex justify-center'> 
        {/* If user is an admin, they can resolve a report */}
        {isAdmin && report?.resolved == false &&
            <button 
                className="px-6 py-2 bg-[#A3C1E0] hover:bg-[#426276] hover:text-white rounded-md text-lg sm:text-xl font-bold mt-4 cursor-pointer"
                onClick={() => {
                    resolveReport(reportID);
                    setItemToAvailable(report.itemId);
                }}> 
                Resolve
            </button>
        }
        </div>
    </div>
    );
}

export default ReportSummary