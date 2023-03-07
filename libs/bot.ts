import { ChatCompletionRequestMessage, Message, TelegramBot } from "../deps.ts";
import * as Logging from "./logging.ts";
import { AppState } from "./app.ts";

function getCacheIdentifier(msg: Message): string {
  const suffix = msg.chat.type === "private"
    ? msg.chat.id.toString()
    : `${msg.chat.id}-${msg.from?.id}`;
  return `OPENAI_MESSAGE:${suffix}`;
}

function getThreadCacheIdentifer(msg: Message): string | null {
  const is_private_chat = msg.chat.type === "private";
  if (is_private_chat) {
    return null;
  }

  return `OPENAI:${msg.chat.id}:THREAD_IDS:${msg.from?.id}`;
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

async function addIDToThreadCache(
  msg: Message,
  state: AppState,
  response_msg_id: number,
) {
  const identifier = getThreadCacheIdentifer(msg);
  if (!identifier) {
    return;
  }
  await state.redis.sadd(identifier, response_msg_id);
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
      parse_mode: "MarkdownV2",
    });

    await addIDToThreadCache(msg, state, response_message.message_id);
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

async function isUserInThread(msg: Message, state: AppState): Promise<boolean> {
  const key = getThreadCacheIdentifer(msg);
  if (!key) {
    // if key not exist, it means user are chating in private chat
    return true;
  }

  const bot_msg_id = msg.reply_to_message?.message_id;
  const ret_id = await state.redis.sismember(key, bot_msg_id);

  return ret_id === 1;
}

async function reply_handler(bot: TelegramBot, msg: Message, state: AppState) {
  const user_in_thread = await isUserInThread(msg, state);
  if (!user_in_thread) {
    await bot.sendMessage(
      msg.chat.id,
      "Do not disturb other user's chat completion",
    );
    return;
  }

  const identifier = getCacheIdentifier(msg);
  const result = await state.redis.get(identifier);

  let cache: ChatCompletionRequestMessage[];

  if (result) {
    cache = JSON.parse(result);
  } else {
    await bot.sendMessage(
      msg.chat.id,
      "Do not disturb other user's chat completion",
    );
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
      parse_mode: "MarkdownV2",
    });

    await addIDToThreadCache(msg, state, resp_msg.message_id);
  } catch (error) {
    if (error.response) {
      const response = error.response;
      Logging.error(`[${response.status}] ${JSON.stringify(response.data)}`);
    } else {
      Logging.error(`[Unexpected Error] ${error.message}`);
    }
  }
}

export async function dispatch(bot_token: string, state: AppState) {
  const bot = new TelegramBot(bot_token, { polling: true });
  const botID = await bot.getMe().then((info) => info.id);

  bot.onText(/^\/start (.+)/, async (msg) => {
    await bot.sendMessage(msg.chat.id, "Usage: /openai <Text>");
  });

  // Dispatcher
  bot.on("message", async (msg) => {
    const chatID = msg.chat.id;
    const chatName = msg.chat.first_name || msg.chat.last_name ||
      msg.chat.username;
    const username = msg.from?.first_name || msg.from?.last_name ||
      msg.from?.username;

    if (!state.whitelist.includes(chatID)) {
      await bot.sendMessage(msg.chat.id, "Permission denied");
      Logging.warning(
        `${chatName}(${chatID}) attempt to use this bot, rejected`,
      );
      return;
    }

    if (!msg.text) {
      return;
    }

    const command_payload = msg.text.match(/^\/openai (.+)/ms);
    if (command_payload) {
      if (command_payload.length <= 1) {
        await bot.sendMessage(msg.chat.id, "Usage: /openai <Text>");
        return;
      }

      Logging.info(
        `${username} in chat ${chatName}(${chatID}) starting new chat`,
      );

      await openai_handler({
        bot: bot,
        state: state,
        msg: msg,
        payload: command_payload[1],
      });

      return;
    }

    const is_replying_to_bot = msg.reply_to_message &&
      msg.reply_to_message.from && msg.reply_to_message.from.id === botID;
    if (is_replying_to_bot) {
      Logging.info(
        `${username} in chat ${chatName}(${chatID}) is using this bot`,
      );
      await reply_handler(bot, msg, state);
    }
  });
}
