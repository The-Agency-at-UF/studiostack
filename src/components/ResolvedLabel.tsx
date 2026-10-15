import React from 'react';
import { IoIosCheckmarkCircle } from "react-icons/io";

function ResolvedLabel({ resolvedBy, resolvedOn }: { resolvedBy?: string; resolvedOn: string }) {
    return (
        <div className='p-4 rounded-lg relative my-4 flex items-center' style={{backgroundColor: 'var(--accent-soft)'}}>
            <IoIosCheckmarkCircle color='var(--accent)' className='w-8 h-8'/>
            <h1 className='text-md sm:text-lg md:text-xl p-2'>
                This issue was resolved by {resolvedBy} on {resolvedOn}.
            </h1>
        </div>
    );
  }

  export default ResolvedLabel;
