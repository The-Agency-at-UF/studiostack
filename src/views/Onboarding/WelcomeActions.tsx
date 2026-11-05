import type {ReactNode} from 'react'
import {HiOutlineArrowRight} from 'react-icons/hi2'
/** Secondary link on the left, the step's one primary action on the right, within reach of a right thumb. */
export default function WelcomeActions({secondary,primary,busy=false,form}:{secondary?:ReactNode;primary:string;busy?:boolean;form?:string}) {
  return <div className="welcome-actions">
    {secondary??<span/>}
    <button className="welcome-primary" type="submit" form={form} disabled={busy}>{primary}<HiOutlineArrowRight aria-hidden="true"/></button>
  </div>
}
