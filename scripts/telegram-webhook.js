#!/usr/bin/env node
'use strict';
/* YASNAFIT — Telegram webhook operator tool (@yasnafitbot).
   The server registers its webhook by itself on every start (webhook mode). This tool is
   for checking and fixing that registration from a shell without pasting the token anywhere:

     TELEGRAM_BOT_TOKEN=… node scripts/telegram-webhook.js info
     TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_URL=https://yasnafit.ir node scripts/telegram-webhook.js set
     TELEGRAM_BOT_TOKEN=… node scripts/telegram-webhook.js delete
     TELEGRAM_BOT_TOKEN=… node scripts/telegram-webhook.js me
     TELEGRAM_BOT_TOKEN=… node scripts/telegram-webhook.js commands

   Reads the same variables as the server (src/telegram-bot-service.js). The token and the
   webhook secret are never printed. Exit code 1 on any API error.
*/
const bot = require('../src/telegram-bot-service');

const action = String(process.argv[2] || 'info').trim().toLowerCase();
const config = bot.getConfig(process.env);

function out(label, value) {
  console.log(label + ':', typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

(async () => {
  if (!config.token) {
    console.error('TELEGRAM_BOT_TOKEN is not set in this shell (export it for this command only; never commit it).');
    process.exit(1);
  }
  const api = bot.createApi({ token: config.token, apiBase: config.apiBase });
  try {
    if (action === 'info') {
      const info = await api.call('getWebhookInfo');
      out('webhook', {
        url: info.url || '(none — long polling or nothing registered)',
        pending_update_count: info.pending_update_count,
        last_error_date: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
        last_error_message: info.last_error_message || null,
        max_connections: info.max_connections || null,
        allowed_updates: info.allowed_updates || null
      });
      out('expected_url_from_env', config.webhookUrl || '(TELEGRAM_WEBHOOK_URL not set)');
      out('secret_source', config.secretIsDerived ? 'derived from the token (default)' : 'TELEGRAM_WEBHOOK_SECRET');
    } else if (action === 'set') {
      if (!config.webhookUrl) {
        console.error('TELEGRAM_WEBHOOK_URL is required (public https origin, e.g. https://yasnafit.ir).');
        process.exit(1);
      }
      await api.call('setWebhook', { url: config.webhookUrl, secret_token: config.secret, allowed_updates: ['message'], drop_pending_updates: false });
      out('webhook_set', config.webhookUrl);
      out('note', 'The running server must use the same TELEGRAM_BOT_TOKEN (and TELEGRAM_WEBHOOK_SECRET if you set one), otherwise it answers 403.');
    } else if (action === 'delete') {
      await api.call('deleteWebhook', { drop_pending_updates: false });
      out('webhook_deleted', true);
    } else if (action === 'me') {
      const me = await api.call('getMe');
      out('bot', { id: me.id, username: me.username, first_name: me.first_name, can_join_groups: me.can_join_groups });
    } else if (action === 'commands') {
      await api.call('setMyCommands', { commands: bot.BOT_COMMANDS });
      out('commands_set', bot.BOT_COMMANDS.map(c => `/${c.command} — ${c.description}`));
    } else {
      console.error(`unknown action "${action}" (use: info | set | delete | me | commands)`);
      process.exit(1);
    }
  } catch (error) {
    console.error('✗', bot.redact(error, config.token));
    process.exit(1);
  }
})();
