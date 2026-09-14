export function isFrxeWebLocation(hostname = '', pathname = '') {
  const host = String(hostname).trim().toLowerCase();
  const path = String(pathname).trim().toLowerCase();
  return host === 'music.nont.me'
    || host === 'frxe.nont.me'
    || path === '/music'
    || path.startsWith('/music/');
}
