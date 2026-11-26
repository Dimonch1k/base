'use client'

import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute='class' forcedTheme='dark' enableSystem={false}>
      {children}
      <Toaster theme='dark' position='top-center' closeButton richColors />
    </ThemeProvider>
  )
}
