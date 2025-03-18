import React, { useEffect, useState } from 'react';
import { getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { IoIosAddCircle } from "react-icons/io";
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase/firebaseConfig';
import ReportLabel from '../../components/ReportLabel';

function Reports({ isAdmin }) { 
    const [reports, setReports] = useState([]);
    const [activeReports, setActiveReports] = useState([]);
    const [resolvedReports, setResolvedReports] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchReports = async () => {
        try {
            const reportsRef = collection(db, 'reports');
                
            //get all the reservations in the 'reservations' collection
            const querySnapshot = await getDocs(reportsRef);
                    
            //map through each reservation and extract the data
            const reportsList = querySnapshot.docs.map(doc => ({
                reportID: doc.id,
                ...doc.data()
            }));

            const userReports = reportsList.filter(report => report.user === localStorage.getItem('email'));
            const allReports = reportsList;

            // if regular user - only show their reports
            if (!isAdmin) {
                setReports(userReports);
                const activeReportsList = userReports.filter(report => report.resolved === false);
                setActiveReports(activeReportsList);

                const resolvedReportsList = userReports.filter(report => report.resolved === true);
                setResolvedReports(resolvedReportsList);
            }
            else {
            // if admin - show every user's reports
                setReports(allReports);
                const activeReportsList = allReports.filter(report => report.resolved === false);
                setActiveReports(activeReportsList);

                const resolvedReportsList = allReports.filter(report => report.resolved === true);
                setResolvedReports(resolvedReportsList);
            }
            
        } catch (error) {
            console.error("Error fetching reports:", error);
        }
    };
    
    fetchReports();
    }, []);
        
    return (
        <div className='bg-white m-8 p-8 rounded-lg relative'>
            <div className='pl-2 pr-2'>
                <div className='absolute top-6 right-6 sm:top-8 sm:right-8 flex space-x-4'>
                    <IoIosAddCircle color='#426276' className='w-8 h-8 sm:w-10 sm:h-10' onClick={ () => navigate('/create-report')}/>
                </div>
                <div>
                    <h1 className='font-bold text-2xl md:text-3xl pb-6'>Active Reports</h1>
                    <div className='w-full'>
                        {activeReports.map((report, index) => (
                            <ReportLabel key={index} report={report} backgroundColor={'#D1E0EF'}/>
                        ))} 
                    </div>
                </div>
                <div>
                    <h1 className='font-bold text-2xl md:text-3xl py-6'>Resolved Reports</h1>
                    <div className='w-full'>
                        {resolvedReports.map((report, index) => (
                            <ReportLabel key={index} report={report} backgroundColor={'#D1E0EF'}/>
                        ))} 
                    </div>
                </div>
            </div>
        </div>
    );
  }
  
  export default Reports;