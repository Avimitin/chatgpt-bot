import "https://deno.land/std@0.178.0/dotenv/load.ts";

import * as App from "./libs/app.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || Deno.exit(1);
const WHITELIST = (Deno.env.get("WHITELIST_CHAT") || "").split(",").map(elem => parseInt(elem));
const OPENAI_TOKEN = Deno.env.get("OPENAI_TOKEN") || Deno.exit(1);
const MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-3.5-turbo";

if (!["gpt-3.5-turbo", "text-davinci-003"].includes(MODEL)) {
  Deno.exit(1);
}

App.run({
  bot_token: BOT_TOKEN,
  whitelist: WHITELIST,
  openai_token: OPENAI_TOKEN,
  model: MODEL,
});
