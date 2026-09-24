import 'reactjs-popup/dist/index.css'
import '../src/index.css'
import '../src/App.css'
import '../src/views/Calendar/Calendar.css'
import '../src/views/Calendar/MiniCalendar.css'
import AppShell from '../src/components/AppShell'

export const metadata = {
  title: 'StudioStack',
  description: 'Production equipment operations for The Agency at UF',
  icons: { icon: '/favicon.png' },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><AppShell>{children}</AppShell></body>
    </html>
  )
}
