import React, { useEffect, useState } from 'react';
import { db, getDocs, collection } from '../../data/localStore';
import { IoIosAddCircle } from "react-icons/io";
import { useRouter } from 'next/navigation';
import ReportLabel from '../../components/ReportLabel';

function Reports({ isAdmin }) {
    const [reports, setReports] = useState([]);
    const [activeReports, setActiveReports] = useState([]);
    const [resolvedReports, setResolvedReports] = useState([]);
    const [noActiveReports, setNoActiveReports] = useState(false);
    const [noResolvedReports, setNoResolvedReports] = useState(false);
    const router = useRouter();

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
                if (activeReportsList.length == 0) {
                    setNoActiveReports(true)
                }
                setActiveReports(activeReportsList);

                const resolvedReportsList = userReports.filter(report => report.resolved === true);
                if (resolvedReportsList.length == 0) {
                    setNoResolvedReports(true)
                }
                setResolvedReports(resolvedReportsList);
            }
            else {
            // if admin - show every user's reports
                setReports(allReports);
                const activeReportsList = allReports.filter(report => report.resolved === false);
                if (activeReportsList.length == 0) {
                    setNoActiveReports(true)
                }
                setActiveReports(activeReportsList);

                const resolvedReportsList = allReports.filter(report => report.resolved === true);
                if (resolvedReportsList.length == 0) {
                    setNoResolvedReports(true)
                }
                setResolvedReports(resolvedReportsList);
            }

        } catch (error) {
            console.error("Error fetching reports:", error);
        }
    };

    fetchReports();
    }, [reports]);

    return (
        <div className='workspace-surface reports-workspace bg-white m-8 p-8 rounded-lg relative'>
            <div className='pl-2 pr-2'>
                <div className='workspace-actions absolute top-6 right-6 sm:top-8 sm:right-8 flex space-x-4'>
                    <IoIosAddCircle color='#426276' className='w-8 h-8 sm:w-10 sm:h-10' onClick={ () => router.push('/create-report')}/>
                </div>
                <div className='report-section'>
                    <h1 className='font-bold text-2xl md:text-3xl pb-6 border-b'>Active Reports</h1>
                    <div className='w-full'>
                        { noActiveReports ?
                            <p className='workspace-empty mt-4'>You have no active reports!</p>
                        :
                        <div>
                            {activeReports.map((report, index) => (
                                <ReportLabel key={index} report={report} backgroundColor={'#D1E0EF'}/>
                            ))}
                        </div>
                        }
                    </div>
                </div>
                <div className='report-section'>
                    <h1 className='font-bold text-2xl md:text-3xl py-6 border-b'>Resolved Reports</h1>
                    <div className='w-full'>
                    { noResolvedReports ?
                        <p className='workspace-empty mt-4'>You have no resolved reports!</p>
                    :
                    <div>
                        {resolvedReports.map((report, index) => (
                            <ReportLabel key={index} report={report} backgroundColor={'#D1E0EF'}/>
                        ))}
                    </div>
                    }
                    </div>
                </div>
            </div>
        </div>
    );
  }

  export default Reports;
