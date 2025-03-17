import React from 'react';

function ResolvedLabel({ resolvedBy, resolvedOn }) { 
    return (
        <div className='p-4 rounded-lg relative my-4' style={{backgroundColor: '#D1E0EF'}}>
            <h1 className='text-lg sm:text-xl md:text-2xl p-2'>
                This issue was resolved by {resolvedBy} on {resolvedOn}.
            </h1>
        </div>
    );
  }
  
  export default ResolvedLabel;