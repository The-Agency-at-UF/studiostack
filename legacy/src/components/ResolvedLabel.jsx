import React from 'react';
import { IoIosCheckmarkCircle } from "react-icons/io";

function ResolvedLabel({ resolvedBy, resolvedOn }) { 
    return (
        <div className='p-4 rounded-lg relative my-4 flex items-center' style={{backgroundColor: '#D1E0EF'}}>
            <IoIosCheckmarkCircle color='#426276' className='w-8 h-8'/>
            <h1 className='text-md sm:text-lg md:text-xl p-2'>
                This issue was resolved by {resolvedBy} on {resolvedOn}.
            </h1>
        </div>
    );
  }
  
  export default ResolvedLabel;