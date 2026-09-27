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

## Order notifications

Users can opt in to browser push notifications from the authenticated panel. The client registers a Firebase Messaging service worker and stores only the user's own registration tokens. The `notifyOrderStatus` Firestore trigger sends privacy-safe notifications when an order is created or changes to `Pendiente`, `Completado` or `Cancelada`; transfer amounts are never included in the notification text.

The public VAPID key is configured in `public/index.html`. Browser notification permission is always user-controlled and must be granted before a device can receive messages.

## App icon and installability

`public/icons/icon-source.svg` is the master for the app icon: a dollar sign inside two counter-rotating arcs, with a single amber drop shadow over a solid ink background. The shadow deliberately shares the mark's colour and never sits on a gradient, which is what keeps the icon legible below 96px.

The shipped PNGs are rasterised from that SVG at 192, 512, maskable 192/512 and apple-touch 180. The maskable variants scale the mark to 70% so it survives an aggressive launcher mask. Rasterising requires the `Outfit` 800 face, which is the one the app already loads; the committed PNGs have no runtime font dependency.

`public/site.webmanifest` is what makes the app installable. Chrome requires at least a 192 and a 512 icon before it offers "Add to Home screen", and iOS uses `apple-touch-icon` plus `apple-mobile-web-app-title`.

If you change the markup in `public/index.html` or `public/main.js`, run `npm run build` and commit the result: Vercel serves the committed Tailwind output and never rebuilds it.

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
