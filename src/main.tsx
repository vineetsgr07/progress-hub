import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, localStorageColorSchemeManager } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { registerSW } from 'virtual:pwa-register'
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import './index.css'
import App from './App.tsx'
import { theme } from './theme'
import { TagColorsProvider } from './features/TagColorsContext'
import { COLOR_SCHEME_KEY } from './features/theme-copy'

registerSW({ immediate: true })

const colorSchemeManager = localStorageColorSchemeManager({
  key: COLOR_SCHEME_KEY,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider
      theme={theme}
      defaultColorScheme="light"
      colorSchemeManager={colorSchemeManager}
    >
      <DatesProvider settings={{ locale: 'en', firstDayOfWeek: 1 }}>
        <TagColorsProvider>
          <App />
        </TagColorsProvider>
      </DatesProvider>
    </MantineProvider>
  </StrictMode>,
)
