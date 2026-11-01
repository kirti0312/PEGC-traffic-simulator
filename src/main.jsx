import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import App from './App.jsx';

// No StrictMode: the controller attaches to the canvas once and owns the animation loop.
createRoot(document.getElementById('root')).render(<App />);
