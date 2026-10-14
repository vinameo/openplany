import { createRoot } from 'react-dom/client'
import './index.css'
import '@repo/ui/styles.css';
import '@mantine/notifications/styles.css';
import { Notifications } from '@mantine/notifications';
import { AppUiProvider } from '@repo/ui';
import { initLanguage } from './i18n/index.js';
import { App } from './App.tsx'

initLanguage();

createRoot(document.getElementById('root')!).render(
  <AppUiProvider defaultColorScheme="auto">
    <Notifications />
    <App />
  </AppUiProvider>,
)
