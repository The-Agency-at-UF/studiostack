import React, { useState, useEffect } from "react";
import { BarChart, Bar, Rectangle, XAxis, YAxis, Tooltip } from 'recharts';

function BarGraph({ data, colors, title, fullData }) {
    const [setting, setSetting] = useState("All-Time");
    const [displayedData, setDisplayedData] = useState(data);
    const currentDate = new Date();

    const handleSettingChange = (newSetting) => {
        setSetting(newSetting);

        //time range based on the setting
        let timeRange;
        if (newSetting === 'Past 30 Days') {
            timeRange = 30;
        } else if (newSetting === 'Past 60 Days') {
            timeRange = 60;
        } else if (newSetting === 'Past 90 Days') {
            timeRange = 90;
        } else {
            countValues(fullData);
            return;
        }
  
        //filter data that fall within the selected time range
        const filteredData = fullData.filter(item => {
        const reservationDate = item.time; 
        const daysAgo = (currentDate - reservationDate) / (1000 * 60 * 60 * 24); 
        return daysAgo <= timeRange;
        });
  
        countValues(filteredData)
    };

    //count occurences of the item
    const countValues = (filteredData) => {
        const updatedItems = {};
        filteredData.forEach(item => {
            updatedItems[item.name] = (updatedItems[item.name] || 0) + 1;
        });

        updateData(updatedItems);
    };

    //update to the top 5 data
    const updateData = (item) => {
        const topValues = Object.entries(item)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value) 
          .slice(0, 5);
        
        setDisplayedData(topValues);
      };

    useEffect(() => {
        if (data.length > 0) {
            setDisplayedData(data);
        }
    }, [data]);

    return (
        <div className="pt-8">
            <h2 className="sm:pl-6 text-xl sm:text-2xl text-center sm:text-left font-semibold pb-4">{title}: {setting}</h2>
            <div className="flex flex-col sm:flex-row items-center sm:items-center">
                <div>
                    <BarChart width={350} height={200} data={displayedData}>
                    <XAxis dataKey="name" tick={false} />
                    <YAxis />
                    <Tooltip />
                    <Bar
                        dataKey="value"
                        fill={(data, index) => colors[index % colors.length]} 
                        shape={(props) => <Rectangle {...props} fill={colors[props.index % colors.length]} />}
                        />
                    </BarChart>
                </div>
                <div className="sm:pl-8 pt-4 sm:pt-0 text-center sm:text-left flex flex-col justify-center">
                    {displayedData.map((entry, index) => (
                    <div key={index} className="flex items-center justify-center sm:justify-start space-x-2">
                        <span 
                        className="w-3 h-3 rounded-full inline-block" 
                        style={{ backgroundColor: colors[index % colors.length] }}
                        ></span>
                        <p className="text-sm md:text-base">{entry.name}</p>
                    </div>
                    ))}
                </div>
            </div>
            <div className='sm:pl-6 text-white text-sm sm:text-base pt-2 sm:pt-0'>
                <button 
                className='bg-[#426276] rounded-l-md border border-white p-1 sm:p-2 hover:bg-[#283b47] hover:cursor-pointer'
                onClick={() => handleSettingChange('Past 30 Days')}
                >Past 30 Days</button>
                <button 
                className='bg-[#426276] border border-white p-1 sm:p-2 hover:bg-[#283b47] hover:cursor-pointer'
                onClick={() => handleSettingChange('Past 60 Days')}
                >Past 60 Days</button>
                <button 
                className='bg-[#426276] border border-white p-1 sm:p-2 hover:bg-[#283b47] hover:cursor-pointer'
                onClick={() => handleSettingChange('Past 90 Days')}
                >Past 90 Days</button>
                <button 
                className='bg-[#426276] rounded-r-md border border-white p-1 sm:p-2 hover:bg-[#283b47] hover:cursor-pointer'
                onClick={() => handleSettingChange('All-Time')}
                >All-Time</button>
            </div>
        </div>
    );
};

export default BarGraph;