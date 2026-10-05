import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyTheme, initialTheme } from './lib/theme';
import './styles.css';

applyTheme(initialTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary what="the page">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
