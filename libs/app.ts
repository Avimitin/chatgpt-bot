import { OpenAIApi, Configuration } from "npm:openai@3.2.1";
import { dispatch } from "./bot.ts";

export interface AppConfig {
  bot_token: string,
  openai_token: string,
  whitelist: number[],
  model: string,
}

export interface AppState {
  whitelist: number[],
  model: string,
  openai: OpenAIApi,
}

export function run(cfg: AppConfig) {
  const config = new Configuration({
    apiKey: cfg.openai_token,
  });

  const state: AppState = {
    openai: new OpenAIApi(config),
    ...cfg
  };

  dispatch(cfg.bot_token, state);
}
