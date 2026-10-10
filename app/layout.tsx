import './globals.css';
import type { Metadata, Viewport } from 'next';
import RegisterSW from '@/components/register-sw';

export const metadata: Metadata = {
  title: 'Infinity Planet',
  description: 'Infinity Planet — private AI business operating system',
  applicationName: 'Infinity Planet',
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/favicon.ico' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Infinity Planet', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { themeColor: '#0d1b2e', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

const UI_SCALE = "(function(){function a(){var p='auto',t='1';try{p=localStorage.getItem('ip-ui-scale')||'auto';t=localStorage.getItem('ip-text-size')||'1'}catch(e){}var w=window.innerWidth,z;if(w<760)z=1;else if(p==='auto')z=Math.max(0.9,Math.min(1,w/1480));else z=Math.max(0.6,Math.min(1.3,parseFloat(p)||1));var d=document.documentElement;d.style.zoom=String(z);d.style.setProperty('--z',String(z));d.style.setProperty('--fs',String(Math.max(0.8,Math.min(1.5,parseFloat(t)||1))));d.setAttribute('data-ui-scale',p)}window.__applyUiScale=a;a();try{var tv=JSON.parse(localStorage.getItem('ip-theme-vars')||'{}');for(var k in tv)document.documentElement.style.setProperty(k,tv[k]);}catch(e){}try{var m=localStorage.getItem('ip-theme-mode')||'light';document.documentElement.setAttribute('data-theme',m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light');}catch(e){}window.addEventListener('resize',a)})();";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en-AU" suppressHydrationWarning><head>
    {/* Fit the app to the window: scales the whole UI (Settings → My profile → Display size). Runs before paint to avoid a flash. */}
    <script dangerouslySetInnerHTML={{ __html: UI_SCALE }} />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Gabarito:wght@500;700;800&family=DM+Sans:wght@300;400;500;700&family=Figtree:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&family=Vazirmatn:wght@400;500;700&family=Dancing+Script:wght@600&family=Great+Vibes&family=Caveat:wght@600&display=swap" rel="stylesheet" />
  </head><body>{children}<RegisterSW /></body></html>;
}
