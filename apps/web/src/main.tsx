import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<StrictMode><main><p className="eyebrow">Tendly</p><h1>A little more room for everyday life.</h1><p>The application foundation is installed. Household setup and task workflows are coming in the next implementation stages.</p><p className="status">Development build · Stage 1</p></main></StrictMode>);
