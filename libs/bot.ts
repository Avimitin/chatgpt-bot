import { ChatCompletionRequestMessage, Message, TelegramBot } from "../deps.ts";
import * as Logging from "./logging.ts";
import { AppState } from "./app.ts";

async function openai_handler(
  { bot, state, msg, payload }: {
    bot: TelegramBot;
    state: AppState;
    msg: Message;
    payload: string;
  },
) {
  // TODO: if inputs are the same, try increase the temperature (Make new cache for this)

  const cache_identifier = msg.chat.type === "private"
    ? msg.chat.id.toString()
    : `${msg.chat.id}-${msg.from?.id}`;

  const messages: ChatCompletionRequestMessage[] = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: payload },
  ];

  try {
    const resp = await state.openai.createChatCompletion({
      model: state.model,
      messages: messages,
    });

    await state.redis.set(`OPENAI_MESSAGE:${cache_identifier}`, messages);

    const reply = resp.data.choices?.reduce((accum, elem) => {
      return `${accum}\n${elem.message?.content}`;
    }, "");

    await bot.sendMessage(msg.chat.id, reply);
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
      Logging.info(
        `${msg.from?.first_name} in chat ${msg.chat.first_name} starting new chat`,
      );
      await openai_handler({
        bot: bot,
        state: state,
        msg: msg,
        payload: command_payload[1],
      });
      return;
    }

    if (msg.reply_to_message !== undefined) {
      // TODO: handle(msg.reply_to_message)
    }
  });
}
