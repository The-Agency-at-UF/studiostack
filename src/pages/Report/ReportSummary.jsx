import React, {useState, useEffect} from 'react'
import { getDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore"; 
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
    const resolveReport = (reportID) => {  
        try {
            const reportRef = doc(db, 'reports', reportID);
            updateDoc(reportRef, {
                resolved: true,
                resolvedOn: serverTimestamp(),
                resolvedBy: userEmail
              });
            setTimeout(() => window.location.reload(), 500);
        }
        catch(error) {
            alert("Error resolving report.");
            console.log("Error resolving report.", error);
        }
    }


  return (
    <div className='bg-white m-8 p-8 rounded-lg relative'>
        <div className='pl-2 pr-2'>
            <h1 className='font-bold text-3xl pb-6'>Report Summary</h1>
            </div>
            {report?.resolved == true &&
                <ResolvedLabel resolvedBy={report?.resolvedBy} resolvedOn={formatDate(report?.resolvedOn)}/>
            }
        <div className='flex flex-wrap'>
            <div className='flex-auto'>
                <div>
                    <h2 className='pl-2 pt-2 font-bold text-lg sm:text-xl'>Subject:</h2>
                    <div className='pl-2 py-2'>
                        {report?.subject}
                    </div>
                </div>
                <div>
                    <h2 className='pl-2 pt-2 font-bold text-lg sm:text-xl'>Item:</h2>
                    <div className='pl-2 py-2'>
                        {report?.item}
                    </div>
                </div>
                <div>
                    <h2 className='pl-2 pt-2 font-bold text-lg sm:text-xl'>Reported By:</h2>
                    <div className='pl-2 py-2'>
                        {report?.user}
                    </div>
                </div>
                <div>
                <h2 className='pl-2 pt-2 font-bold text-lg sm:text-xl'>Description of the Issue:</h2>
                    <div className='pl-2 py-2'>
                        {report?.message}
                    </div> 
                </div>
                <div>
                <h2 className='pl-2 pt-2 font-bold text-lg sm:text-xl'>Reported On:</h2>
                    <div className='pl-2 py-2'>
                        {formatDate(report?.timestamp)}
                    </div> 
                </div>
            </div>
        </div>
        <div className='flex justify-center'> 
        {isAdmin && report?.resolved == false &&
        <button 
            className="px-6 py-2 bg-[#A3C1E0] hover:bg-[#426276] hover:text-white rounded-md text-lg sm:text-xl font-bold mt-4 cursor-pointer"
            onClick={() => resolveReport(reportID)}
            >
            Resolve
        </button>
        }
        </div>
    </div>
    );
}

export default ReportSummary