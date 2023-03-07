## Usage

* bare mental

```bash
export OPENAI_API_TOKEN="sk-..."
export WHITELIST_CHAT_IDS="123456,-100123456"
export TGBOT_API_TOKEN="12345:ABCDEFG"
export REDIS_ADDR=redis://localhost:6379

deno run \
      --allow-env \
      --allow-read \
      --allow-net \
      main.ts
```

* Docker

```bash
docker run -e "OPENAI_API_TOKEN=..." ghcr.io/avimitin/chatgpt-bot
```
