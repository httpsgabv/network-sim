import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import App from './App';
import { useSim } from './store';
import { plan } from './sim/engine';

// Dev-only handle for poking the simulation from the console (perf runs, debugging).
if (import.meta.env.DEV) Object.assign(window, { __sim: { useSim, plan } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
