import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { GiftVoucherForm } from './components/GiftVoucherForm'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GiftVoucherForm />
  </StrictMode>,
)
