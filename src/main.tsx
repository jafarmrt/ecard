import {StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
// Self-hosted Vazirmatn (variable font, ~110 KB) instead of Google Fonts / jsDelivr, which are slow or blocked in Iran.
import 'vazirmatn/Vazirmatn-Variable-font-face.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <App />
    </Suspense>
  </StrictMode>,
);
