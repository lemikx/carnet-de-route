import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/manrope';
import 'leaflet/dist/leaflet.css';
import './ui/app.css';
import { AppProvider } from './app/AppContext';
import { router } from './app/router';
import { setupAutoUpdate } from './app/pwa';

if ('serviceWorker' in navigator) setupAutoUpdate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  </StrictMode>,
);
