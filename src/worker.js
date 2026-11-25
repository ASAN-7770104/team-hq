// Cloudflare Workers entry point. Static files from /public are served by the platform.
import { setLanguage } from '../public/i18n.js';
import { handle } from './app.js';
import { dashboard } from './core.js';
import { digest } from './notify.js';

export default {
  async fetch(request, env, execution) {
    setLanguage(env.HQ_LANG);
    const response = await handle(request, env, (job) => execution.waitUntil(job));
    return response ?? env.ASSETS.fetch(request);
  },

  // Cron times are set in wrangler.toml: the early one is the morning digest.
  async scheduled(event, env, execution) {
    setLanguage(env.HQ_LANG);
    const kind = new Date(event.scheduledTime).getUTCHours() < 12 ? 'morning' : 'evening';
    execution.waitUntil(digest({ db: env.DB, env }, kind, dashboard));
  },
};
