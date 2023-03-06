FROM denoland/deno:1.31.1
WORKDIR /app
USER deno

COPY deps.ts .
RUN deno cache deps.ts

ADD . .
RUN deno cache main.ts

CMD [ "run", "--allow-net", "--allow-env", "--allow-read", "main.ts" ]
