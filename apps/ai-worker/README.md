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
2048 output tokens; incomplete JSON fails safely into the app's fallback flow.
