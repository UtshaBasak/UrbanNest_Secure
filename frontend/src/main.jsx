import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { installCsrfFetch } from './utils/csrf.js'

// Attach the CSRF header to every state-changing API request
installCsrfFetch()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
