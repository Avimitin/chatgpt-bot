import { ChatCompletionRequestMessage, Message, TelegramBot } from "../deps.ts";
import * as Logging from "./logging.ts";
import { AppState } from "./app.ts";

function getCacheIdentifier(msg: Message): string {
  const suffix = msg.chat.type === "private"
    ? msg.chat.id.toString()
    : `${msg.chat.id}-${msg.from?.id}`;
  return `OPENAI_MESSAGE:${suffix}`;
}

async function getOpenAIReply(
  state: AppState,
  messages: ChatCompletionRequestMessage[],
) {
  const resp = await state.openai.createChatCompletion({
    model: state.model,
    messages: messages,
  });

  const reply = resp.data.choices?.reduce((accum, elem) => {
    return `${accum}\n${elem.message?.content}`;
  }, "");

  return reply;
}

async function openai_handler(
  { bot, state, msg, payload }: {
    bot: TelegramBot;
    state: AppState;
    msg: Message;
    payload: string;
  },
) {
  // TODO: if inputs are the same, try increase the temperature (Make new cache for this)
  const cache_identifier = getCacheIdentifier(msg);

  const messages: ChatCompletionRequestMessage[] = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: payload },
  ];

  try {
    const response_message = await bot.sendMessage(
      msg.chat.id,
      "Waiting OpenAI reply...",
    );
    const reply = await getOpenAIReply(state, messages);
    await state.redis.set(
      cache_identifier,
      JSON.stringify(messages),
    );
    await bot.editMessageText(reply, {
      chat_id: response_message.chat.id,
      message_id: response_message.message_id,
    });
  } catch (error) {
    if (error.response) {
      Logging.error(
        `[${error.response.status}] ${JSON.stringify(error.response.data)}`,
      );
    } else {
      Logging.error(`[Unexpected Error] ${error}`);
    }
  }
}

async function reply_handler(bot: TelegramBot, msg: Message, state: AppState) {
  const identifier = getCacheIdentifier(msg);
  const result = await state.redis.get(identifier);

  let cache: ChatCompletionRequestMessage[];

  if (result) {
    cache = JSON.parse(result);
  } else {
    // TODO: If we lost context, use the user reply message and user input as prompt
    return;
  }

  if (msg.text === undefined) {
    await bot.sendMessage(
      msg.chat.id,
      "Non-text message is currently unsupported",
    );
    return;
  }

  cache.push({
    role: "user",
    content: msg.text,
  });

  try {
    const resp_msg = await bot.sendMessage(
      msg.chat.id,
      "Waiting OpenAI reply...",
      {
        reply_to_message_id: msg.message_id,
      },
    );
    const reply = await getOpenAIReply(state, cache);
    await state.redis.set(identifier, JSON.stringify(cache));
    await bot.editMessageText(reply, {
      chat_id: resp_msg.chat.id,
      message_id: resp_msg.message_id,
    });
  } catch (error) {
    if (error.response) {
      const response = error.response;
      Logging.error(`[${response.status}] ${JSON.stringify(response.data)}`);
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
    const chat_name = msg.chat.first_name || msg.chat.last_name ||
      msg.chat.username;
    const user_name = msg.from?.first_name || msg.from?.last_name ||
      msg.from?.username;

    if (!state.whitelist.includes(chat_id)) {
      Logging.warning(
        `${chat_name}(${chat_id}) attempt to use this bot`,
      );
      return;
    }

    if (!msg.text) {
      return;
    }

    const command_payload = msg.text.match(/^\/openai (.+)/ms);
    if (command_payload !== null && command_payload.length > 1) {
      Logging.info(
        `${user_name} in chat ${chat_name} starting new chat`,
      );
      await openai_handler({
        bot: bot,
        state: state,
        msg: msg,
        payload: command_payload[1],
      });
      return;
    }

    if (
      msg.reply_to_message && msg.reply_to_message.from?.is_bot
    ) {
      Logging.info(
        `${user_name} in chat ${chat_name}(${chat_id}) is using this bot`,
      );
      await reply_handler(bot, msg, state);
    }
  });
}
