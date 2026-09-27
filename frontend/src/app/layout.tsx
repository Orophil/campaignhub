import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'CampaignHub',
  description: 'Social media content approval for agency teams',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
