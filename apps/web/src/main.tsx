import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './accounts/i18n.js';
import { App } from './accounts/App.js';
import './style.css';
import './workspace-design.css';
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(root).render(<StrictMode><QueryClientProvider client={client}><App /></QueryClientProvider></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}); });
