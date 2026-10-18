# Sổ Ví AI Worker

From this directory, provision manually (never commit the access token):

```sh
npx wrangler login
npx wrangler secret put APP_TOKEN
npx wrangler deploy
```

Use a long random APP_TOKEN, then enter the deployed HTTPS Worker URL and the same
token in Roadmap settings. The app stores both in SecureStore/Keychain.
Only preference text, period, planned budget and menu are sent; no ledger,
transactions or balances. Prompts are never logged by this handler.

With WORKER_URL and APP_TOKEN supplied privately in your shell:

```sh
curl "$WORKER_URL/v1/complete" -H "Authorization: Bearer $APP_TOKEN" -H 'Content-Type: application/json' --data '{"mode":"fast","messages":[{"role":"user","content":"Return {} as JSON"}]}'
node --test test/*.test.ts
```

Model IDs and official catalog links are in `src/index.ts`. Think is capped at
4096 output tokens; the client waits up to 150 seconds. Incomplete thinking
returns 502 `AI_TRUNCATED`; incomplete JSON fails safely into the app's fallback flow.

Think uses [`@cf/openai/gpt-oss-120b`](https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/)
with default `medium` reasoning. Its input schema documents no reasoning-level field,
so the Worker sends `messages` and `max_tokens: 4096` without an extra reasoning option.
Fast remains `@cf/meta/llama-3.1-8b-instruct-fp8`.

The [official pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
is 31,818 Neurons/M input tokens and 68,182 Neurons/M output tokens. A request with
2k input and 3k output tokens costs about 268 Neurons (roughly 270), or about
35 requests/day within the shared free allocation of 10,000 Neurons/day; actual
usage depends on token counts and other requests. This model needs no paid plan.
Run `npx wrangler deploy` again to apply the model change to an existing Worker.
