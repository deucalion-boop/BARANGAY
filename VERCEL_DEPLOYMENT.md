# Deploying the Barangay portal on Vercel

This is an Express application with server-rendered EJS pages. Deploy the
repository directory containing `package.json`, `server.js`, and `vercel.json`.

## Project settings

- Framework: **Express**, selected explicitly by `vercel.json`.
- Root Directory: the repository root, or its containing app directory in a
  monorepo. Do not select `public` or `views`.
- Build Command and Output Directory: remove custom overrides and use the
  Express defaults. `npm start` starts the local server; it is not a build command.
- Install Command: the default npm installation, or `npm ci`.
- Node.js: 22 or newer, as specified in `package.json`. The installed Supabase
  SDK requires Node.js 22 or newer.

Vercel serves `public/` assets through its CDN. The `server.js` function includes
`views/**/*`, including the landing page's EJS partials. No catch-all rewrite or
generated static HTML output is needed.

## Environment variables

Add actual values under the project's **Settings → Environment Variables** for
each environment you deploy to. `.env.example` documents names and placeholders;
it does not configure your Vercel environment. Local `.env` files are ignored by
Git.

The portal uses `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`, `SESSION_SECRET`, `RECAPTCHA_SITE_KEY`,
`RECAPTCHA_SECRET_KEY`, and `RECAPTCHA_ENABLED`. The configured admin login also
uses `SUPABASE_ADMIN_EMAIL` and `SUPABASE_ADMIN_USERNAME`. Keep server secrets in
Vercel environment variables. The admin creation password is only needed when
running the admin setup script.

Add the deployed hostname to the allowed domains for the reCAPTCHA site key.
Redeploy after changing environment variables or project settings.

## Verify a deployment

1. Open `/api/health`. It should return `{"status":"ok"}` without accessing the
   database. This confirms that the Express function is reachable.
2. Open `/` and `/css/landing.css`. The page and its stylesheet should both load.
3. If any request fails, check the error code on the response and the deployment's
   Runtime Logs. A failing health endpoint suggests a routing, function startup,
   or platform problem; a working health endpoint with a failing homepage narrows
   the investigation to settings, data access, or rendering.

The application exports Express directly on Vercel. `npm start` still starts a
standalone listener and the existing recurring jobs. Recurring maintenance on
Vercel needs an external scheduler or Vercel Cron; local intervals are not started
there. The current session, password-reset OTP, and realtime stores are process
memory, so cross-instance authentication, password resets, and broadcasts need
shared storage for reliable production behavior.

## References

- [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
- [Including runtime files](https://github.com/vercel/vercel/blob/main/skills/vercel-cli/references/node-backends.md#configuration)
- [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
