import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@repo/ui/styles.css';
import '@mantine/notifications/styles.css';
import { Notifications } from '@mantine/notifications';
import { AppUiProvider } from '@repo/ui';
import { App } from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppUiProvider defaultColorScheme="light">
      <Notifications />
      <App />
    </AppUiProvider>
  </StrictMode>,
)
