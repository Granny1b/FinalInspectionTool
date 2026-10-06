# Modig Final Inspection

A small web app for Modig Machine Tool's Quality department that replaces the Excel workbook used
for the final inspection of CNC machines before delivery. Admins maintain one checklist template
per machine model; inspectors create an inspection from a template, print a blank checklist for the
walk-round, transcribe the results, and finalise a printable report. Every deviation goes into a
central table for KPIs. It runs on Azure Static Web Apps (Free) with managed Functions, Blob
Storage and Table Storage: no database, about 1 SEK a month.

## Status: phase 1 of 6 (foundation)

Working now:

- **Sign-in and access control.** Microsoft Entra ID sign-in through Static Web Apps. Only invited
  users with the role `inspector` or `admin` get past `/login.html`; signed-in users without a
  role see a "You don't have access yet" page. Pages and `/api/*` are locked alike.
- **App shell.** Sidebar with Inspections and Templates, plus Insights and Settings for admins; a
  drawer on tablets. The pages are placeholders whose actions say which phase delivers them.
  Settings explains how to invite users.
- **API.** `GET /api/me` (name, email, roles), plus the building blocks later endpoints use: role
  checks, JSON errors, zod-validated JSON blobs with ETag concurrency.
- **Seed.** The RigiMill MG checklist (6 sections, 90 checkpoints) and the six machine models are
  imported from `seed/Final_Inspection_rev_2.xlsm` into storage. The template is not visible in the
  UI until phase 2.
- **Local dev, infrastructure and CI/CD.** One `npm run dev`, a Bicep file, and a GitHub Actions
  workflow that checks every pull request and deploys `main`.

Next phases: 2 template editor · 3 inspections · 4 print · 5 guides and annotations · 6 insights.

## Prerequisites

- **Node 22** (see `.nvmrc`; `nvm use` picks it up).
- The first `npm install` downloads the Azure Functions Core Tools (about 1.3 GB unpacked), so it
  takes a while.
- For the end-to-end tests on a new machine, run `npx playwright install chromium` once.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:4280> and choose **Sign in with Microsoft**. Locally, the Static Web Apps
CLI shows its own mock sign-in form instead of Microsoft's:

- **Username**: any email address, e.g. `anna.andersson@modig.se`. The app derives the display
  name from it.
- **User's roles**: add `admin` or `inspector` on a line of its own, below the existing roles.
- Leave the other fields as they are and choose **Login**.

Sign in without either role to see the no-access page. Stop everything with Ctrl+C.

The mock form loads jQuery and Bootstrap from a CDN (`ajax.aspnetcdn.com`). If it does nothing
(offline, or the CDN is blocked), sign in from the browser console on <http://localhost:4280>
instead and reload. The cookie is all the form sets:

```js
document.cookie = `StaticWebAppsAuthCookie=${btoa(
  JSON.stringify({
    identityProvider: 'aad',
    userId: 'local-anna',
    userDetails: 'anna.andersson@modig.se',
    userRoles: ['anonymous', 'authenticated', 'admin'],
    claims: [],
  }),
)}; path=/`;
```

### What `npm run dev` starts

| Prefix          | What                                                                                  | Port         |
| --------------- | ------------------------------------------------------------------------------------- | ------------ |
| `blob`, `table` | Azurite storage emulator, data kept in `.azurite/`                                    | 10000, 10002 |
| `seed`          | The idempotent seed, once Azurite is up (then exits with code 0)                      |              |
| `api-build`     | esbuild in watch mode: `api/src` → `api/dist/index.cjs`                               |              |
| `api`           | Functions host, restarted by nodemon whenever the bundle changes                      | 7071         |
| `app`           | Vite dev server with hot reload                                                       | 5173         |
| `swa`           | Static Web Apps CLI: the URL you open. Auth, roles and routes, proxying 5173 and 7071 | **4280**     |

Before it starts, `predev` creates `api/local.settings.json` from
`api/local.settings.example.json` if it is missing. If any process fails (for example because a
port is already taken), everything stops, so you never work against half a stack. The exception
is port 4280: if only that one is taken, the `swa` line asks whether to use another port and waits.
Stop with Ctrl+C and free the port.

Always use port 4280. Only the SWA CLI applies the sign-in and role rules: the Functions host on
7071 trusts any `x-ms-client-principal` header. In dev mode the CLI does not apply the
Content-Security-Policy, the security headers or `navigationFallback` (Vite serves the pages).
To check those, run the built app:

```bash
npm run build
npm start -w @modig/api          # Functions host on 7071 (run Azurite too if a call needs storage)
npx swa start app/dist --swa-config-location app/dist --api-devserver-url http://127.0.0.1:7071
```

This `swa start` prints "Error reading workflow configuration": it expects a different layout in
the GitHub workflow file. The warning is harmless.

## Seed data

`npm run dev` runs the seed every time. To run it on its own:

```bash
npm run seed -- --dry-run   # parse and validate the workbook, print a summary, write nothing
npm run seed                # write into local Azurite (it must be running)
```

It is idempotent and never changes what already exists. Containers, the `deviations` table and
`config/settings.json` are created when missing; after that the settings belong to the admins and
the seed leaves them alone. The RigiMill MG template is imported only if none exists yet
(published revision 2, continuing the workbook's "Rev: 2", plus a draft at revision 3); an import
that was interrupted between those two writes is completed on the next run. To start over
locally, stop `npm run dev`, delete `.azurite/` and start it again.

`STORAGE_CONNECTION_STRING` points the seed at another storage account (see
[Deploy to Azure](#deploy-to-azure)). Set it only for that one command, and never `export` it in
the shell you run `npm run dev` from. Unset means local Azurite; set but empty stops the seed,
because it usually means the command that produced it failed.

## Scripts

| Command             | What it does                                                                |
| ------------------- | --------------------------------------------------------------------------- |
| `npm run dev`       | The whole local stack (see above)                                           |
| `npm run build`     | `app/dist` (static site) and `api/deploy` (bundled API), as CI deploys them |
| `npm run typecheck` | `tsc` for the root configs and e2e tests, then every workspace              |
| `npm run lint`      | ESLint                                                                      |
| `npm run format`    | Prettier, writing changes (`format:check` only checks)                      |
| `npm test`          | Vitest unit tests of all workspaces                                         |
| `npm run test:e2e`  | Playwright end-to-end tests                                                 |
| `npm run seed`      | Import the workbook (see above)                                             |
| `npm run check`     | typecheck + lint + format:check + test: run it before pushing               |

## Tests

- **Unit tests** (`npm test`): Vitest across `shared`, `api`, `seed` and `app`. The storage tests
  start their own in-memory Azurite on free ports, so nothing else needs to be running.
- **End-to-end tests** (`npm run test:e2e`): Playwright with Chromium, against
  <http://localhost:4280>. If nothing is running there, Playwright starts `npm run dev` itself and
  stops it afterwards; locally it reuses a stack you already started. The tests cover the sign-in
  redirect for pages and the API, the anonymous pre-login files (and that an encoded `../` cannot
  reach the app through them), the sign-in link, the inspector and admin navigation, the no-access
  page, a deep link, signing out, and that the seed imported the RigiMill MG template. They sign
  in by setting the SWA CLI's `StaticWebAppsAuthCookie` directly.

CI (`.github/workflows/azure-static-web-apps.yml`) runs `typecheck`, `lint`, `format:check`, a
Bicep lint, `test` and `build` on every pull request and push to `main`. The end-to-end tests run
in a separate job that does not block deployment yet.

## Project structure

```text
app/      Frontend: Vite, React, TypeScript, Tailwind CSS, React Router, TanStack Query
  public/   staticwebapp.config.json (routes, roles, headers), login.html, forbidden.html, logo
  src/      app shell, pages, apiFetch (lib/api.ts); theme tokens in src/index.css
api/      Azure Functions (Node v4 model), bundled by esbuild into api/deploy
shared/   zod schemas and types, numbering (3.c, D-01), roles, storage names: used by all others
seed/     Excel import of the RigiMill MG checklist and machine models
infra/    main.bicep: Static Web App and storage account
e2e/      Playwright tests
```

Branding lives in the colour, spacing, font and radius tokens in `app/src/index.css`. The
pre-login pages (`app/public/login-assets/auth.css`) mirror a few of them by hand, so change both.
`app/public/modig-logo.png` is the official Modig logo and `app/public/favicon.png` is the blue
swoosh cut from it. To change the logo, replace the PNG and keep the file name.

## Storage layout

One storage account. Each document is a JSON blob, saved with ETag concurrency (`If-Match`): a
save based on an outdated copy gets HTTP 412 and "Someone else changed this – reload to see the
latest version."

```text
templates/{templateId}/draft.json        draft being edited
templates/{templateId}/rev-{n}.json      published revisions, never changed
inspections/{inspectionId}.json
images/{imageId}.jpg                     photos (originals)
images/{imageId}.annotated.png           annotations flattened for print
config/settings.json                     machine models, default location, company name
config/inspection-counter.json           counter for FI-YYYY-NNNN numbers
table deviations                         one row per deviation, the source for KPIs
```

IDs are 16-character alphanumeric nanoids. Names are defined in `shared/src/storage.ts`.

## Auth model and roles

- Static Web Apps built-in authentication with Microsoft Entra ID (`/.auth/login/aad`). There is
  no user table and there are no passwords. Other providers (GitHub, X) are switched off.
- Two roles, assigned with Static Web Apps invitations and always written in lowercase:
  **`inspector`** creates and fills in inspections; **`admin`** can also edit templates, see
  insights and change settings. On the Free plan any Microsoft account can sign in, so access
  depends only on these roles, never on "authenticated". At most 25 invited users.
- `app/public/staticwebapp.config.json` locks everything, including `/api/*`, to the two roles.
  The only anonymous paths are `/login.html`, `/forbidden.html`, `/login-assets/auth.js`,
  `/login-assets/auth.css`, the logo and the favicon, each with its own exact route: an anonymous
  wildcard such as `/login-assets/*` can be escaped with an encoded `../`. Without a session you
  are redirected to `/login.html`; with a session but no role you get the no-access page.
- Every function checks the role again (`endpoint({ role })` in `api/src/lib/http.ts`). Users are
  identified by their lowercased email, and the display name is derived from it, because Static
  Web Apps passes no name claim to managed functions.
- After an invitation or a role change, the person must sign out and in again.

## Deploy to Azure

Everything Azure needs is in `infra/main.bicep`: a **Static Web App (Free)** that hosts the app and
its managed Functions API, and one **storage account** (Standard_LRS) with the private blob
containers `templates`, `inspections`, `images` and `config`, the table `deviations`, 7-day soft
delete and blob CORS for the browser's SAS uploads. The deployment also writes the
`STORAGE_CONNECTION_STRING` app setting, so there is nothing to set by hand. GitHub Actions
(`.github/workflows/azure-static-web-apps.yml`) builds and deploys every push to `main`.

Pull requests are checked but get **no preview environment**: previews would use the production
app settings, i.e. a public preview URL with read/write access to the real inspection data.

### Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) with Bicep
  (`az bicep upgrade`), signed in with Owner or Contributor rights on the subscription:
  `az login`, then `az account set --subscription "<subscription name or id>"`.
- [GitHub CLI](https://cli.github.com/), signed in (`gh auth login`), run from your clone of this
  repository.
- Node 22 and `npm ci --ignore-scripts` done in the clone, for the one-time seed
  (`--ignore-scripts` skips the 1.3 GB Functions Core Tools download, which the seed doesn't need).

The commands below are for bash (Linux, macOS, WSL or Azure Cloud Shell). Run them all in one
terminal: the later steps use the variables `RG`, `SWA`, `STORAGE` and `SWA_URL` from step 1, and
stop with a message if one is missing.

### 1. Create the resource group and deploy the infrastructure

The storage account takes the resource group's region, so the inspection data is stored in
Sweden (the API that reads and writes it runs with the Static Web App in West Europe). Static Web
Apps is offered only in a few regions (not Sweden); `westeurope` is the closest and the default.
To see where it is offered today:

```bash
az provider show --namespace Microsoft.Web \
  --query "resourceTypes[?resourceType=='staticSites'].locations | [0]" --output tsv
```

```bash
RG=rg-modig-final-inspection
az group create --name "$RG" --location swedencentral

az deployment group create --resource-group "$RG" --name modig-final-inspection \
  --template-file infra/main.bicep --parameters swaLocation=westeurope

# Outputs (names and URL only, no secrets)
az deployment group show --resource-group "$RG" --name modig-final-inspection \
  --query properties.outputs
SWA=$(az deployment group show --resource-group "$RG" --name modig-final-inspection \
  --query properties.outputs.swaName.value --output tsv)
STORAGE=$(az deployment group show --resource-group "$RG" --name modig-final-inspection \
  --query properties.outputs.storageAccountName.value --output tsv)
SWA_URL=$(az deployment group show --resource-group "$RG" --name modig-final-inspection \
  --query properties.outputs.swaUrl.value --output tsv)
echo "$SWA_URL"
```

Other parameters (all optional): `location`, `storageAccountName` (globally unique; defaults to
`stmodigfi` + a hash of the resource group), `swaName`, `devOrigins` (extra blob CORS origins
besides the deployed site; none by default), `appInsightsConnectionString` (see below) and `tags`.

Re-running the deployment is safe as long as you pass the same parameters each time, so keep your
overrides with the command. An omitted or changed `storageAccountName` or `swaName` creates a new,
empty resource and points the app at it; an omitted `devOrigins`, `tags` or
`appInsightsConnectionString` reverts to the default.

> **App settings are owned by the Bicep file.** Each deployment replaces _all_ app settings of the
> Static Web App, so a setting added in the portal disappears on the next run. Add new settings to
> `infra/main.bicep` instead.

**API logs (optional).** Managed Functions write their logs only to Application Insights, so
without it an API error is not recorded anywhere you can read. To turn logging on, create an
Application Insights resource (billed by data ingested, with a monthly free allowance) and pass
its connection string on every deployment:
`--parameters appInsightsConnectionString="<connection string>"`. Don't use the portal's _Enable
Application Insights_ switch: the setting it adds is removed by the next deployment.

### 2. Give GitHub the deployment token

The token goes straight from Azure into the repository secret, without being printed:

```bash
: "${RG:?run step 1 in this shell first}" "${SWA:?run step 1 in this shell first}" &&
  az staticwebapp secrets list --name "$SWA" --resource-group "$RG" \
    --query properties.apiKey --output tsv \
  | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN
```

Until this secret exists the workflow still runs all checks and skips the deploy job (with a
notice), so a fresh clone or fork stays green.

### 3. First deploy

Push to `main`, or start the workflow by hand and follow it:

```bash
gh workflow run azure-static-web-apps.yml --ref main
gh run watch
```

The workflow type-checks, lints, tests and builds, then uploads the prebuilt site (`app/dist`) and
API (`api/deploy`). The Azure build service is skipped on purpose: it cannot resolve the npm
workspace package `@modig/shared`.

### 4. Seed production storage (once)

Imports the RigiMill MG template and the machine models from `seed/Final_Inspection_rev_2.xlsm`.
It only creates what is missing and never changes existing data, so running it twice does no
harm. The connection string goes straight into the command's environment and is not printed. If
`az` fails, the seed stops instead of falling back to local storage:

```bash
: "${RG:?run step 1 in this shell first}" "${STORAGE:?run step 1 in this shell first}" &&
  STORAGE_CONNECTION_STRING="$(az storage account show-connection-string \
    --name "$STORAGE" --resource-group "$RG" --query connectionString --output tsv)" \
  npm run seed
```

Add `-- --dry-run` to parse and validate the workbook without writing anything.

### 5. Invite users

Anyone with a Microsoft account can _sign in_, but only users holding the role `inspector` or
`admin` get past the login page (`admin` includes everything an inspector can do). Roles are
assigned with Static Web Apps invitations:

- **Portal**: Static Web App → _Settings_ → _Role management_ → _Invite_. Provider _Microsoft
  Entra ID_, the person's email, domain = the site's hostname, role `inspector` or `admin`,
  expiry in hours. Write the role in lowercase. Send them the generated link; they open it and
  sign in with that account.
- **CLI**:

  ```bash
  : "${RG:?run step 1 first}" "${SWA:?run step 1 first}" "${SWA_URL:?run step 1 first}" &&
  SWA_HOST=${SWA_URL#https://} &&
  az staticwebapp users invite --name "$SWA" --resource-group "$RG" \
    --authentication-provider AAD --user-details anna.andersson@example.com \
    --roles inspector --domain "$SWA_HOST" --invitation-expiration-in-hours 168 \
    --query invitationUrl --output tsv

  # Change a role, list users
  az staticwebapp users update --name "$SWA" --resource-group "$RG" \
    --authentication-provider AAD --user-details anna.andersson@example.com --roles admin
  az staticwebapp users list --name "$SWA" --resource-group "$RG" --output table
  ```

Limits: at most **25 users** with a custom role (on every plan), and an invitation link expires
after at most **168 hours (7 days)**; send a new one if it lapses. Remove someone's access in the
portal under _Role management_. A user who gets a new role should sign out and in again.

### 6. Check the lock after each deploy

Anonymous requests must never reach the app or the API:

```bash
: "${SWA_URL:?run step 1 in this shell first}" &&
for path in / /templates /login.html /api/me /.auth/login/github /login-assets/..%2findex.html; do
  printf '%-30s ' "$path"
  curl --silent --path-as-is --output /dev/null \
    --write-out '%{http_code} %{redirect_url}\n' "$SWA_URL$path"
done
```

Expected:

```text
/                              302 https://<host>/login.html
/templates                     302 https://<host>/login.html
/login.html                    200
/api/me                        302 https://<host>/login.html
/.auth/login/github            404
/login-assets/..%2findex.html  302 https://<host>/login.html
```

Two lines allow some leeway. `/.auth/login/github` may also answer 200 without a redirect if
Azure serves its navigation fallback there; only a 302 to github.com means the provider block is
broken. `/login-assets/..%2findex.html` may also be refused with 400 or 404; only a 200 means the
app can be reached without signing in.

Then sign in through the site with an invited account and with a non-invited one (the latter must
land on the "You don't have access yet" page).

### Rotating secrets

Deployment token (the old one stops working at once):

```bash
: "${RG:?run step 1 in this shell first}" "${SWA:?run step 1 in this shell first}" &&
  az staticwebapp secrets reset-api-key --name "$SWA" --resource-group "$RG" --output none &&
  az staticwebapp secrets list --name "$SWA" --resource-group "$RG" \
    --query properties.apiKey --output tsv \
  | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN
```

Storage account key: the app setting is built from `key1` at deployment time, so renew it and
re-run the deployment right away (the API fails until the new setting is in place). Use the same
`--parameters` as in step 1; the command below shows the defaults:

```bash
: "${RG:?run step 1 in this shell first}" "${STORAGE:?run step 1 in this shell first}" &&
  # --output none: the command otherwise prints the new keys
  az storage account keys renew --account-name "$STORAGE" --resource-group "$RG" --key key1 \
    --output none &&
  az deployment group create --resource-group "$RG" --name modig-final-inspection \
    --template-file infra/main.bicep --parameters swaLocation=westeurope # + step-1 overrides
```

## Estimated monthly cost

Azure list prices in SEK, excluding VAT, as of October 2026; storage in Sweden Central, the API in
West Europe. Usage assumes ~1 GB stored (mostly photos, including 7 days of soft-deleted
overwrites), ~10 000 blob write/list operations and ~50 000 reads per month.

| Item                                                | Price                            | Per month   |
| --------------------------------------------------- | -------------------------------- | ----------- |
| Static Web App, Free plan (hosting, API, auth, TLS) | 0                                | 0 SEK       |
| Blob storage, Hot LRS: 1 GB                         | 0.1834 SEK/GB                    | 0.18 SEK    |
| Blob write/list operations: 10 000                  | 0.4984 SEK/10 000                | 0.50 SEK    |
| Blob reads: 50 000                                  | 0.0399 SEK/10 000                | 0.20 SEK    |
| Table storage (deviations): < 0.01 GB, < 10 000 ops | 0.4485 SEK/GB, 0.0036 SEK/10 000 | < 0.01 SEK  |
| Data transfer out (first 100 GB free)               | 0                                | 0 SEK       |
| Inter-region transfer, storage → API: < 0.5 GB JSON | 0.1993 SEK/GB                    | < 0.1 SEK   |
| **Total**                                           |                                  | **≈ 1 SEK** |

That is far below the 50 SEK/month target: even ten times the usage (10 GB, 100 000 writes,
500 000 reads) comes to about 9 SEK. Add 25 % VAT if it is not reclaimed. No resource has a fixed
monthly fee, so the cost only grows with stored data and traffic.
