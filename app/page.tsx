'use client'
import LiveDashboard from '../src/views/Equipment/Dashboard'
import ProductionQueues from '../src/components/workspace/ProductionQueues'
export default function HomePage(){return <LiveDashboard production={<ProductionQueues/>}/>}
