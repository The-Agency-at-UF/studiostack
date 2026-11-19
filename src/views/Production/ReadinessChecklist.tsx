import { HiOutlineFlag, HiOutlineCheckCircle, HiOutlineClock } from 'react-icons/hi2'
import type { ProductionBrief } from '../../types/production'
import { productionReadiness } from '../../production/readiness'
export default function ReadinessChecklist({ brief }: { brief:ProductionBrief }) {
  const readiness = productionReadiness(brief)
  return <section className="production-readiness" aria-label="Production readiness"><h3>{readiness.flagged && <HiOutlineFlag aria-label="Shoot needs attention" />}Shoot readiness</h3>
    {readiness.flagged && <p role="alert" className="production-error">Shoot is within 3 days. Resolve: {readiness.missing.join(', ')}.</p>}
    <ul>{readiness.checks.map(check=><li key={check.label}>{check.complete ? <HiOutlineCheckCircle aria-hidden="true"/> : <HiOutlineClock aria-hidden="true"/>}<span>{check.label}: <strong>{check.complete?'Complete':'Missing'}</strong></span></li>)}</ul>
  </section>
}
