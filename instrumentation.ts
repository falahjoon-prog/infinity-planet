/** Server start-up hook (Node.js only): background Google Drive sync — see instrumentation-node.ts. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./instrumentation-node');
}
