# My Remesas

My Remesas is a Firebase-backed web app for calculating CLP, VES, USDT and WLD exchanges, creating remittance orders and tracking payment receipts.

## Production

- Canonical app: https://myremesas-prod-deploy.vercel.app
- Vercel project: `ejpinardev-gifs-projects/myremesas-prod-deploy`
- Firebase project: `studio-7601782447-44d81`

`myremesas.vercel.app` is a different application and is not the My Remesas production endpoint.

## Runtime

- Node.js 24.x
- Static frontend in `public/`
- Vercel functions in `api/rates.js` and `api/binance-balance.js`
- Trusted order creation in `functions/index.js` using Firebase Admin
- Firebase Authentication, Firestore and Cloud Storage
- Firestore rules: `firestore.rules`
- Storage rules: `storage.rules`

The Binance balance endpoint requires a Firebase ID token from an administrator. Proxy credentials are server-side environment variables and must never be committed.

## Local verification

```bash
npm test
```

The security-rules suite requires the Firebase CLI and JDK 21 or newer:

```bash
npm run test:rules
```

The trusted order function has a local smoke test:

```bash
firebase emulators:exec --project demo-myremesas-rules --only auth,firestore,storage,functions "node functions/create-order-smoke.mjs"
```

The rule suite starts local Firestore and Storage emulators and tests owner/admin boundaries, receipt validation, public pricing reads and order status transitions.

## Required server environment

- `BINANCE_PROXY_URL` and `VPS_AUTH_TOKEN` for the protected proxy, or
- `BINANCE_API_KEY` and `BINANCE_API_SECRET` for direct Binance balance access
- `FIREBASE_PROJECT_ID` when the server runs against a different Firebase project

The client Firebase configuration is public by design; access is enforced by Firebase Authentication and the deployed rules.
