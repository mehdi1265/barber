import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Providers } from './app/providers'
import { router } from './app/router'
import { bootstrapApp } from './app/bootstrap'
import './index.css'

// Bootstrap database and auth before rendering
bootstrapApp()
  .then(() => {
    const root = document.getElementById('root')
    if (!root) throw new Error('Root element not found')

    createRoot(root).render(
      <StrictMode>
        <Providers>
          <RouterProvider router={router} />
        </Providers>
      </StrictMode>
    )
  })
  .catch(err => {
    console.error('Fatal: app bootstrap failed', err)
    document.body.innerHTML = `
      <div style="padding:2rem;text-align:center;font-family:sans-serif">
        <h2>خطا در راه‌اندازی برنامه</h2>
        <p>${String(err)}</p>
      </div>
    `
  })
