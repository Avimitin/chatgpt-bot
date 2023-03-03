//@deno-types="npm:@types/node-telegram-bot-api@0.61.0"
import TelegramBot from "npm:node-telegram-bot-api@0.61.0";

import * as Logging from "./logging.ts";
import { AppState } from "./app.ts";

// TODO: KKV storage for chat
//
// K1: Chat ID
// K2: User ID
// V: messages

async function openai_handler(
  { bot, state, chat, payload }: {
    bot: TelegramBot;
    state: AppState;
    chat: number;
    payload: string;
  },
) {
  // TODO: if inputs are the same, try increase the temperature (Make new cache for this)
  //
  // TODO: Store the user input into the KKV cache
  try {
    const resp = await state.openai.createChatCompletion({
      model: state.model,
      messages: [
        { role: "system", content: "You are a helpful assitant." },
        { role: "user", content: payload },
      ],
    });

    const reply = resp.data.choices?.reduce((accum, elem) => {
      return `${accum}\n${elem.message?.content}`;
    }, "");

    await bot.sendMessage(chat, reply);
  } catch (error) {
    if (error.response) {
      Logging.error(
        `[${error.response.status}] ${JSON.stringify(error.response.data)}`,
      );
    } else {
      Logging.error(`[Unexpected Error] ${error.message}`);
    }
  }
}

export function dispatch(bot_token: string, state: AppState) {
  const bot = new TelegramBot(bot_token, { polling: true });

  // Dispatcher
  bot.on("message", async (msg) => {
    const chat_id = msg.chat.id;
    if (!state.whitelist.includes(chat_id)) {
      Logging.warning(
        `${
          msg.chat.first_name || msg.chat.last_name || msg.chat.username
        }(${chat_id}) attempt to use this bot`,
      );
      return;
    }

    if (!msg.text) {
      return;
    }

    const command_payload = msg.text.match(/^\/openai (.+)/ms);
    if (command_payload !== null && command_payload.length > 1) {
      Logging.info(`${msg.from?.first_name} in chat ${msg.chat.first_name} starting new chat`);
      await openai_handler({
        bot: bot,
        state: state,
        chat: chat_id,
        payload: command_payload[1],
      });
      return;
    }

    if (msg.reply_to_message !== undefined) {
      // TODO: handle(msg.reply_to_message)
    }
  });
}
