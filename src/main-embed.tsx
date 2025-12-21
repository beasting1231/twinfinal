import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { BookingRequestForm } from './components/BookingRequestForm'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BookingRequestForm />
  </StrictMode>,
)
