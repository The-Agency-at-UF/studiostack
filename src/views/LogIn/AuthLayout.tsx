import type {ReactNode} from 'react'
/** The sign-in frame: the lava brand panel beside the form column titled by `login-title`. */
export default function AuthLayout({children,className}:{children:ReactNode;className?:string}) {
  return <main className={className?`login-page ${className}`:'login-page'}>
    <section className="login-brand" aria-label="About StudioStack">
      <div className="login-lava" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
      <div className="login-brand-center">
        <div className="login-wordmark">StudioStack</div>
        <p>Production, equipment, <br />and your team.</p>
      </div>
    </section>
    <section className="login-access" aria-labelledby="login-title">
      <div className="login-form-area">
        {children}
      </div>
    </section>
  </main>
}
