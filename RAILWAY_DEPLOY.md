# X NOBITA XD — Website Pairing Deployment

## Start
Railway runs `npm start`. The app listens on Railway's `PORT` and serves the no-login pairing website at `/`.

## Website
- Home page: `/`
- Live status API: `/api/status`
- Pairing API: `/api/pair` (POST JSON: `{ "phone": "919876543210" }`)

## Persistence
Attach a Railway Volume and mount it at the project working directory so `sessions/` and `data/` survive restarts/deploys. Without persistent storage, linked WhatsApp sessions can be lost.

## Domain
Set your custom domain in Railway's service Networking settings. `www.xnobitaxdofficial.pair` is the requested display name; a live address requires a domain suffix that your domain registrar and hosting support.

## Security
The pairing endpoint has basic rate limiting and a per-number cooldown. Keep the website URL private if you do not want others to request pairing codes. Never share a pairing code.
