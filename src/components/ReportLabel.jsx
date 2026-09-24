import React from 'react';
import { useRouter } from 'next/navigation';
import { IoIosArrowDroprightCircle } from "react-icons/io";

function ReportLabel({ report, backgroundColor }) {
    const router = useRouter();

    return (
        <div className='report-row p-4 rounded-lg relative my-4' style={{backgroundColor: backgroundColor}}>
            <IoIosArrowDroprightCircle
                className='absolute right-4 top-1/2 transform -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10'
                color='#426276'
                onClick={() => router.push(`/report-summary?reportId=${encodeURIComponent(report.reportID)}`)}
                />
            <h2 className='font-bold text-lg sm:text-xl md:text-2xl p-2'>Item: {report.item}</h2>
            <p className='pl-2 text-sm sm:text-base md:text-lg'>Reported By: {report.user}</p>
        </div>
    );
  }

  export default ReportLabel;
