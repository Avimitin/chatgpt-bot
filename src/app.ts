import * as Logger from "./logging.ts";
import * as Bot from "./bot.ts";
import { Redis } from "ioredis";
import { OpenAIApi, Configuration } from "openai";

export interface AppState {
  whitelist: number[];
  model: string;
  openai: OpenAIApi;
  redis: Redis;
}

function envGetOrAbort(key: string): string {
  const val = process.env[key];

  if (!val) {
    console.error(`ENV: ${key} is not found`);
    process.exit(1)
  }

  return val;
}

function envGetOpenAIModel(): string {
  const model = process.env["OPENAI_MODEL"] || "gpt-3.5-turbo";
  if (!["gpt-3.5-turbo", "text-davinci-003"].includes(model)) {
    console.error(`Invalid model selection "${model}"`);
    process.exit(1);
  }

  return model;
}

export async function run() {
  const config = new Configuration({
    apiKey: envGetOrAbort("OPENAI_API_TOKEN"),
  });

  const whitelist = envGetOrAbort("WHITELIST_CHAT_IDS").split(",").map((elem) =>
    parseInt(elem)
  );

  const redis_url = process.env["REDIS_ADDR"] || "redis://localhost:6379";
  const redisClient = new Redis(redis_url);
  Logger.info(`Connected to ${redis_url}`);

  const state: AppState = {
    openai: new OpenAIApi(config),
    whitelist: whitelist,
    model: envGetOpenAIModel(),
    redis: redisClient,
  };

  await Bot.dispatch(envGetOrAbort("TGBOT_API_TOKEN"), state);
}
