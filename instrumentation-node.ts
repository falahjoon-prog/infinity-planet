// Background jobs while the server runs:
//  - Google Drive: re-sync linked folders every 30 minutes (DRIVE_AUTO_SYNC=off to disable)
//  - Email: send scheduled emails when they are due (checked every minute)
import { autoSyncDrive } from './lib/drive-live';
import { sendDueScheduled } from './lib/email-send';
import { ensureAiKeys } from './lib/ai-keys';
// AI keys saved in Settings → AI
ensureAiKeys().catch(() => {});
if (process.env.DRIVE_AUTO_SYNC !== 'off') {
  const run = () => { autoSyncDrive().catch(() => {}); };
  setTimeout(run, 60_000);
  setInterval(run, 30 * 60_000);
}
setInterval(() => { sendDueScheduled().catch(() => {}); }, 60_000);
