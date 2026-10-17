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

Think uses [`@cf/qwen/qwen3-30b-a3b-fp8`](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/),
listed at $0.0509/M input and $0.335/M output tokens, versus
[QwQ](https://developers.cloudflare.com/workers-ai/models/qwq-32b/) at $0.66/M and $1.00/M.
Qwen's [official model card](https://huggingface.co/Qwen/Qwen3-30B-A3B-FP8)
documents `/think` and `/no_think` prompt controls. We retain default thinking;
Workers AI does not document a separate thinking-budget parameter for this model.
