import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Infinity Planet — Business OS', short_name: 'Infinity Planet', description: 'Infinity Planet private AI business operating system',
    start_url: '/', scope: '/', display: 'standalone', orientation: 'any', background_color: '#0d1b2e', theme_color: '#0d1b2e',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'AI Assistant', url: '/assistant' }, { name: 'Tasks', url: '/tasks' }, { name: 'Approvals', url: '/approvals' }, { name: 'Team Chat', url: '/team' },
    ],
  };
}
