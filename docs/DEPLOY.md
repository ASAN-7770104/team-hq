# Publishing on a server (Cloudflare, free plan)

**English** · [Русский](DEPLOY.ru.md)

After this the workspace opens from any phone and each member's Claude connects through a personal link. Check the
free plan limits on the Cloudflare site.

Run the commands in the project folder.

1. Sign in to Cloudflare (downloads the `wrangler` tool):

   ```
   npx wrangler login
   ```

2. Create the database and copy `database_id` from the answer:

   ```
   npx wrangler d1 create team-hq
   ```

3. Copy `wrangler.toml.example` to `wrangler.toml` and paste `database_id`.

4. Move the data and keys from the local database. If it is not in `data/hq.db`, set the `HQ_DB` variable first.

   ```
   npm run export -- data/export.sql
   npx wrangler d1 execute team-hq --remote --file data/export.sql
   ```

   For an empty workspace run instead: `npx wrangler d1 migrations apply team-hq --remote`.

5. Publish:

   ```
   npx wrangler deploy
   ```

   The answer contains an address like `https://team-hq.your-name.workers.dev`.

6. Each member opens `address/#key=their_key`, then "Add to home screen" in the browser menu.

7. Claude: in the workspace open Settings, copy the connector address, and add it in Claude as a custom connector.

For English Telegram messages and MCP texts add `HQ_LANG = "en"` under `[vars]` in `wrangler.toml`.

## Telegram notifications

1. Create a bot with `@BotFather` and get the token.
2. Run `npx wrangler secret put TELEGRAM_BOT_TOKEN` and paste the token when asked. Do not write it into files.
3. Each member writes any message to the bot.
4. Open `https://api.telegram.org/bot<token>/getUpdates` and find each member's `chat.id`.
5. Each member enters their `chat.id` in Settings.

Notifications: a task was assigned, a blocker appeared, a 09:00 summary, a 21:00 report reminder.

## Important

- After publishing work only on the server: the local database does not sync with it.
- A key link and a connector address give full access. If one leaks, issue a new key with
  `npm run user -- --login ... --name ...`, then move the `users` table to D1.
- `data/export.sql` holds working data. Delete it after the transfer.
