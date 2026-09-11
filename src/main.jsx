import React from 'react';
import { createRoot } from 'react-dom/client';

async function boot() {
  const hostname = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();
  const musicMode = hostname === 'music.nont.me' || pathname === '/music' || pathname.startsWith('/music/');

  const favicon = document.querySelector('link[rel="icon"]') || document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' }));

  if (musicMode) {
    document.title = 'NontMusic';
    favicon.href = 'https://raw.githubusercontent.com/voidnont/NontMusic/main/public/nontmusic.png';
    document.documentElement.removeAttribute('data-theme');
    const [{ default: MusicApp }] = await Promise.all([
      import('./music/MusicApp.tsx'),
      import('./music/music.css'),
    ]);
    createRoot(document.getElementById('root')).render(
      <React.StrictMode><MusicApp /></React.StrictMode>
    );
    return;
  }

  document.title = 'NontHub';
  favicon.href = 'https://raw.githubusercontent.com/voidnont/NontHub/main/public/nonthub-logo.png';
  const [{ default: App }] = await Promise.all([
    import('./App.jsx'),
    import('./styles.css'),
  ]);
  createRoot(document.getElementById('root')).render(
    <React.StrictMode><App /></React.StrictMode>
  );
}

void boot();
