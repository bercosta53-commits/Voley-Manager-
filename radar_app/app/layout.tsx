import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/manrope';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Avisos } from '@/components/avisos';
import { SCRIPT_TEMA } from '@/components/hoje/tema';

export const metadata: Metadata = {
  title: 'Velora Radar',
  description: 'Sinais de ABM das contas-alvo da Velora e o que fazer a respeito.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f2ec' },
    { media: '(prefers-color-scheme: dark)', color: '#16171a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        <TooltipProvider>
          {children}
          <Avisos />
        </TooltipProvider>
      </body>
    </html>
  );
}
