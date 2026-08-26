import './globals.css';
import NavSidebar from '@/components/NavSidebar';
import { ToastProvider } from '@/components/ToastProvider';

export const metadata = {
  title: 'EPUB → PDF Converter',
  description: 'Convert EPUB books to print-ready PDFs.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Applied before hydration to avoid a flash of the wrong theme. Reads the
// same localStorage key as lib/theme.js.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('epub2pdf:theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (!stored && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100" suppressHydrationWarning>
        <ToastProvider>
          <div className="flex min-h-screen flex-col md:flex-row">
            <NavSidebar />
            <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
