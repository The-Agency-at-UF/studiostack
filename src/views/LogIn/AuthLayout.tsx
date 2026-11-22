'use client'
import {useEffect,useState} from 'react'
import type {ReactNode} from 'react'
import {HiOutlinePause,HiOutlinePlay} from 'react-icons/hi2'
const pauseKey='studiostack.login-motion-paused'
/** The sign-in frame: the lava brand panel beside the form column titled by `login-title`. */
export default function AuthLayout({children,className}:{children:ReactNode;className?:string}) {
  // The background moves for as long as the page is open, so it can be paused (WCAG 2.2.2); the choice is remembered.
  const [paused,setPaused]=useState(false)
  useEffect(()=>{try{setPaused(localStorage.getItem(pauseKey)==='1')}catch{/* storage unavailable */}},[])
  const toggle=()=>setPaused(p=>{try{localStorage.setItem(pauseKey,p?'0':'1')}catch{/* storage unavailable */}return !p})
  return <main className={className?`login-page ${className}`:'login-page'} data-motion-paused={paused||undefined}>
    <section className="login-brand" aria-label="About StudioStack">
      <div className="login-lava" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
      <div className="login-brand-center">
        <div className="login-wordmark">StudioStack</div>
        <p>Production, equipment, <br />and your team.</p>
      </div>
      <button type="button" className="login-motion-toggle" aria-pressed={paused} onClick={toggle}>{paused?<HiOutlinePlay aria-hidden="true"/>:<HiOutlinePause aria-hidden="true"/>}Pause background animation</button>
    </section>
    <section className="login-access" aria-labelledby="login-title">
      <div className="login-form-area">
        {children}
      </div>
    </section>
  </main>
}
