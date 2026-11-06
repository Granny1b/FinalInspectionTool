# Decisions

Judgement calls made while building, newest phase last. Each line: the decision, then why.

## Phase 1 – Foundation

### Worth reviewing first

The calls with product, security or cost impact. Each is explained in its section below.

- Node 22 instead of the brief's Node 20 (Platform).
- Free plan: anyone with a Microsoft account can sign in, so access depends only on the invited
  roles `inspector` and `admin`, written in lowercase (Auth). (Superseded by Users and names: the
  API takes the role from the people list, with invitations as the fallback.)
- After sign-in users land on `/`; a deep link is lost (Auth).
- A fourth storage container, `config`, for settings and the inspection counter (Data and
  storage).
- The seeded RigiMill MG template is published revision 2 with a draft at revision 3 (Seed).
- The seed creates the settings once and never touches them again (Seed).
- Pull requests get no preview environment, because previews would use production data (Infra
  and CI).
- Shared-key access and public network access stay on the storage account (Infra and CI).
- Storage in Sweden Central, the app and its API in West Europe (Infra and CI).
- API logs need an Application Insights connection string; there is none by default (Infra and
  CI).
- The e2e job does not block deployment yet (Infra and CI).

### Platform

- **Node 22, not the brief's Node 20.** Node 20 left Azure Functions support on 2026-04-30. SWA
  managed functions accept `node:22`; `node:24` is not offered yet. Move to 24 before 2027-04-30.
- **TypeScript 6.0, not 7.x.** typescript-eslint supports TypeScript < 6.1.
- **Workspaces `shared`, `api`, `app`, `seed`.** `@modig/shared` is TypeScript source consumed by
  the others, so there is no build step and no publishing.

### Data and storage

- **A fourth container, `config`** (`config/settings.json`, `config/inspection-counter.json`). The
  brief needs somewhere to keep the machine models, default location and company info, and names
  no place for it.
- **IDs are 16-character alphanumeric nanoids (no `_` or `-`).** They are safe in blob paths and
  unambiguous inside the Table RowKey `{inspectionId}_{itemId}`.
- **Model codes are letters and digits only, wherever they appear** (`ModelCodeSchema`: settings,
  templates, the inspection front page, deviation rows). The code is the deviations table's
  PartitionKey, which rejects `/`, `\`, `#`, `?` and control characters; checking it in every
  schema stops a bad code before an inspection is saved, not at the table write after it.
- **`ExtraDeviation = { id, description, comment?, resp?, severity }`.** The brief's
  `Inspection.extraDeviations` references a `Deviation` type it never defines.
- **Templates get an optional `changeNote`** for the revision history. Published-at/by come from
  `updatedAt`/`updatedBy` of the immutable `rev-{n}.json`, so no extra fields are needed.
- **N/A is stored as `"NA"`** (the brief's `RowResult` type) and displayed as "N/A".
- **`updatedBy` and `finalisedBy` store the email.** It is stable and trustworthy; there is no user
  table to look names up in. (Still the email; since Users and names the app shows the name from
  the people list.)

### Auth

- **Free plan with the pre-configured Entra ID provider; access is gated only on the custom roles
  `inspector` and `admin`, never on `authenticated`.** On the Free plan anyone with a Microsoft
  account can sign in, so the invited role is the only gate. At most 25 invited users.
  (Superseded by Users and names: the route gate is `authenticated`, the API takes the role from
  the people list, and invitations are the fallback.)
- **Login is a static `/login.html`, not an SPA route.** The app bundle itself stays behind the role
  check. After sign-in users land on `/`: SWA's 401 redirect drops the deep link, which is
  acceptable for this tool.
- **Each pre-login file has its own exact anonymous route** (`/login-assets/auth.js`,
  `/login-assets/auth.css`), never a wildcard. The SWA CLI matches routes on the raw path, so
  `/login-assets/..%2fassets/…` matched `/login-assets/*` and served the role-gated bundle to
  anyone. A new pre-login file needs its own route.
- **`/api/me` derives the display name from the email.** SWA's `x-ms-client-principal` carries no
  claims (no name) on managed functions, and the brief rules out a user table. (Since Users and
  names: the name on the people list, else from the email.)
- **Roles are invited in lowercase** (the Settings page and README say so). The API also
  lowercases role names before checking them, as defence in depth: Azure documents role names as
  case-insensitive. The pre-login script forwards a user to the app only on an exact match, like
  the SWA CLI's gate, so it can never bounce someone the gate refuses between `/login.html` and
  `/`.
- **Users are keyed on the trimmed, lowercased email.** `userId` changes when a user is re-invited.
- **`nameFromEmail`:** split the local part on `.`, `_` and `-`, and capitalise. Fewer than two
  parts keeps the local part as is (`sam`). A value without `@` is used whole.
- **Principal parsing never throws:** base64 → JSON → zod, and any failure means 401. Unknown
  fields (e.g. claims) are dropped; `userRoles` is required.
- **`endpoint({ role })` treats the role as a minimum** (admin ⊇ inspector). 401 and 403 are thrown
  inside the wrapper, so all error-to-response mapping lives in one function.
- **Every function uses `authLevel: 'anonymous'`.** SWA managed functions don't use function keys;
  SWA authenticates the user and `endpoint()` checks the role.
- **A signed-in user without a role who reaches `login.html` is forwarded to `/forbidden.html`.**
  Signing in again would only loop. Locally the SWA CLI answers such users with 401 (→ login)
  rather than Azure's 403, so this also keeps local dev from looping.
- **`apiFetch` leaves the app only for SWA's own answers, and only on a read.** An expired session
  (a redirect, or a 401 without an `ApiError` body) sends a read to `/login.html`; a 403 without
  one (no app role) to `/forbidden.html`. A write (phase 2) throws instead ("You were signed out.
  Sign in again in a new tab, then try again."): the page may hold unsaved work whose leave warning
  can keep it open, and a save that never settled would hang the editor for good. A JSON
  `ApiError` 401 or 403 comes from a function and is thrown for the page to show. Navigating on the
  API's own 401 would loop, because the login page sends every role holder straight back to `/`.
- **Sign-out uses a relative `post_logout_redirect_uri=/login.html`.** The SWA CLI builds the
  redirect as origin + that value, so an absolute URL ended on a broken address locally. Sign-in
  keeps an absolute return URL, which keeps users on the host they came from.
- **The forbidden page tells users to sign out and pick another account.** `/.auth/logout` may not
  end the Entra session, so Microsoft can sign them straight back in.
- **Other identity providers (`github`, `twitter`, `x`) return 404** through route rules. There is
  no `auth` block in `staticwebapp.config.json`, because any `auth` object switches
  `/.auth/login/aad` to the custom OIDC flow (Standard plan only).

### Seed

- **The workbook lives at `seed/Final_Inspection_rev_2.xlsm`,** the path the brief names. It was
  moved from the repo root ("Final Inspection rev 2.xlsm").
- **The seeded RigiMill MG template is published as revision 2 with a draft at revision 3.** It
  continues the workbook's "Rev: 2", so printed revisions keep counting where the paper left off.
- **The section/item rule is applied literally by scanning rows.** An integer in column B plus a
  title in D is a section; a lettered row with text in D is an item; a lettered row with empty D is
  a spare line and is skipped.
- **Cell text is read from the merge master and whitespace is collapsed.** On the other cells of a
  merged range exceljs returns "[object Object]" or throws.
- **Revision and location are found by scanning `Main`** ("Rev: N", the cell under "Location"), not
  by fixed cell addresses. If missing: revision 1 or `DEFAULT_LOCATION`, with a warning.
- **`Misc` lists are read from row 2 down to the first empty row.** Only columns A/B (models) and
  E (statuses) are used.
- **What stops the import, and what only warns.** Stops: a missing sheet, sections not numbered
  1..n, a section number stored as text, an empty or untitled section, an item before the first
  section, invalid or duplicate model codes, RMMG missing. Warns: a letter out of sequence, a row
  with text in D whose column B is neither a number nor a letter (skipped, and named in the
  warning, never dropped silently), missing Rev/Location, a status list that differs from
  `STATUS_LABELS`.
- **The draft is the published revision with `status: draft` and revision N+1, without
  `changeNote`.** The note describes the published revision only. Item ids are shared because they
  are stable across revisions.
- **`changeNote` and `updatedBy` name the actual workbook file** ("Imported from
  Final_Inspection_rev_2.xlsm", "seed (Final_Inspection_rev_2.xlsm)").
- **The template name comes from the RMMG model name:** "Final inspection – RigiMill MG".
- **"Already imported" means a template with a draft whose model, or whose first published
  revision's model, is RMMG.** Since phase 2 an admin can move a template to another model; its
  first revision never changes, so the seeded template is still recognised and not imported a
  second time. `rev-N.json` is written before `draft.json`, so an existing draft means the import
  completed. A
  revision whose template has no draft is an import that stopped in between; the next run writes
  the draft from that stored revision (parsing the workbook again would mint new item ids). Writes
  never overwrite. The seed assumes a single writer: two first runs at the same moment could each
  create a template.
- **Settings are created once and never touched again by the seed,** so admin edits, including
  removed or recoded models, are kept. An existing `config/settings.json` is not even read.
- **Storage retries are short** (blob 3 tries, table 2 retries, ≤ 2 s delays). A missing Azurite
  fails within seconds with a "start Azurite" hint instead of ~16 s of SDK retries.
- **Plain http is allowed for the Tables client only when the blob endpoint is http** (Azurite).
- **Blobs are written as indented JSON**, so they are readable in Storage Explorer; they are small.
- **A relative workbook path resolves against `INIT_CWD`** (where npm was run), because `npm -w`
  runs the script inside `seed/`.
- **Only an unset `STORAGE_CONNECTION_STRING` means local Azurite; an empty one stops the seed.**
  An empty value is usually a failed `$(az …)` in the production seed command, which would
  otherwise seed local Azurite and look like success.
- **`--dry-run` also builds and validates the documents**, so it proves they pass the shared
  schemas.
- **The seed prints the account and endpoints it writes to, never the key or a SAS token.**
- **Test Azurite runs the azurite package's own bin scripts with `process.execPath`** (no shell, no
  `.bin` shims; works on Windows) on two OS-assigned ports reserved at once. Teardown is SIGTERM,
  then SIGKILL after 3 s.
- **Storage tests start clean:** `beforeEach` deletes all containers and the table.

### Frontend

- **Tailwind's default palette is switched off** (`--color-*: initial`). Every colour comes from
  the tokens in `app/src/index.css`; later phases add tokens there instead of ad-hoc classes.
- **Primary buttons and focus rings use brand-600 `#0b7db3`, not `#29ABE2`.** White text on
  `#29ABE2` is 2.6:1 and fails WCAG AA; 600 is the same hue at 4.6:1. As a focus ring `#29ABE2` is
  2.6:1 on white and 2.4:1 on the page background, below the 3:1 WCAG 1.4.11 asks; 600 is at least
  4.2:1. Brand 500 is kept for the logo and accents.
- **Text is ink-500 or darker.** ink-500 was darkened from `#6a7480` (4.4:1 on the page
  background) to `#646e7a` (4.8:1); ink-300 and ink-400 are for borders, icons and decorative
  markers only.
- **`apiFetch` returns a promise that never settles when it navigates to the login or forbidden
  page** (reads only, see Auth). The page is unloading; settling would only flash an error state.
- **`apiFetch`'s `schema` is typed structurally (`{ parse }`).** A non-JSON 2xx and a schema
  mismatch both become `ApiRequestError('internal')`, so the UI deals with one error type.
- **`/api/me` is cached forever (`staleTime: Infinity`).** Roles only change at the next sign-in.
  `useCurrentUser()` reads the cached query instead of a React context, because pages render only
  after `/api/me` has loaded. (Since Users and names a role on the people list counts in the API
  at once; the app still reads `/api/me` once per visit, and Settings refreshes it after a
  change.)
- **The tablet drawer is a native `<dialog>` opened with `showModal()`.** That gives the focus
  trap, Escape and an inert background for free; the page behind it is also kept from scrolling.
  It closes itself when the viewport crosses `lg`, so an invisible modal can't leave the page
  inert.
- **The pre-login pages share external `login-assets/auth.js` and `auth.css`, with no inline script
  or style.** The CSP then needs no `'unsafe-inline'`. `auth.css` mirrors a few tokens by hand
  because the Tailwind build sits behind sign-in. For the same reason those pages don't load Inter:
  they use it only if it is installed, otherwise the system font.
- **The logo is the official `MODIG_LOGO_BLACK-1.png`, renamed to `app/public/modig-logo.png`**
  (Vite serves only `public/`). The app, both sign-in pages and later the print view all load this
  one file, which is anonymous in the SWA config. `favicon.png` (64 px) is the logo's blue swoosh
  cut from the same file. The logo is shown 40 px high in the sidebar so the wordmark stays
  legible.
- **The CSP has `style-src 'self'` without `'unsafe-inline'`.** Tailwind ships as an external file
  and React sets style props through the CSSOM, which CSP does not block (verified: zero
  violations).
- **The CSP allows any `https://*.blob.core.windows.net` in `img-src` and `connect-src`** for now.
  When phase 5 adds SAS uploads, pin it to the one storage account's host (CI can fill it in from
  the deployment output).
- **zod runs in `jitless` mode in the browser** (`app/src/lib/zodJitless.ts`, the first import in
  `main.tsx`). zod 4's `new Function` probe is reported as a CSP violation. It can't go through
  `@modig/shared`, because that barrel builds schemas on import. The API keeps zod's JIT.
- **No `ws:` in `connect-src`.** The SWA CLI skips `globalHeaders` when it proxies a dev server, so
  Vite's HMR websocket works without weakening the production CSP.
- **`Permissions-Policy` keeps `camera=(self)`** for future photo capture on tablets; microphone,
  geolocation, payment and USB are off.
- **`navigationFallback` excludes `/api/*`, `/.auth/*`, `/assets/*`, `/login-assets/*` and static
  file extensions**, so a missing asset is a 404, not `index.html`. `/.auth/*` keeps a blocked
  identity provider a 404: Microsoft documents a fallback to `index.html` otherwise (not verified
  in Azure; the README's lock check allows for either).
- **The frontend's source maps are deployed** (`sourcemap: true`). They sit behind the role check
  like the bundle, contain no secrets and make production stack traces readable.
- **Planned actions are visible but disabled, labelled with their phase** (New inspection: phase 3,
  Export CSV: phase 6; New template arrived in phase 2). The settings form says "a later phase"
  because the brief schedules no phase for it. (Superseded: the settings are edited since Settings
  lists and deviation categories.)
- **Inspectors see Templates without actions.** Insights and Settings are hidden from their
  navigation and guarded by `RequireRole` (UI only; the API checks again).
- **The Settings page carries the brief's invite how-to:** portal steps, the
  `az staticwebapp users invite` command, the 25-user cap, and "role changes apply at the next
  sign-in". (Superseded by Users and names: Settings manages the people list; the README keeps
  the invitation for the first admin.)
- **`vite.config.ts` has its own `tsconfig.node.json`**, so Node types never leak into browser
  code. `typecheck` runs both configs.
- **`build` is plain `vite build`, without `tsc`.** Type-checking is a separate script that CI runs.

### API

- **The API is bundled by esbuild into one CommonJS file, `dist/index.cjs`.** The Functions worker
  cannot load an ESM bundle of the Azure SDKs ("Dynamic require of 'util'"). The `.cjs` extension
  makes the worker `require()` it although `api/package.json` keeps `"type": "module"`.
- **Only `@azure/functions-core` is external.** The worker injects it; bundled, `@azure/functions`
  silently falls back to "test mode" with no functions.
- **`api/deploy` holds `host.json`, a dependency-free `package.json` and `dist/`.** SWA deploys it
  as-is with `skip_api_build`; `func start` was verified to run from it without `node_modules`.
- **The source map ships in `dist/` and `deploy/`.** `--enable-source-maps` needs it; it only costs
  deploy size.
- **No `extensionBundle` in `host.json`.** HTTP triggers are built into the host, so no bundle
  download is needed (verified).
- **`host.json` logging is the Functions template default** (App Insights sampling, requests
  excluded). It only takes effect once an Application Insights connection string is set (see
  Infra and CI).
- **`local.settings.example.json` sets `AzureWebJobsStorage=UseDevelopmentStorage=true`.** Without
  it the host logs "Process reporting unhealthy" every 30 s.
- **`local.settings.example.json` sets `languageWorkers__node__arguments=--enable-source-maps`**,
  so logged stacks point at `.ts` files. Calling `process.setSourceMapsEnabled()` inside the bundle
  does not work.
- **No `.funcignore`.** Only `func azure functionapp publish` and pack read it; neither `func start`
  nor the SWA deploy does.
- **A `prestart` script creates `local.settings.json` from the example**, so
  `npm start -w @modig/api` works on its own. It never overwrites an existing file.
- **Unknown errors are logged and return a bare 500** (`{ error: 'internal' }`). Nothing from the
  original error reaches the client.
- **`readJsonBody`: unparseable JSON is a 400 without details; a schema failure is a 400 with the
  zod issues as `details`**, so the client can map paths to fields.
- **`requireIfMatch`: a missing `If-Match` is a 400, and so are `*` and a list of ETags.** Every
  save is conditional, so these are client bugs, not a licence to overwrite blindly.
- **`requireIfMatch` strips a `W/` prefix.** A compressing proxy may weaken the blob's strong ETag,
  and storage would then reject every save.
- **Storage is one lazy singleton holding both clients.** `allowInsecureConnection` for Tables is
  derived from the blob endpoint's protocol, as in the seed.
- **The Azure SDKs keep their default retry policies.** Fewer knobs; the volume is tiny.
- **`ensureStorage()` runs automatically from `readJson`/`writeJson`/`listBlobNames`**, memoised per
  process and cleared on failure. It is a safety net for a fresh Azurite and costs about 5
  idempotent calls per cold start in Azure. Direct `containerClient()` users must await it
  themselves. Since phase 3 the deviations table has its own memo, `ensureTable()` (see there).
- **Stored data that is not JSON or fails validation is a logged 500 that names the blob, not
  a 400.** It is not the caller's fault.
- **`writeJson` maps exactly 412 `ConditionNotMet` → `PreconditionFailedError` and 409
  `BlobAlreadyExists` → `ConflictError`.** Any other storage error is a 500.
- **`ConflictError`'s default message is "This already exists – reload to see the latest
  version."** Callers can pass a better one.
- **`api/test/azurite-global-setup.ts` is a copy of the seed's**, not an import from another
  workspace, to keep workspaces independent. It could be hoisted later.
- **Keep the number of `app.http()` registrations well under 40.** There is an open SWA regression
  for Node 22 apps that register 40 or more.

### Infra and CI

- **SWA `stagingEnvironmentPolicy: 'Disabled'`; pull requests get CI but no preview environment.**
  Previews share the production app settings, so a public preview URL would read and write the
  real inspection data.
- **Container and table names are Bicep `var`s, not params.** They must match `shared/src/storage.ts`;
  making them configurable in one place only would break the app.
- **Storage in the resource group's region (Sweden Central in the README); the Static Web App and
  its managed Functions API in West Europe.** Static Web Apps is not offered in Sweden. Data at
  rest stays in Sweden and browser photo transfers by SAS stay local. The cost is about 20–30 ms
  per API-to-storage round trip and inter-region transfer at 0.1993 SEK/GB (well under 1 SEK a
  month here). Pass a different `location` to co-locate if latency ever matters more.
- **`devOrigins` (extra blob CORS origins) defaults to none.** Local development uses Azurite,
  never the production account, so localhost origins on production CORS served no workflow.
- **Outputs are only `swaName`, `swaUrl` and `storageAccountName`.** No secrets in outputs.
- **No `main.bicepparam`.** Every parameter has a sensible default and an override is one
  `--parameters` flag. The README says to repeat any overrides on every re-run, including the
  key rotation: an omitted `storageAccountName` or `swaName` would create a new, empty resource
  and point the app at it.
- **`allowSharedKeyAccess: true` and public network access stay on.** SWA managed functions support
  neither managed identity nor private endpoints.
- **Blob and container soft delete for 7 days; no versioning.** With soft delete, every overwrite
  (each autosave) and every delete keeps the previous copy as a billed snapshot for 7 days: a
  7-day undo for both, at tens of MB for blobs this size. Versioning would keep every autosave
  forever unless a lifecycle rule were added too. ETags, not either feature, prevent lost
  concurrent saves.
- **The connection string uses `key1` only.** Rotation is: renew `key1`, then re-run the deployment.
- **The Bicep file owns all app settings.** `staticSites/config` replaces them all on each
  deployment, so settings added in the portal would vanish.
- **API logging is opt-in through the `appInsightsConnectionString` parameter, not a provisioned
  resource.** Managed Functions log only to Application Insights, so without it the logged 500s
  above are recorded nowhere. The portal's "Enable Application Insights" adds an app setting that
  the next deployment removes, so the parameter sets `APPLICATIONINSIGHTS_CONNECTION_STRING`, the
  Functions host's standard setting (not yet tried on a deployed app). Nothing is provisioned by
  default, to keep the brief's two resources and the cost estimate.
- **CI builds everything and deploys prebuilt output** (`skip_app_build`, `skip_api_build`). Oryx
  cannot resolve the workspace package `@modig/shared`.
- **The CI job installs with `npm ci --ignore-scripts`.** That skips the ~600 MB Azure Functions
  Core Tools download, which only the e2e job needs, and no dependency install script runs in the
  job that builds the deployed output. The e2e job installs normally.
- **The deploy job reuses the CI job's artifact and has no checkout and no npm.** It deploys exactly
  what passed CI, and no package code runs in the job that holds the deployment token.
- **Deploy is skipped (with a notice) until the token secret exists.** `DEPLOY` is computed in the
  CI job's env, which may read secrets, and exposed as a boolean output, because a job-level `if`
  can't read secrets. This was preferred over `SKIP_DEPLOY_ON_MISSING_SECRETS`, which still builds
  the action's image and shows a green deploy that did nothing.
- **Only `refs/heads/main` deploys** (push, or a manual run from main).
- **Concurrency is per ref; only pull-request runs cancel in progress.** Runs on main queue, so a
  deploy is never cut off and the newest commit always deploys last.
- **Runners are pinned to `ubuntu-24.04`.** `ubuntu-latest` moves to 26.04 in November 2026.
- **Actions are pinned to major tags** checked on 2026-10-06: checkout@v7, setup-node@v7,
  upload-artifact@v7, download-artifact@v8, static-web-apps-deploy@v1.
- **`setup-node` gets `cache: npm` explicitly.** Since v6, automatic caching needs a
  `packageManager` field, which the root `package.json` doesn't have.
- **`persist-credentials: false` on checkout.** No job pushes to git.
- **CI runs `bicep lint infra/main.bicep`.** Infra is deployed by hand, so this catches broken
  edits in pull requests; errors fail the job and warnings only print.
- **The e2e job is separate and non-blocking (`continue-on-error`) for now.** The auth lock is
  security-critical, so the signal is worth having; make it blocking once it has proven stable on
  hosted runners.
- **Artifacts are kept 7 days.** A failed deploy can be re-run later in the week. The Playwright
  report is uploaded only on failure.
- **No GitHub `environment`, `repo_token` or `production_branch`.** There are no PR comments or
  previews, and only main deploys.
- **The cost estimate is ≈ 1 SEK/month, about 9 SEK at ten times the usage.** The assumptions are
  in the README's cost table.

### Tooling and local development

- **`@playwright/test` is pinned exactly (1.56.1)**, so the browser build only changes on a
  deliberate upgrade. Newer versions exist (1.63 in October 2026); upgrade with
  `npm i -D -E @playwright/test@latest` and `npx playwright install chromium` (CI installs the
  matching Chromium itself). On a new machine, run `npx playwright install chromium` once.
- **`.gitattributes` makes every text file LF** (`* text=auto eol=lf`). Git for Windows checks out
  CRLF by default, which made `prettier --check`, and so `npm run check`, fail on a fresh Windows
  clone. An existing clone is fixed by one `npm run format`.
- **The few plain-JS files are type-checked too** (`checkJs` with JSDoc types, brief §9 "strict
  everywhere"): `app/tsconfig.public.json` checks the pre-login script, `api/tsconfig.json` the
  build scripts, the root config `eslint.config.js`. They stay JS: the pre-login pages have no
  bundler, and the scripts run before anything is built.
- **`npm run dev` is concurrently over one `dev:*` script per process** (`blob`, `table`, `seed`,
  `api-build`, `api`, `app`, `swa`). The prefixes are the script names, and each command is
  readable on its own.
- **`--kill-others-on-fail`, not `--kill-others`; nodemon runs with `--exitcrash`.** The seed exits
  with code 0 and must not stop the rest; any failure (a taken port, a failed seed, `func start`
  exiting) stops the whole stack loudly instead of leaving half of it running. Without
  `--exitcrash` nodemon swallowed a failed `func start` ("waiting for file changes"), and the SWA
  CLI then proxied `/api` to whatever already held port 7071.
- **Azurite runs as two processes, blob and table** (no queue), sharing `.azurite/`. Both use
  `--silent --disableTelemetry`; blob also needs `--skipApiVersionCheck`, because
  @azure/storage-blob 12.34 sends an API version Azurite 3.37 rejects. Without
  `--disableTelemetry`, a stopped Azurite was seen lingering.
- **The API reloads via esbuild watch plus nodemon restarting `func start` when `dist/*.cjs`
  changes.** func does not reload rebuilt code by itself. Verified: a code change is served about
  3 s later; esbuild doesn't rewrite identical output, so merely touching a file restarts nothing.
- **The SWA CLI is configured in `swa-cli.config.json`** and starts after `wait-on` sees Vite and
  the Functions host's `/admin/host/status`. `swaConfigLocation` is `app/public`, because the CLI
  searches recursively and could pick up a stale copy in `app/dist`.
- **`apiDevserverUrl` is `http://127.0.0.1:7071`, not `localhost`.** For a `localhost` API URL the
  CLI first probes it through `HTTPS_PROXY` (ignoring `NO_PROXY`) and exits if that fails, as it
  does behind a corporate proxy. With 127.0.0.1 the only remaining effect is a harmless "Unable to
  query functions trigger types" warning.
- **The SWA CLI keeps its default verbosity.** Its per-request log is noisy but shows each route
  decision (302/401/403), which is what you need when debugging access rules.
- **The seed runs on every `npm run dev`, once Azurite accepts connections.** It is idempotent and
  takes about 2 s.
- **A root `tsconfig.json` type-checks the root configs and `e2e/`.** `npm run typecheck` runs it
  and then every workspace's `typecheck`.
- **`npm run build` is `npm run build --workspaces --if-present`.** `api` → `api/deploy`, `app` →
  `app/dist`; `shared` and `seed` have nothing to build.
- **`npm run check` is typecheck + lint + format:check + test.** CI runs the build separately and
  the e2e tests in their own job.
- **The root `seed` script forwards arguments** (`npm run seed -- --dry-run`).
- **Playwright: Chromium only; `webServer` is `npm run dev`, ready when `/login.html` answers
  through the SWA CLI.** Locally it reuses a running stack (`reuseExistingServer` except in CI); it
  stops it with SIGINT like Ctrl+C, so Azurite can flush, and force-kills after 15 s (the Functions
  host uses its full 10 s shutdown allowance).
- **The e2e tests sign in by setting the `StaticWebAppsAuthCookie` cookie.** That is all the SWA
  CLI's mock form does, and the form needs a CDN.
- **The e2e seed check reads Azurite directly** (`@azure/storage-blob`, validated with
  `TemplateSchema`) because no templates endpoint exists in phase 1. It always targets local
  Azurite, never `STORAGE_CONNECTION_STRING`.
- **The e2e suite tests the dev stack**, where the SWA CLI applies routes and roles but not the CSP,
  global headers or `navigationFallback`. The auth/shell tests were also run once, by hand, against
  the built app and `api/deploy` behind the SWA CLI (all passed); that is not part of the suite.
- **Prettier ignores the product brief** (`final-inspection-claude-code-prompt.md`). It is the
  user's document and is not reformatted.
- **`infra/*.json` is git-ignored.** `bicep build` writes the compiled ARM template next to
  `main.bicep`, and only the Bicep source should be committed.

## Phase 2 – Templates

### Worth reviewing first

The calls with product, security or data impact. Each is explained in its section below.

- Changing a template's model to one another template uses answers 409, not the contract's 400
  (API).
- One template per model is checked by scanning drafts, not enforced atomically (API).
- Publishing races: the first `rev-N` write wins and the loser gets 412; someone who saves between
  the publish's two writes keeps their draft (API).
- Publishing a draft identical to the latest revision is blocked in the UI only (Editor).
- Autosave stops at the first 412 until Reload, unless the 412 turns out to be its own save whose
  answer was lost; network and server errors retry; other refusals are shown and not retried
  (Editor).
- A save after the session ended is shown as a failed save with a Sign in link, not a jump to the
  login page (Editor; changes a phase 1 decision under Auth).
- Deleting a row or section can be undone until the next change to the structure; nothing else
  can (Checklist document).
- An upload URL lets any role holder write one new image blob for 10 minutes, of any size or type
  (Photos).
- Replaced or removed cover photos stay in storage; there is no delete endpoint (Photos).
- Inspectors see only published revisions, but the list's row count and "last edited" come from
  the draft (Editor).
- The CSP still allows any `https://*.blob.core.windows.net`. Phase 1 planned to pin it to the
  storage account once uploads exist; they now do (Photos).
- The built app is checked locally with a copy of the SWA config whose CSP also allows Azurite;
  the deployed config is unchanged (Tooling).
- Vite keeps idle connections open, working around a race in the SWA CLI's dev proxy that made
  modules load empty (Tooling).
- The end-to-end tests write throwaway templates straight into the local Azurite and never depend
  on the seeded RigiMill MG's content (Tests).

### API and storage

- **A model change to a model another template uses is 409 `conflict`**, like creating a second
  template for it; an unknown model stays 400. The contract table said 400 for both. The message
  names the model as the editor shows it ("RigiMill MG"), not its code.
- **The model is validated on save only when it changes,** so a model later removed from the
  settings never makes its template unsaveable.
- **Save and publish compare `If-Match` with the draft's ETag before the model and publish
  checks,** so an outdated editor gets 412, never a model or publish error. Only a malformed body
  (and, on save, duplicate ids) is refused first: those are client bugs whatever the version. The
  conditional write stays the real guard.
- **Publish writes `rev-N.json` (create-only), then moves the draft on to N+1 (`If-Match`).** If
  someone saved in between, that 412 is tolerated: the revision stands and their draft is kept.
  Losing the race for `rev-N` itself (someone published the same draft first) is a 412. A second
  publish that reads the draft between the first one's two writes publishes the same content
  again as N+1: harmless, and inherent in this order. **Once `rev-N` is written, nothing turns the
  publish into a failure:** any other error moving the draft on is logged and the publish still
  answers 200. A failure there would make the user try again, and the unchanged ETag would let
  that publish the same content again as N+1.
- **The draft moved on by a publish gets the publish time and publisher as `updatedAt/By`.**
  Drafts never carry a change note; a blank note is not stored.
- **Publishing an unchanged draft is not refused by the API.** The editor disables Publish
  instead.
- **Ids must be unique: section ids among sections, row ids across the whole template** (results
  and KPIs key on the row id). A section and a row may share an id.
- **The revision history is read from the `rev-N` blobs themselves** (published at/by =
  `updatedAt/By`), in parallel; the list reads only each template's latest revision. No index
  blob to keep in sync.
- **A template folder with revisions but no draft** (an interrupted seed) is left out of the list
  and is 404; the next seed run completes it.
- **The list is sorted by name with a Swedish collation** (`Intl.Collator('sv')`, numeric), then by
  id.
- **Malformed route parameters are 400; well-formed but missing is 404.** A revision number must
  be a plain positive integer ("3", not "03", "3.0" or "-1").
- **Without `config/settings.json`, `GET /api/settings` is 404** ("run the seed") and every model
  counts as unknown.
- **One template per model is checked by scanning the drafts, not atomically.** Two admins
  creating one for the same model at the same moment could both succeed; accepted for a handful
  of admins.
- **8 function registrations, one per route,** with GET/POST and GET/PUT dispatched inside the
  function; well under SWA's limit of 40.
- **Published revisions are served with `Cache-Control: private, max-age=31536000, immutable`**
  (successes only). Settings have no ETag yet (no settings editing; Settings lists added it with
  `PUT /api/settings`). Create answers 201 without a `Location` header; `upload-url` answers 200
  (the browser's upload creates the image).
- **API test files run one after another** (`fileParallelism: false`): the endpoint tests reset
  the shared test Azurite before each test. Publish races are tested deterministically by
  running a second admin's write between the publish's two writes.

### Photos

- **Upload URL: create and write on that one blob, 10 minutes; read URL: read only, 15 minutes,
  issued only if the blob exists.** No start time (no clock-skew window); the expiry is whole
  seconds so `expiresAt` equals the SAS. The account is https-only in Azure, so the protocol is
  not restricted.
- **An upload URL cannot limit size or content type.** It is issued to role holders only and
  covers one new blob name.
- **A read URL serves an inline JPEG whatever the uploader stored** (`rsct=image/jpeg`,
  `rscd=inline` in the SAS). Otherwise an uploaded web page or `attachment; filename=…` would be
  served as such from the storage account's domain. (Phase 4 made the flattened copies of
  marked-up photos JPEGs too, so this still covers every image.)
- **Photos are scaled in the browser** (`createImageBitmap` with the camera orientation, white
  background for transparent PNGs, at most 1600 px, JPEG 0.8) and PUT with `credentials: 'omit'`.
- **Read URLs are cached for 10 minutes**, under their 15-minute lifetime.
- **Replacing or removing a cover photo leaves the old blob.** There is no delete endpoint and
  the cost is negligible.
- **`upload-url` runs `ensureStorage()`** although it makes no storage call, so the `images`
  container and, locally, Azurite's CORS rule exist before the browser uploads.
- **Locally the API sets Azurite's blob CORS rule** (the Bicep rule, for origins
  `localhost:4280`, `127.0.0.1:4280` and `localhost:5173`) once per process, replacing any other
  rules on the emulator.
- **The CSP still allows any `https://*.blob.core.windows.net`** in `img-src` and `connect-src`.
  Pinning it to the one storage account needs CI to fill in the host from the deployment; not
  done yet.

### Checklist document

- **One sheet laid out like the printed checklist.** The Comment / Status / Resp columns appear
  when the sheet is at least 52rem wide (a container query, not a viewport breakpoint), so they
  are hidden on tablets.
- **Rows show only their letter; the section number is in the header.** Labels and screen reader
  announcements use the full ref ("Row 3.c text").
- _Superseded: spare lines were removed, see 'Spare lines removed'._ **Spare rows are previewed
  faint and hidden from screen readers** (one sentence says how many), before **+ Add row**, so the
  lettering continues as on paper.
- **Row actions (Guide, Duplicate, Delete) appear on hover and on keyboard focus; on touch
  screens each row has one ⋯ menu instead.** Three icons on 90 rows of a tablet were noise.
- **The Guide action is shown disabled, with "Guide: coming in phase 5".**
- **A row is one line of text:** `Enter` never inserts a line break and pasted line breaks become
  spaces. The field grows with its text (a CSS grid trick, no measuring in script).
- **`Enter` in a section title goes to its first row, or creates it.** `Backspace` in an empty
  title does nothing; sections are deleted from the ⋯ menu, with a confirmation if they have rows.
- **After deleting a row, focus goes to the end of the previous row,** else the start of the next,
  else the section title. A duplicate gets the focus.
- **Only a fresh Backspace press deletes an empty row.** Holding Backspace to clear a row stops
  once it is empty, and after a delete the key's auto-repeats are ignored until it is released:
  otherwise they went on to eat the previous row's text and delete that row too.
- **The last deleted row or section can be put back with Undo** ("Row 1.c deleted · Undo" at the
  bottom of the window), with the same ids, so its history in results and KPIs stays whole. It is
  offered until the next change to the structure (add, duplicate, move, delete), not timed, and
  not for an empty row or an empty untitled section (Enter then Backspace would show it all the
  time). There is no undo for anything else: text fields have the browser's own, and a confirm
  per row would slow a 90-row checklist down.
- **`↑` / `↓` leave a row only from its first or last visual line,** measured on an off-screen
  copy of the field.
- **Duplicates are deep copies with new ids**; guide image ids are copied as they are (the images
  never change). A duplicated section keeps its title.
- **Menus use the native popover API and confirmations a native `<dialog>`,** for focus handling,
  Escape and light dismiss without a library. The first enabled menu item is focused as the menu
  opens, and an open menu follows its button while the page scrolls (closing on scroll closed
  menus that had just opened). The confirm button's danger style is local: `Button` has no
  danger variant.
- **The section ⋯ menu sits at the end of the title on a wide sheet and with the row controls on
  a narrow one.** The sheet has no maximum width; the page decides.
- **Focus moves after the edit has rendered,** then scrolls into view (`focus()` doesn't scroll an
  element that already has focus, e.g. the ⋯ of a section that just moved).
- **Performance:** rows and sections are memoised and the actions object is stable, so a keystroke
  re-renders one section and one row (measured: 6.6 ms median from key to frame on 90 rows).
  Rows and sections learn what is being dragged from a prop, not dnd-kit's `useDndContext`, which
  changes on every pointer move and re-rendered all 90 rows each time (janky drags and slow edge
  scrolling on a tablet). Now a pointer move re-renders only the dragged row.
- **A long unbroken word (a URL, a part number) wraps inside its row;** the text column is capped
  at the cell's width, so it never widens the page. A long section title ends in "…" until
  focused.
- **Drag handles rest at ink-500** (5.2:1 on white): a control, so WCAG 1.4.11's 3:1 applies.
- **A row drag works on a working copy** and shows moves between sections live; the drop is one
  change and one autosave. Dropping outside any target keeps what is shown.
- **Dragging a section folds only that section to its header.** Folding all of them moved the
  dragged header away from the pointer whenever the page could not scroll far enough.
- **The keyboard moves a dragged item one place per arrow key** (a custom coordinate getter):
  dnd-kit's geometric one skipped or repeated rows once the page had scrolled. Very fast key
  repeat while the page scrolls can lose a step, never misplace the item.
- **With the keyboard, a row entering a section from below lands after its last row, from above
  before its first.** With the pointer it goes by the dragged row's position against the hovered
  row's middle.
- **Drag ids are prefixed (`section:`, `row:`, `body:`), and each section's rows area is a drop
  target,** so ids never collide and an empty section accepts rows.
- **Pointer and keyboard sensors only;** drag handles have `touch-action: none`, so a finger drags
  them on a tablet and scrolls everywhere else.
- **Screen reader announcements are our own** ("Picked up row 1.c.", "Dropped as row 2.c."):
  dnd-kit's defaults read internal ids.
- **Read-only documents are separate, simpler markup** (headings and lists, no drag and drop).
- **Publish problems are shown as an outline, a tint, an icon and text** (not colour only), linked
  to the field with `aria-describedby`.
- **During a drag, letters stay with the rows until the drop renumbers them;** the floating copy
  shows where the row currently sits in the working copy. Cosmetic, left as is.

### Editor

- **Autosave is a small framework-free scheduler** (`createAutosaver`, tested with fake timers)
  with a React binding: about 1 s after the last change, one request at a time, changes made
  meanwhile merged into the next save, `If-Match` chained from each answer.
- **Save errors:** 412 → conflict, autosave stops until Reload; network, 5xx, 408 and 429 → retried
  after 1, 2, 5, 10 and then every 30 s; any other refusal → its message is shown and not retried
  (the next change or Retry tries again).
- **A 412 after saves that failed on the way is checked first.** A save can be stored with its
  answer lost (dropped connection, timeout, a 500 after the write); the retry then sends the old
  ETag and gets 412 for the app's own save. So the autosaver reads the draft: if it equals one of
  the values that failed, it takes that ETag over and carries on; anything else is the conflict.
  A 412 after a save that got its answer is a conflict at once, without the extra read.
- **Saves and publishes give up after 30 s** (SWA's gateway gives up at 45 s), so a request that
  hangs becomes a retried or shown failure instead of an endless "Saving…".
- **A failed publish is checked the same way:** after a network error, a timeout, a 5xx or a 412,
  the editor reads the template; if the revision it was publishing now exists and the draft is
  still its own, the publish went through and is shown as done.
- **A save after the session ended** (signed out in another tab, the session ran out, the role
  removed) is a failed save that is not retried: "You were signed out. Sign in again in a new tab,
  then try again.", with a Sign in link that opens a new tab, so this one keeps the unsaved
  changes. Retry then saves. Leaving asks, and Publish shows the same reason.
- **The publish dialog gives the save's own reason when saving first fails** (e.g. the model was
  taken meanwhile); only a network failure says "Check your connection".
- **From a save's answer only the ETag, the revision number and "unpublished changes" are taken
  over,** never the content: the user may have typed on.
- **After a publish, the draft's new ETag is taken over only if the published draft equals what
  the editor holds.** Otherwise someone saved in between, and the next autosave must hit the
  conflict instead of overwriting them.
- **Every visit loads the draft afresh** (no cache: a cached ETag would be outdated by the
  editor's own saves). Reload loads it again and reopens the editor; a failed background refresh
  never closes an open editor.
- **Leaving:** a link in the app saves first and only asks if saving fails or conflicts; closing
  the tab with unsaved changes gets the browser's warning. A cover photo still uploading counts as
  unsaved: a link waits for it and saves it, and closing the tab warns. Once the editor has closed
  its autosave stops for good, so a change that comes in late (an upload finishing) is never saved
  with an outdated ETag.
- **Reload asks before discarding unsaved changes.** During a conflict the editor stays editable,
  so text can still be copied.
- **Publish is disabled when there is nothing new;** the badges say why.
- **Publish checks the draft first** and lists problems with "Go to it" links instead of the form;
  then it saves pending changes and publishes with the current ETag. Problems the server reports
  are shown the same way; a 412 closes the dialog and shows the conflict.
- **After a publish attempt with problems, they stay marked and update as you type** until the
  next successful publish.
- **Problems are listed in document order** (`validateForPublish` in shared now walks each section
  and its rows), so the list reads like the checklist.
- **A template-level problem jumps to the name field when the name is blank,** otherwise to Add
  section.
- **"Unpublished changes" shows from the first keystroke** (unsaved changes or the server's flag).
- **The editor's header is sticky;** while the editor is open the page has a matching
  `scroll-padding-top`, because Chrome ignores `scroll-margin` for `scrollIntoView('nearest')`.
- **Front page card and revision history side by side from 1280 px, stacked below;** the
  checklist always gets the full width.
- **The model list disables models that have their own template;** a saved model no longer in the
  settings stays selectable as "CODE (not in the settings)".
- **New template offers only models without a template.** The name defaults to "Final
  inspection – {model}" and follows the model until edited. (Later it also offers a new machine
  model: see Templates: delete, spare lines, cards, JSON files, new models.)
- _Superseded: spare lines were removed, see 'Spare lines removed'._ **Spare rows accept whole
  numbers in the schema's range (0–30);** anything else reverts on blur.
- **"Who" is the stored email,** with dates in en-GB ("6 Oct 2026, 14:32"), so a Swedish browser
  doesn't mix Swedish month names into the English UI. (Since Users and names: the name on the
  people list, else the email.)
- **The list is a table whose whole row is a link.** Inspectors don't see New template or the
  unpublished badge; row count and "last edited" come from the draft for both roles.
- **Inspectors at `/templates/:id` get the latest published revision, read-only** ("Not published
  yet" if there is none). Revision pages are open to both roles.
- **Saves and publishes mark the template list stale without refetching it,** which would
  otherwise cost a request per autosave.
- **New shared app components:** `Dialog`, `Field`, `PageStates`, and `lib/format`,
  `lib/useSettings`, `lib/images`, for phase 3 to reuse. A `Dialog` is closed by its caller
  through its ref (focus returns to the opener), ignores Escape while busy and, holding a form,
  doesn't close on a backdrop click. The reload and leave confirmations reuse the checklist's
  `ConfirmDialog`. (Phase 3: "ignores Escape" needs `closedby="none"` in Chrome, see there.)
- **Input borders are ink-500 at 80 %** (about 3.4:1), meeting WCAG 1.4.11's 3:1 for controls.
- **The save status is a polite live region; conflict and failed-save banners are alerts.**
  Retry moves focus to the status, so it doesn't fall to the page when the button disappears. The
  "Published revision N" notice stays until dismissed (no timed messages).
- **A conflict offers Reload next to "Not saved" in the sticky header too:** the banner is at the
  top of the page, out of view while editing far down the checklist. The page doesn't scroll to
  it, which would pull the user away from the row they are typing in.
- **Keyboard focus never falls to the page:** after a publish the notice takes it (Publish is then
  disabled), the page title after the notice is dismissed; the cover photo button stays focusable
  while uploading (`aria-disabled`), and Remove hands the focus to it.
- **A malformed id and an unknown template both show "This template doesn't exist".**

### Tests and tooling

- **Each e2e test writes its own throwaway templates into the local Azurite and deletes them
  afterwards** (with their cover photos): a draft, or one published as revision 1 for the list
  and the inspector's view. Their model code `E2E` is not in the settings, so they never take a
  model from the New template dialog. Tests run in parallel and depend on no seeded content, so
  editing or publishing the seeded RigiMill MG locally never breaks them.
- **The New template test creates a template for a real model** (the first free one) and deletes
  it in a `finally` that covers every step after Create. It needs one machine model without a
  template.
- **A Playwright global setup waits for the seed,** which runs next to the servers and can finish
  after they answer.
- **The seed check reads Azurite directly, and reads the published revision 2,** which never
  changes, rather than the draft admins edit.
- **The inspector's 403s are checked through port 4280** with the inspector's own sign-in (draft
  read, save and publish).
- **e2e timeouts are 60 s per test and 10 s per assertion.** A cold page load from the Vite dev
  server through the SWA CLI takes about 4 s, more while tests run in parallel.
- **The drag test lets go over section 2's Add row button,** a spot that does not move while rows
  shift, and waits for the placeholder before dropping. A tall viewport keeps dnd-kit's
  auto-scroll out of it.
- **Vite keeps idle connections open (`keepAliveTimeout = 0`).** The SWA CLI proxies over
  keep-alive connections it never closes (its agent has no timeout, so Node ignores the server's
  5 s hint). When Vite closed one as the CLI reused it, the CLI answered an empty 200 and the app
  failed to start. Measured over 100 parallel cold page loads: dozens of empty modules before,
  none of 10 139 responses after.
- **`scripts/local-swa-config.mjs` writes `.swa-local/staticwebapp.config.json`** for checking the
  built app: the built config with Azurite (`http://127.0.0.1:10000`) added to `img-src` and
  `connect-src`. The deployed config keeps the Azure-only policy; verified that it blocks the
  local upload and that the copy allows it, with no other CSP violations.
- **The root `tsconfig.json` includes the DOM library,** for the e2e tests' in-page callbacks.
- **The e2e tests also cover the review's fixes:** a held Backspace, Undo of a delete, a long
  word at tablet width, the section ⋯ menu and its confirmation, saving before following a link,
  the tab-close warning, a lost save answer, a save after signing out, and leaving during a photo
  upload. Each was checked to fail on the code before the fix.
- **Not done:** Vite warns that the main chunk is 598 kB (183 kB gzipped). Loading the editor
  route on demand would trim it; the API bundle is 2.9 MB since the functions use the storage SDKs.

## Phase 3 – Inspections

### Worth reviewing first

The calls with product, data or KPI impact. Each is explained in its section below.

- Finalise asks for more than the brief's "every row has a status": the front page needs a
  machine name and serial number, and every extra deviation a description (Contract).
- A save whose deviation-table update fails still succeeds; the table catches up at the next
  save. Finalise and Reopen update the table first and refuse with 503 if they can't (Deviation
  table).
- Every write checks the inspection again after updating the table and updates it again if
  another write got in meanwhile, so a slow update never leaves the table behind (Deviation
  table).
- Beyond the contract: if Finalise or Reopen updated the table but then lost the race for the
  inspection itself, the table is synced back from the stored inspection (Deviation table).
- A deviation row's `createdAt` is when the deviation was first recorded and survives later
  saves; a deviation removed and added again gets a new one (Deviation table).
- `resp` is stored in the table exactly as typed. KPIs that group by it (phase 6) must trim and
  ignore case (Deviation table).
- Inspection numbers are unique but not gapless, and the counter never goes back a year. A lost
  counter blob carries on from the highest number in use (API).
- An inspection without a photo of its own shares the template's cover photo (API).
- A new error code, `unavailable` (503): nothing was changed, send the same request again (API).
- Fields a client may not set are ignored, not refused (API).
- A held key never marks a run of rows; **Set remaining to OK** has no confirmation (it only
  fills rows without a status). It is not a Tab stop: `R` on a row does the same (Checklist
  sheet).
- The Deviation Summary is a tab next to the checklist, not a side panel (Inspection pages).
- Creating an inspection has no client timeout, so a slow create is never retried into a second
  inspection (Inspection pages).
- The e2e tests read the deviations table straight from Azurite with `@azure/data-tables`, a root
  devDependency (Tests and tooling).
- `npm run dev` starts the SWA CLI through `scripts/swa-start.mjs`, which trims its environment
  to an allow-list, and Vite now listens on `127.0.0.1`: a page load in dev went from about 6 s
  to about 1.2 s (Tests and tooling).

### Contract (shared)

- **The snapshot keeps the template's name and print settings as well as its sections**
  (`templateSnapshot: { name, sections, printSettings }`; the brief has sections only). Printing
  an inspection (phase 4) must never depend on the live template.
- **Inspections carry server-owned `createdAt/By` and `updatedAt/By`** (emails), like templates.
  The list shows when an inspection last changed; the deviation rows need nothing more.
- **Finalise rules (`validateForFinalise`)**: every row has a status (brief §5.3), the front page
  has a machine name and serial number (a report must say which machine it is about), and every
  extra deviation has a description. Problems are listed front page first, then rows in
  checklist order, then extra deviations, each with a target the page can jump to.
- **The list row (`InspectionSummary`) also carries `filled` and `total`,** so the list can show
  "87 / 90 rows" for inspections in progress.
- **`ApiError` gained the code `unavailable` (503)**: a storage step failed before anything
  changed, so the same request can be retried. `internal` would have hidden that.

### API and storage

- **The list is one blob listing with metadata.** Every write stores the inspection's list row in
  one metadata entry, `summary`: the row without its id (the blob name is the id) as
  `encodeURIComponent(JSON)`, because metadata must be ASCII. `JSON.stringify` also escapes lone
  surrogates, on which `encodeURIComponent` alone throws.
- **A blob without a usable summary is read in full** (missing, not encoded, not JSON or failing
  the schema, e.g. from an older version). Listing never rewrites metadata; the next save does.
  There is no version key: an outdated summary simply fails validation. A corrupt inspection
  reached this way makes the list a logged 500 naming the blob, as for templates.
- **List order:** year, then sequence, both descending and parsed from the number (FI-2026-10000
  before FI-2026-0010), then id; a number that doesn't parse goes last.
- **Numbering (`config/inspection-counter.json`):** the counter is written conditionally on the
  version just read. Losing the race (412 or 409) means read again: up to 5 retries after the
  first attempt, with random waits of at most 100, 200, 400, 800 and 1600 ms, then 503 "Too many
  inspections are being created at once. Try again." An unreadable counter is a 500, never a
  silent restart at 0001. The year is Swedish time.
- **A missing counter is seeded from the highest number in use** (the list's one blob listing),
  then created with `ifNoneMatch '*'`, so a counter blob lost to a manual delete, a cleared
  container or a migration without `config/` never hands out a number again. Without inspections
  (a first run) it starts at 0001; a seed from an earlier year starts the new year at 0001. A
  corrupt inspection met on the way makes the create a 500, as for the list.
- **The counter never goes back a year.** If it already holds a later year than this instance's
  clock (skew at New Year), it keeps counting in that year; restarting the earlier year would
  hand out numbers again.
- **The number is taken last,** after the body, the template and its published revision are
  checked, so a refused create never uses one up. A failed write after that skips the number:
  numbers are unique, not gapless.
- **Create** answers 404 for an unknown template (also one whose draft is missing, as in
  phase 2) and 409 "Publish the template first." when it has no published revision. It does not
  touch the table: a new inspection has no deviations.
- **The template list carries the published revision's name and model** (`publishedName`,
  `publishedModelCode`, additive to `TemplateSummary`): the new-inspection picker and form show
  what the inspection will copy, not a draft change an admin hasn't published yet. The template
  list (phase 2) still shows the draft's.
- **The machine photo defaults to the revision's cover photo** when the create request has none
  (images never change, so sharing the id is safe). A save without `photoId` removes the photo,
  as `coverImageId` does on templates.
- **Save check order:** a malformed body (400), unknown inspection (404), outdated `If-Match`
  (412), finalised (409 "This inspection is finalised – an admin must reopen it."), then the id
  checks (400). The id checks need the stored snapshot, so an outdated page always sees the
  conflict first.
- **Results must be keyed by rows of the snapshot; extra deviation ids must be unique and never
  equal a row id,** because both become RowKeys in the table. The errors name the ids.
- **Fields a client may not set are ignored, not refused:** zod strips unknown keys, and number,
  snapshot, revision, model, state and audit fields always come from the stored inspection.
- **Finalise and Reopen also set `updatedAt/By`** (the blob changes); `finalisedAt` equals that
  `updatedAt`. Asking for the state the inspection is already in syncs the table again and
  answers 200 with the stored body and ETag; it still needs the current `If-Match` (412 first, as
  everywhere).
- **Five new registrations, 13 in all:** `functions/inspections.ts` (list, create, read, save),
  `functions/inspection-state.ts` (finalise, reopen) and one for the Resp autocomplete (removed
  again with the Settings lists).
- **`writeJson` takes optional blob metadata;** existing callers are unchanged.
- **API tests:** `resetStorage()` also clears inspections, the counter and every deviation row,
  row by row (deleting the table would defeat `ensureTable`'s once-per-process memo).
  `sampleInspection()` builds a valid inspection.

### Deviation table

- **Each write makes the table equal `deriveDeviations(inspection)`:** one range query reads the
  inspection's rows (RowKeys from `{id}_` up to, not including, ``{id}` ``: the backtick is the
  character after the underscore; built with the SDK's `odata` template), all the columns (17
  then, 18 since the category) are compared, and only new or changed rows are written (upsert,
  Replace) and vanished ones deleted. Unchanged saves write nothing; most autosaves touch zero or
  one row.
- **Batches of at most 100 actions in the model's partition, upserts before deletes.** Each batch
  is atomic; a sync over 100 changes that fails part-way leaves the earlier batches applied until
  the retry or next write, which converges because the sync is idempotent.
- **Order:** a save writes the blob first (the truth), then the table; a table failure is logged
  (`context.warn`) and the save still answers 200. Finalise and Reopen write the table first (its
  `finalised` flag decides what the KPIs count), then the blob; a table failure is logged
  (`context.error`) and answers 503 "The deviation records could not be updated, so nothing was
  changed. Try again."
- **Beyond the contract:** if the blob write of a finalise or reopen fails after the table was
  updated (a 412 race or any other error), the table is synced again from the stored blob, best
  effort, before the error is returned. Otherwise the table could claim `finalised = true` for an
  inspection in progress.
- **Every write re-checks the blob after syncing (`syncSettled`).** Nothing orders two writers'
  syncs: a save whose table update was slow (SDK retries, throttling) could land after a newer
  save's, or after a finalise, and leave a stale row or `finalised = false` for a finalised
  inspection, which no later save would repair (finalised inspections take no saves). So after
  its sync each writer reads the blob again and, if the ETag moved on, syncs from the latest
  version, up to 3 more rounds (then `context.warn`). Finalise and Reopen also sync once more
  after their blob write, best effort: a save's sync can land between their table-first sync and
  their write. Costs one blob read per save. Conditional entity ETags alone would not do: a sync
  that starts after the other writer's reads current ETags and overwrites with stale data.
- **The table has its own `ensureTable()` memo,** apart from the containers' `ensureStorage()`.
  With one memo for both, a table outage on a fresh instance failed every blob request (saves,
  lists, image URLs) with a 500, so "the save still succeeds" held on warm instances only. Only
  the sync and the Resp autocomplete needed the table then (Insights reads it since phase 6; the
  autocomplete went with the Settings lists).
- **`createdAt` is the time of the sync that first wrote the row,** as an ISO string, kept on
  later saves, so KPIs over time don't move with every edit.
- **Column types:** `templateRevision` a number, `finalised` a boolean, `inspectionDate`
  (YYYY-MM-DD) and `createdAt` (ISO, UTC) strings; both sort correctly as text for range
  filters.
- **`resp` is stored untrimmed,** mirroring `deriveDeviations`. Only the autocomplete trimmed.
- **The Resp autocomplete** filtered on the server (`resp ne ''`) and selected only `resp`. Values
  were trimmed; spellings differing only in case counted as one name, offered in the spelling most
  rows use (the first found on a tie), sorted with a Swedish collation; at most 500, after
  sorting. (Removed with the Settings lists: Responsible is picked from a list in Settings.)

### Checklist sheet

- **Keys on a focused row:** `1`/`O` OK, `2`/`N` NOK, `3`/`A` N/A, `0`/`Backspace`/`Delete`
  clear, `R` the rest of the row's section OK, `↓`/`J` and `↑`/`K` move (across sections),
  `Home`/`End` first and last, `C` comment, `G` the guide note. Space does nothing: it would
  scroll the page a screen and the next key would change a row out of view. Ctrl, Alt and Meta
  combinations are always the browser's; Shift still counts for character keys (digits need it
  on some layouts) but Shift with a named key is the browser's.
- **OK and N/A by key move to the next row; NOK stays** so the comment follows at once. On the
  last row the focus stays.
- **A held key repeats moves only.** Setting or clearing a status takes a press per row, so a key
  held a little too long never marks a run of rows.
- **Clearing** (a key, or clicking the selected segment again) also drops the severity; comment
  and resp stay. A row left with nothing is removed from `results` rather than stored as `{}`.
- **Severity shows "Minor" but is stored only once picked;** `deriveDeviations` already defaults
  to minor.
- **Tab order: row → comment → resp → severity (NOK rows) → next row.** Severity comes last so the
  common NOK flow (2, C, comment, Tab, resp, Enter) never passes it, and it is drawn on the line
  below, under the status, so the visual order matches. Status segments and the guide icon are
  not tab stops.
- **Enter in the comment or resp moves to the next row** (at the end of the checklist, back to
  the row); a select keeps Enter. Escape in any field returns to the row. Keys typed in a field
  are never shortcuts.
- **Every row is `tabIndex` 0 (not a roving tab index),** so native Tab and Shift+Tab give the
  order above without custom handling, across sections too.
- **Set remaining to OK** fills only rows without a status, in one change, without a
  confirmation. **It is not a Tab stop (`tabIndex` -1); `R` on a row does the same** and keeps
  the focus on the row. As a Tab stop between sections it caught the Tab after a section's last
  field: status keys typed there were lost, and Enter (the hint bar's "Next row") filled the
  whole next section. `R` is free (Shift+O is already OK, digits need Shift on some layouts) and,
  like the status keys, takes a press per row. The button stays clickable and focusable by click
  when nothing is left (`aria-disabled`); its accessible name includes the count.
- **The Resp autocomplete used the browser's `<datalist>`,** one per sheet. In Chrome its popup
  took the first Enter (pick) or Escape (close); the next press reached the sheet. (Superseded by
  the Settings lists: Responsible is a select of the list in Settings, see Deviations there.)
- **Layout by the sheet's own width (container queries):** from 56rem one line per row in the
  print's column order; from 34rem the checkpoint above Comment | Status | Resp; narrower, stacked.
  Controls are 44 px on touch screens and narrow sheets, 32 px with a mouse on a wide sheet; the
  guide icon too.
- **Resp is 10rem wide** (the integrator widened it from 8rem): "El-avdelningen" was cut off in
  its input on desktop and tablet.
- **Fields are underlined, not boxed;** 180 boxes were heavy, and lines read like the paper's
  writing lines. The focused field gets the full box and ring. On wide sheets the column labels
  replace the placeholders.
- **Scrolling:** moving the focus scrolls by the smallest amount (`scrollIntoView` 'nearest';
  plain `focus()` centres the row in Chrome), with about one row of look-ahead below
  (`scroll-margin-bottom`). The page keeps rows clear of its sticky header.
- **Never colour only:** statuses are symbol + text; a NOK row has a red bar and its pressed
  "✗ NOK" segment; the selected segment's ring is at 80 % strength (60 % was under 3:1). The focus
  ring is drawn inside the row and overrides the red problem outline.
- **The row's ring and tint follow `:focus`, not `:focus-visible`.** The focused row is where the
  next key goes, and it is often focused after a click (a status segment, Continue, a jump
  link), when Chrome doesn't count the focus as visible. Clicks in a row's fields focus the
  fields, not the row, so this marks only the row the keys act on.
- **Screen readers:** each row is a labelled group ("Row 3.c …") described by its status; one
  polite live region announces "3.c NOK" and "Section 2: 13 rows set to OK"; section titles are
  headings with a hidden "Section N:".
- **The guide icon** (camera with photos, info without) and `G` show "Guide viewer arrives in
  phase 5." (Superseded in phase 5: they open the guide viewer, see Guides.)
- **Read-only (finalised) is separate, simpler markup** with the same grid; rows stay focusable
  from script for jump links. (Superseded by the UI pass: it has a tighter grid of its own.)
- **Performance:** rows and sections are memoised and the actions object is stable, so a change
  re-renders one row and its section. Measured in a production build on 180 rows: 1.9 ms of
  script per status key (p95 2.6 ms).
- **`SEVERITY_LABELS` (Minor, Major, Critical) lives in `checklist/status.ts`;** the Deviation
  Summary reuses it. A candidate for shared. (Superseded in phase 4: it moved to
  `@modig/shared`, where print and the Word export use it too.)

### Inspection pages

- **Tabs, not a side panel:** "Checklist | Deviations (n)". A side panel would squeeze the sheet
  below its one-line layout on most screens; the tabs sit in the sticky header, so the live count
  is always in view. (Since the UI pass the header sticks only on screens at least 40rem wide and
  tall.)
- **The front page is the top of the Checklist tab** (brief: "Front page card at the top"), so a
  front-page problem jumps there.
- **The sticky header's height is measured** and set as the page's `scroll-padding-top`; a fixed
  value broke when a long machine name or a narrow window wrapped the header.
- **Each tab keeps its scroll position;** jump links switch the tab at once, then focus and centre
  their target. **Continue at 3.b** focuses the first row without a status, so transcription
  resumes without tabbing through the front page.
- **Opening an inspection focuses Continue at 3.b** (when there is a row without a status;
  otherwise the focus stays where it was), so one Enter resumes transcribing; before, the focus
  was on the page and the first status keys did nothing. No page-level shortcut keys (Alt+1…):
  Ctrl/Alt/Meta combinations stay the browser's (AltGr on Swedish layouts, tab switching).
- **Print is shown disabled** but focusable, with "Print / Save PDF: coming in phase 4".
  (Superseded in phase 4: it opens the Blank checklist / Report menu, see Print.)
- **The save status is hidden on a finalised inspection** unless something is still unsaved.
- **List filters live in the address** (`?q=&model=&state=`, replacing the history entry) and are
  applied at once (`flushSync`): as a router transition, fast typing kept only the first letter
  and a quick second change undid the first.
- **The pages' own way back to the list keeps its filters:** the list remembers its search in
  `sessionStorage` (per tab), and "← Inspections" and Cancel on the inspection and new-inspection
  pages go to it, as the browser's Back does. The sidebar's Inspections is the plain list.
- **Search** is case-insensitive (Swedish), every word must appear in the number, machine or serial
  number, and å/ä/ö are not folded (they are letters of their own in Swedish). The model filter
  offers the models that have inspections, plus one from a shared link.
- **New inspection is one page,** not a wizard: checklist radios (published templates only; a
  single one is preselected), then the front page. It is checked with the shared create schema;
  errors show after the first attempt and the first bad field gets the focus.
- **The template's cover photo is shown as the default photo;** without a photo of its own the
  request omits it and the server applies the cover. You can't create without a photo when the
  template has one; remove it on the inspection afterwards.
- **Create waits for a photo upload and has no client timeout** (SWA's gateway ends a hung
  request at 45 s), so a slow create that went through is never repeated. Saves, finalise and
  reopen keep phase 2's 30 s timeout.
- **Location defaults to the settings' default** (even if an admin emptied it), the brief's
  "Kalmar, Sweden" only when the settings can't load; the date to today's local date (not UTC). The
  date field passes on only complete dates and shows the last valid one again when left.
- **Participants are chips:** Enter, a comma, a semicolon or a line break adds a name (a pasted
  list splits); leaving the field adds what was typed; duplicates (ignoring case) are skipped;
  each name is cut at 200 characters. **A name typed but not yet added counts as unsaved** on the
  inspection page: the header says "Unsaved changes", closing the tab warns, and saving before
  a link, Back or Finalise adds it first.
- **The model is read-only text** on the front page: it comes from the template and never changes.
  A finalised front page is a definition list with "—" for empty fields.
- **Deviation Summary:** a table (scrolls sideways on phones). Row deviations are read-only there;
  their ref jumps to the row. Extra deviations are edited in place (Enter never adds a line
  break); removing one asks only if something was typed, then focus goes to **Add extra
  deviation**. A new extra deviation gets the focus in its description. Ids are `newId()`.
  (Superseded in phase 4: a card per deviation instead of a table, see Deviation cards on the
  inspection page; the rest still holds.)
- **The Resp autocomplete offered** the history merged with this inspection's own values,
  trimmed, de-duplicated ignoring case and sorted (Swedish). **This inspection's values were taken
  when a Resp field was left**, not as they were typed: otherwise the half-typed text was offered
  to its own field, first (a prefix sorts before its completion), and ↓ Enter stored "El" instead
  of "El-avdelningen", or a value one keystroke old. (Removed with the Settings lists.)
- **Finalise checks locally first** and lists problems without saving; after an attempt they stay
  marked and update as you type, with a **Show problems** callout. The confirmation names the
  number, rows and deviations, then saves pending changes (waiting for a photo upload) and
  finalises the version on screen.
- **Finalise and Reopen outcomes:** problems from the server (400) are listed the same way; 503
  shows "Finalise didn't complete – try again." with **Try again**; after a 412, a network error, a
  timeout or another 5xx the page reads the inspection again and counts it as done if it is in the
  wanted state with this content (a lost answer), otherwise a 412 shows the conflict.
- **Focus:** after Finalise or Reopen the notice takes the focus (the button it came from is
  swapped), the title after the notice is dismissed; the dialog's busy button is `aria-disabled`.
- **Inspectors never see Reopen;** the API refuses them as well (403).
- **Shared pieces moved:** the autosave scheduler, its hook, the leave guard and the save status
  went from `features/templates` to `app/src/lib/autosave/` (tests unchanged and green);
  `errorMessage`, `isMissing` and `isConflict` to `lib/api.ts`. Templates changed only imports.
- **Both editors share their chrome** (review): `lib/autosave/useUploadTracking` (a photo upload
  counts as unsaved), `AutosaveAlerts` (conflict and "Couldn't save" callouts), `useReload` and
  `LeaveDialog`. `components/PhotoField` is the template's cover photo and the inspection's
  machine photo, labels from the caller. `BackLink`, `Callout` and `ConfirmDialog` moved to
  `components/`, so inspection pages don't import the template editor (whose module pulls in
  dnd-kit). `FinaliseIssueSchema` and `PublishIssueSchema` are zod schemas in shared, the types
  inferred from them (additive), so the app's parsers can't drift from the server's issues.
- **Autosave retries at once when the browser comes back online,** instead of after its backoff
  (up to 30 s).
- **A busy dialog uses `closedby="none"`.** Chrome lets a page refuse only one Escape per user
  activation; the second closed the busy Finalise dialog while the request ran, and edits made
  then either made Finalise fail as "someone else changed this" or showed unsaved text on the
  locked page. `close()` from script still works.
- **Performance:** the front page card, the Deviation Summary (whose deviations keep their
  identity while unchanged) and the header parts are memoised, the hint bar is a constant
  element. Production build: 1.5 ms of main-thread work per status key, 5.0 ms per comment
  keystroke.
- **Every visit loads the inspection afresh** (`gcTime` 0) and Reload remounts the page, as in
  phase 2.

### Tests and tooling

- **`e2e/inspections.spec.ts`: ten tests.** Each gets its own throwaway template, published as
  revision 1 with model `E2E`, and deletes it and its inspections, with their deviation rows,
  afterwards. Inspections are created through the API with the test's own sign-in, except in the
  test of the create form. Tests run in parallel and never depend on the seeded RigiMill MG.
- **The deviation table is checked in Azurite itself** (`e2e/support/storage.ts`): no endpoint
  exposes the rows. It uses `@azure/data-tables`, listed in the root `package.json` next to
  `@azure/storage-blob`.
- **The keyboard test uses key presses only** once the page has opened (on Continue), and checks
  the stored results exactly, so a shortcut leaking from a text field would fail it.
- **Review tests:** a Tab from a section's last field reaches the next section's row, `R`, the
  ring on a row focused by a click, the Resp autocomplete while typing (since removed), an
  unsaved participant (Back saves it, closing warns), the list's filters after "← Inspections", a
  finalise whose answer is lost, a 503 with Try again, and Escape twice on the busy Finalise
  dialog; in the API, three slow-sync races (save vs save, save vs finalise either side of its
  blob write), a lost counter, a table outage on a fresh instance, and a draft whose model differs
  from its published one.
- **The SWA CLI starts with a trimmed environment (`scripts/swa-start.mjs`).** A page load in dev
  took about 6 s through it but 0.6 s straight from Vite. Profiling showed why: SWA CLI 2.0.10
  copies the whole of `process.env` about a hundred times per request (its logger reads the
  environment again for every debug line, even with debug output off), so with the ~190
  variables of this shell each proxied module cost about 35 ms of CPU. The launcher deletes every
  variable not on an allow-list (path, home and temp folders, the Windows shell, locale,
  terminal, proxies, `NODE_*`, `SWA_*`, `DEBUG`, `NO_UPDATE_NOTIFIER`), then runs the CLI's own
  `swa` bin in the same process as `swa start`, plus any arguments given (e.g.
  `--verbose=silly`): no extra process, so Ctrl+C and Playwright's shutdown work as before. A
  missing variable the CLI turns out to need goes on the allow-list.
- **Vite listens on `127.0.0.1` and the CLI proxies to `http://127.0.0.1:5173`.** For a `localhost`
  dev server URL the CLI runs `wait-on` against it before proxying every request (about 30 ms
  each here); phase 1 already did the same for the API URL. A fixed address also avoids
  `localhost` resolving to `::1` first on some machines.
- **Measured:** a cold page load through port 4280 went from 5.5–6 s to 1.1–1.4 s; HMR still
  connects through the CLI; 40 parallel cold loads started the app every time with no empty
  module (phase 2's keep-alive race). The whole e2e suite (35 tests, 2 workers, fresh stack)
  went from 4.2 to 1.6 minutes, and ran three times in a row without a failure or a retry.
- **The finalise test loads the admin's page while the inspector's loads,** and the conflict test
  loads both inspectors' pages at once: page loads remain the slowest step of a test.
- **Existing specs needed no change:** none relied on the inspections placeholder.
- **The production build was checked by hand** (built app and `api/deploy` behind `swa start`
  with the local config copy): creating with a photo, filling in, finalising and a deep link, with
  no CSP violations and no console errors. As in phase 2, that is not part of the suite.

## Phase 4 – Print and deviation photos

### Worth reviewing first

The calls with product, data or paper impact. Each is explained in its section below.

- **The annotation editor came forward from phase 5**, at the user's request ("pictures with
  arrows and annotations … possible to print … 4 deviations per page or 2"). It is used for
  deviation photos now; phase 5 reuses it for guide images (Contract).
- At most **2 photos per deviation** (Contract).
- The report's deviations print as **cards with their photos**, 2 or 4 to a page, chosen in the
  print toolbar (and the address); **2 is the default, chosen by the user** after comparing the
  two sample reports. The sample PDFs compare both: one photo
  prints at 103 × 77 mm with 2 per page, 68 × 51 mm with 4; labels at about 12 pt and 8 pt (Print).
  (Superseded by UI pass, review fixes: 4 is the default when no deviation has a photo.)
- **4 per page is four stacked rows** (text left, photos right), not a 2 × 2 grid (Print).
- **A page holds fewer cards when their text doesn't fit.** The cards are measured in the browser
  before they are put on pages; a card is never split, and no text is cut (Print). (Phase 5: a
  card whose text alone is longer than a page runs on, its photos whole; see Print carry-overs.)
- **The blank checklist keeps the handwritten Deviation Summary table** (D-01 to D-15), as the
  brief has it; only the report has cards (Print).
- **Flattened copies are JPEG images with their own id** (`renderedImageId`), not
  `images/{id}.annotated.png`, so they use the existing upload and read URLs: no API change
  (Contract).
- Cancelled, removed and replaced photos stay in storage, like replaced cover photos (Annotation
  editor).
- A row's photos stay when it stops being NOK, but count and print only while it is NOK (Deviation
  cards).
- Browser Back while the photo editor has unsaved marks discards them without asking; only closing
  or reloading the tab warns (open, see Deviation cards). (Resolved in phase 5: leaving asks
  first.)
- Page numbers ("Page X of Y") need Chrome or Edge; Firefox and Safari print the footer text at the
  foot of each table only (Print).

### Contract (shared)

- **`AnnotatedImage = { imageId, caption?, annotations, renderedImageId? }`** on
  `RowResult.photos` and `ExtraDeviation.photos`, at most `MAX_PHOTOS_PER_DEVIATION` (2); the
  unused `photoIds` is gone. `deriveDeviations` returns `photos` (always an array). `GuideImage`
  extends `AnnotatedImage` with `verdict`, so phase 5 guides reuse the type and the editor.
- **Coordinates are fractions (0–1) of the photo's width and height** (brief §4); a label's `size`
  is a fraction of the photo's height. `ANNOTATION_COLORS`: red `#E02424`, cyan `#29ABE2` (Modig),
  yellow `#FACC15`, white `#FFFFFF`.
- **The flattened copy is an ordinary image** (`images/{id}.jpg`) whose id is `renderedImageId`.
  It goes through `/api/images/upload-url` and the read URL, which already serve JPEG.
  `blobNames.annotatedImage` (the brief's `.annotated.png`) is removed as unused.
- **No API change:** photos travel inside the inspection's PUT and are validated by its schema.
  The deviations table carries no photos.

### Annotation editor

- **Konva only where photos are edited.** `AnnotatedPhotos` lazy-loads the editor and fetches it
  in the background when the photos are editable. The editor uses react-konva's core entry plus
  only its shapes: a 314 kB chunk (98 kB gzip), none of it in the main chunk. A cold Vite cache
  pre-bundles Konva at startup (its scan follows the dynamic import), so the dev server needs no
  `optimizeDeps` entry.
- **The editor's logic is a pure reducer** (marks with undo/redo, tool, colour, selection, the
  label being typed), unit-tested in node; the canvas only turns gestures into actions.
- **Selection belongs to the Select tool.** Drawing never selects the new mark; picking a colour
  sets it for the next mark and recolours a selected one (one undo step). Selecting each new mark
  made "pick a colour for the next mark" recolour the previous one.
- **It opens with the Arrow tool in red**, the most common mark.
- **Undo and redo keep the last 100 steps** of the marks; the caption has its field's own undo.
- **Marks are stored rounded to 4 decimals and kept on the photo.** Boxes drawn in any direction
  get a positive size; a press that moves under 6 screen px draws nothing (an arrow needs 12);
  freehand keeps a point every 2 px or more; a moved mark stays on the photo (a label by its
  top-left corner).
- **Sizes follow the photo's long edge:** lines 0.65 %, arrow heads 4.5 × 4 lines, labels 4 % in
  bold Inter. A soft dark shadow behind lines and a 70 % black outline round labels keep every
  colour readable on busy photos and in black and white. (Phase 5: yellow and white lines still
  faded on light machine paint in black and white, and now have a dark outline too.)
- **The flattened copy** is drawn on an off-screen Konva stage from the same shape settings as the
  screen, at the stored photo's size (at most 1600 px), and saved as JPEG at quality 0.9 (photos
  use 0.8: JPEG blurs thin lines first) with `canvas.toBlob` (not `fetch(dataURL)`, which the CSP's
  `connect-src` refuses). It is uploaded as it is (`uploadJpeg`; `lib/images` only offers an upload
  that scales and re-encodes).
- **A copy is made only when the marks changed** (or never had one). A caption-only edit keeps it;
  removing every mark drops it, and print uses the photo itself.
- **A new photo opens in the editor at once** from a local copy while the scaled original uploads.
  A failed upload is reported at once and Save tries again; Save waits for an upload still running;
  Cancel drops a new photo (its blob stays). (Review: a file the browser can't draw, such as HEIC
  in Chrome or an SVG, is refused before the editor opens, since it could never be saved; a
  transparent PNG is drawn on white in the editor and in the flattened copy, as in the stored
  photo, where it had turned black.)
- **An upload that hangs gives up** (review): the upload URL after 30 s, like saves, the photo's
  PUT after 60 s, so a stalled request on workshop Wi-Fi becomes a failure that Save retries,
  never an endless "Saving…". While saving, **Cancel and Escape stop the save** and keep the editor
  open with its marks and "Saving was stopped"; a new photo's own upload goes on meanwhile. Each
  attempt gets a new image id, so stopping or retrying never overwrites anything.
- **Every image the feature loads asks for CORS** (`crossOrigin="anonymous"`, thumbnails and
  viewer too), so the browser cache never holds a response that would taint the canvas.
- **Thumbnails are 160 × 120 and show the whole photo** (contain, on white), so marks near an edge
  are never cropped; the caption sits underneath. The remove button is always visible (touch) and
  asks first. Focus goes to the new thumbnail after adding, to Add photo after removing.
- **`accept="image/*"` without `capture`:** a tablet offers its camera and its photo library. Paste
  works while the component's buttons have the focus, drop on its area; only the first image is
  used, pasted text is ignored, and a non-image or a drop when full says why. Removing a photo
  clears a "full" message (review).
- **Read-only** (no `onChange`): a thumbnail opens a simple viewer of the flattened copy, without
  Konva; with no photos the component renders nothing (the card says "No photos"). The hidden file
  input is rendered only while editable (integrator).
- **Undo, Redo and Delete mark are `aria-disabled`, not disabled** (review): they turn themselves
  off when clicked (the bin always does), and a disabled button that had the focus dropped it to
  the page, out of the dialog, and Ctrl+Z, Delete and Escape stopped working. The same rule as the
  app's other buttons that switch themselves off.
- **A colour picked while typing a label is the label's** (review): the colour buttons don't take
  the focus on press (`mousedown` default prevented), so the label stays open and the reducer
  recolours it; before, the press ended the label in its old colour while the toolbar showed the
  new one. The tool buttons still end a label. Keyboard users who Tab from the label to a colour
  still end it first.
- **Marks are drawn and edited with a pointer only** (review: recorded): the canvas is no Tab
  stop, and there is no keyboard way to select, move or edit a mark; the keyboard has the tools,
  colours, Undo/Redo, Delete for a selected mark, the caption, Save and Cancel. Not asked for by
  the brief; photos come from a camera and are marked by hand.
- **The first opening returns the focus too** (review): the "Opening the photo editor" dialog
  shown while the editor's code loads is closed before React removes it (a layout effect's
  cleanup), so the focus goes back to the button that opened the editor instead of the page.
- **Escape is handled by the editor** (`closedby="none"`): Chrome lets a page refuse only one
  Escape per click. It asks before discarding changed marks or caption; in a label it ends the
  label only. Keys never reach the page behind (a checklist row would take "1" as OK). The dialog
  focuses itself, not its first tool, whose focus ring looked like a second selected tool. A
  caption's surrounding spaces don't count as a change (a guide image's caption is trimmed only
  when the guide is saved).
- **Closing or reloading the tab with unsaved marks warns** (`beforeunload`).
- **Labels are one line of at most 200 characters;** Enter or leaving the field keeps it, an empty
  one is removed, a double-click (Select tool) edits it.
- **Touch and pen:** lines are hit-tested at least 24 px wide, the canvas has `touch-action: none`
  and captures the pointer, a pen's side buttons are ignored. Toolbar buttons are 44 px for
  fingers, 36 px with a mouse; a one-line hint under the photo says how the tool is used.

### Deviation cards on the inspection page

- **The Deviations tab is a list of cards:** D-nn, the ref as a link back to the row, the section,
  and the severity (or Remove on an editable extra deviation) on top; the text on the left, the
  photos on the right once the card is 46rem wide (container query), stacked below that.
- **A row deviation's comment, Resp and severity are still edited in its row;** the card shows
  them. An extra deviation is edited on its card with visible labels, in the old Tab order
  (Description, Comment, Severity, Resp); its accessible names keep the number ("Description,
  D-04").
- **Severity is always a word:** Minor grey, Major outlined red, Critical filled red.
- **Photos are stored** in the row's result (`withPhotos`) or the extra deviation; an empty list is
  left out. They reach the page only once the photo and its copy have uploaded, so they autosave
  like everything else with no upload tracking.
- **A row's photos stay when its status changes**, like its comment, so a NOK set to OK by mistake
  loses nothing; they count and print only while it is NOK.
- **The tab is rendered when first shown**, then kept: opening an inspection downloads no deviation
  photos. Jump links still work (the tab switch renders synchronously).
- **NOK rows show "Add photo" or "2 photos"** under Resp; a click opens the Deviations tab with the
  focus on the card's first photo button. It is not a Tab stop (transcribing is unchanged) and
  there is no key for it: photos come from a camera, not from the paper. Screen readers hear the
  count with the row's status. Read-only rows show it only when there are photos.
- **A file dropped beside a photo area is ignored** instead of the browser opening the image in
  place of the app (window-level `dragover`/`drop` of files, once the tab has been shown).
- **Removing an extra deviation asks first** if it has text or photos, and says how many photos go.
- **Open:** browser Back while the editor has unsaved marks discards them; only closing or
  reloading the tab warns. Fixing it needs an "editing" callback from `AnnotatedPhotos` into the
  page's leave guard. (Resolved in phase 5 that way: leaving asks first.)

### Print

- **Print routes have no sidebar** (`PrintShell`), but wait for `/api/me` like the app shell.
- **Without `mode`, an inspection prints its report once finalised, else the blank checklist.**
  **Print / Save PDF** on the inspection saves pending changes first, then opens the route in a new
  tab with `autoprint=1`, which prints once everything is loaded and is then dropped from the
  address, so a reload doesn't print again.
- **Template preview:** admins see the draft ("Draft – Rev 3" on the front page, "(draft)" in the
  footer), inspectors the latest published revision, `?revision=n` any published one.
  (Superseded by UI pass, review fixes: the footer says "Draft – Rev 3" too, as does the editor's front-page card.)
- **The footer is one `@page` rule with both margin boxes**, added at runtime through the CSSOM to
  the app's own stylesheet: the production CSP (`style-src 'self'`) blocks inline styles but not
  CSSOM edits. The text is escaped as a CSS string (control characters become spaces).
- **Chromium is recognised by `navigator.userAgentData`** (only Chromium browsers have it). Others
  get the footer's left text as a repeating table footer, without page numbers; the card pages
  have none, their heading already names the inspection. (Review: the reference images appendix
  repeats it too, its entries as the rows of a table, each row a block that never splits; its
  heading doesn't repeat, so its later pages named nothing.)
- **A report of an inspection in progress** says "NOT FINALISED – DRAFT REPORT" on its front page
  and "Not finalised" in every footer, so no single page passes for the final report.
- **The PDF's file name** comes from the document title: "FI-2026-0042 RigiMill MG – Volvo Cars
  Skövde – Inspection report".
- **The front page is exactly one page** (a 265 mm column; the photo takes what the text leaves).
  Without a photo its frame stays, so every front page has the same layout. (Superseded by UI pass, review fixes: a report
  leaves the space blank; only blank and template forms keep a "Machine photo" frame.) The finaliser is
  printed as stored, by email. (Review: values far beyond the usual, such as names and locations
  near their 200 characters or twenty participants, used to push the signatures and Rev over the
  checklist's first page. The column is now at least a page, the photo gives way down to 20 mm,
  and beyond that the signatures and Rev start the next page together. Values are never cut.)
- **The No. column is 12.5 mm** (review; 10.5 before): a ref past z in a section past 9, such as
  "10.am", ran over its rule. The Checkpoint column gives the 2 mm, in print and in Word.
- **The footer names the machine by at most 60 characters** (review), "…" after that: a 200
  character name made the footer three lines, running into "Page X of Y" and toward the paper's
  edge. The front page has the whole name. The left box keeps 4 mm from the page number.
- **Checklist rows:** blank rows 9.5 mm (at least 9 mm to write in), report rows at least 7 mm. A
  status is an icon and its word in its column. **A NOK row's severity is a "Severity: Major" line
  at the top of its comment cell.** Spare lines print in blank mode only: in a report, findings
  that belong to no row are extra deviations.
- **Orphans:** the section title and column labels are the repeating table head, a section's first
  row keeps with the next and its last with the previous one, and no row is split. (Review,
  left as it is: a row whose comment alone is longer than a page, near the 2 000-character limit,
  moves to a new page and then runs on, so the page before may hold only the heading. No text is
  lost; Word has its own rule for this, see Word export.)
- **Right-aligned text stays 0.5 mm inside the margin:** Chrome's PDFs put the right content edge
  about 0.3 mm further out. (Superseded by UI pass, review fixes: the whole sheet's content keeps the inset, so box borders
  are not clipped either.)
- **Black and white:** light grey fills (`print-color-adjust: exact`, so they print without
  "Background graphics"), thin rules, words for statuses and severities; a critical card's badge
  is the one filled black.
- **Report cards:** "D-03 · 4.c · MAJOR" (an extra deviation: "Not on the checklist"), the section,
  checkpoint or description, comment, Resp ("—" when empty; "Responsible" since the UI pass), up to two photos as marked up with
  their captions, and a "Closed · Sign · Date" line. No photo: an empty "Sketch / photo" frame. A
  photo that can't be loaded says so in its place. No deviations: "No deviations recorded."
- **`deviationsPerPage` lives in the address only** (default 2); the toolbar's switch replaces the
  history entry. The inspection's Report menu opens 2 per page. (Superseded by UI pass, review fixes: the default is 4 when
  no deviation has a photo.)
- **2 per page never prints a photo under 50 mm** (review). With the 24 mm floor alone, a card
  with about 1 000 characters of text (or a neighbour with them) printed its photos at 24 mm,
  smaller than 4 per page prints them (the 4-per-page row puts text beside the photos). Measured
  in the card layout: the floor makes such a card take a page of its own, two cards without much
  text still share one, and a card with every field at the schema's limits grows to about 245 of
  the 253 mm a page has for cards. The empty "Sketch / photo" frame keeps 24 mm.
- **4 per page is four stacked rows,** text in a 74 mm column on the left, photos on the right.
  Measured against a 2 × 2 grid: a pair of photos prints at 50 × 37 mm each instead of 33 × 25 mm,
  where the labels became unreadable; rows also read top to bottom like everything else. The grid
  code is removed.
- **Each page of cards is a sheet of its own**, and its cards share it equally (flex); a card
  whose text needs more takes it from the others. Photos are positioned inside their slot, so
  their pixel size never makes a card taller; a photo is never smaller than 24 mm (50 mm with 2
  per page, see below), and captions
  are a row of their own under the photos (a long caption makes the card taller, never hides the
  photo). One photo takes the full width, two share it on a common caption line.
- **Cards are measured before they are put on pages (`useCardPages`, `packCards`).** They are laid
  out once, hidden, at their natural height in the chosen layout, after the fonts have loaded;
  then each page takes up to 2 or 4 of them while their heights fit (265 mm less the heading and
  the gaps of a full page). Why (integrator): with fixed groups of four, two long comments on one
  page pushed its fourth card onto an extra page of its own, without a heading, and the page's
  "D-01–D-04" was wrong. A flowing table with a repeating heading was tried and rejected: every
  card kept at least a quarter page, so any comment over about 200 characters pushed the next card
  on. A page with fewer cards keeps empty slots, so its cards keep their size. (Phase 5: the
  265 mm is one CSS custom property that the measuring reads, and a card taller than a page's
  room gets a page of its own without empty slots.)
- **Ready means everything is in:** the page first fetches every image's address, renders the
  document once, and sets `data-print-ready` after the images, the fonts and the card measuring;
  switching the mode or layout waits again. The Print button says "Preparing…" until then.
- **The deviation heading repeats on every page of cards** with its range ("FI-2026-0042 ·
  D-01–D-04"); screen readers hear it once.
- **The "Include reference images" appendix** (brief §6) is left to phase 5, with a marked place
  in `PrintDocument`. (Built in phase 5, see there.)
- **Chrome embeds the variable Inter font as Type 3 fonts** in its PDFs: sharp and searchable;
  `pdfinfo` warns about their bounding boxes. Left as it is.

### Tests and tooling

- **`e2e/print.spec.ts` prints real PDFs** with `page.pdf({ format: 'A4', preferCSSPageSize: true,
printBackground: true })` after `data-print-ready` and reads them with `pdfjs-dist`
  (`e2e/support/pdf.ts`): text with positions, and the images each page paints. Each PDF is kept in
  `test-results/`.
- **The print tests print a copy of the seeded checklist** (its published revision, as a
  throwaway template with model E2E), so a local edit to the seeded template never changes a page
  count. The smoke test uses the seeded template itself, as brief §9 says.
- **Page counts are ranges:** the lower bound from geometry (e.g. 108 blank rows × 9 mm need at
  least 4 pages of 267 mm), the upper bound one page over the measured count (blank 7, report 10
  and 8, template preview with 5 spare lines 8).
- **Rows are checked by text:** each ref is on exactly one checklist page, in order, and that page
  holds the row's whole checkpoint (whitespace removed). Every section title on a page has a row of
  its section below it; no text ends past page width − 12 mm (measured: 12.2 mm); blank refs are at
  least 9 mm apart (measured 9.26).
- **Cards:** the reports' data fits 2 and 4 per page with at least 30 mm to spare, so the layout
  is exact; a separate test with three 780-character comments expects D-01 and D-02 on one page and
  D-03 to D-05 on the next (measured 214 mm of 244 for two cards, 319 for three). Each page paints
  exactly its cards' photos; the DOM shows the marked-up copy where there is one.
- **Test photos are drawn by the browser** (a generated scene, screenshotted as JPEG): no image
  files in the repository, and no red in them, so the annotation test can find its red arrow in
  the flattened copy (decoded in the page). It drives the real editor with the mouse.
- **`deleteInspection` also deletes the deviation photos** (originals and copies); the machine
  photo stays, as it may be a template's cover.
- **The smoke test counts `window.print()`** in the new tab (stubbed) to check autoprint.
- **Mutation checks:** rows allowed to split, 8 mm blank rows, no footer, the original photo
  printed instead of the copy, cards grouped without measuring: each failed a test.
- **The sample PDFs and the 2-vs-4 comparison** were made outside the repository, from a
  finalised RigiMill MG inspection whose photos were marked up through the editor.

## Phase 5 – Guides, appendix and Word export

### Worth reviewing first

The calls with product, data or paper impact. Each is explained in its section below.

- **A new guide image starts as Info:** it claims nothing until an admin marks it Good or Bad
  (Guides).
- **A guide is edited in a dialog;** **Save** puts it into the draft, which then autosaves like
  any other change, and Cancel or Escape asks before discarding. A guide with neither a
  description nor images is no guide (Guides).
- **Guides reach inspectors with the next published revision,** and an inspection keeps the
  guides it was created with, like the rest of its checklist (Guides).
- **Leaving a page while an editor dialog has unsaved changes now asks first** (photo marks, a
  guide); in phase 4 Back discarded them silently (Annotation editor).
- **Yellow and white lines get a thin dark outline** on screen and in the flattened copy, so they
  print on black-and-white printers; red and cyan are unchanged (Annotation editor).
- **The appendix prints every image in the same 4:3 box,** two to a row at about 9 × 7 cm, three
  rows to a page; the verdict is an icon and its word (Print appendix).
- **Word lays out its own pages:** the export has the printout's structure and rules (header rows
  repeat, rows and deviation blocks never split) but the deviation blocks flow instead of 2 or 4
  to a page, and the text is Arial, not Inter (Word export).
- **The Word file is named like the PDF,** "… – Inspection report.docx" (or "– Blank checklist"),
  not as the contract's example without the suffix (Word export).
- **A deviation card whose text alone is longer than a page runs on** to the next page, its photos
  whole; every other card still prints whole (Print carry-overs).
- Guide images that are replaced, removed or cancelled stay in storage, like every other photo
  (Guides).
- After the phase 4–5 review: **2 per page never prints a photo under 50 mm** (a card with long
  text takes a page of its own); **extreme front-page values run on to a second page** instead of
  over the checklist (print), while Word shrinks the photo; **in Word a row or deviation block
  taller than a page may split** instead of being cut off; the No. column is 12.5 mm; Word drops
  control characters that would make the file unreadable (Print, Word export).

### Guides

- **No API or shared change.** The groundwork commit added `GUIDE_VERDICTS`,
  `GUIDE_VERDICT_LABELS` (Good, Bad, Info) and `MAX_GUIDE_IMAGES` (6) to shared; guides travel in
  the template's PUT, publishing freezes them, and an inspection's snapshot already copies them.
- **A guide's pictures are "images"** ("Reference images", "Add image", "Image 2 of 3"); a
  deviation's evidence stays "photos". `AnnotatedPhotos` takes the word (`noun`). Some texts
  inside the shared annotation editor still say "photo" ("Discard this photo?").
- **One editor, extended, not forked.** `AnnotatedPhotos` gained only optional props: `noun`,
  `layout: 'grid'`, `renderDetails` (what goes under a tile: a guide image's verdict and caption),
  `acceptAnywhere` and `onDirtyChange`; deviation cards look and behave as before. It stays
  non-generic: the guide editor puts each verdict back by `imageId` after every change
  (`withVerdicts`), since an edited image keeps its id and the annotation editor knows nothing of
  verdicts.
- **A new image is Info until marked Good or Bad.** The verdict picker is a native radio group
  (one Tab stop, arrow keys pick), styled like the status control; every verdict is a lucide
  icon, its word and a colour (ok, nok, n/a tones), never colour alone. Badges in the viewer use
  the same icons, words and colours.
- **Captions are edited inline under each tile;** it is the same field as the annotation editor's
  caption.
- **Paste and drop work anywhere in the guide editor** (`acceptAnywhere`), because it opens with
  the focus in the description. **Text pasted into a text field stays text** (review), even when
  the clipboard also holds a picture of it, as Excel and Word put there: the description pasted
  from the old workbook used to vanish and open the photo editor on a picture of the cells. Only
  plain text counts, since Chrome's "Copy image" puts HTML beside the image, which is still added. While an inner dialog is open, a dropped file is swallowed so the
  browser never opens it in place of the app. A refused paste or drop (six images, not an image)
  scrolls its message into view.
- **The saved guide is trimmed:** description and captions lose surrounding whitespace, empty ones
  are left out, and no description with no images removes `item.guide`. Keys come in the schema's
  order, because the draft's unpublished-changes check compares JSON: a different order after a
  publish made the next autosave a false 412 conflict.
- **Save without changes only closes** (no pointless draft save). **Remove guide** shows only on a
  row that has one, asks first and says that published revisions and inspections keep theirs.
- **Guide changes are not structural:** saving one doesn't end the Undo of a deleted row or
  section, and a deleted row with a guide comes back with it.
- **Ways in:** in the template editor the row's hover/focus action "Add guide, row 3.c" or "Edit
  guide, row 3.c" (on touch, the row's ⋯ menu); the row's guide icon opens the editor too, but is
  not a Tab stop there. No preview inside the editor and no reordering of images (both optional).
- **The viewer** opens from an inspection row's icon or `G` (in an editable row the icon is not a
  Tab stop: Tab stays row → comment → resp), from a finalised row (a Tab stop, as nothing else in
  the row is) and from the template's read-only and revision views (a Tab stop, 28 px with a mouse,
  40 px on touch). It is rendered once per sheet or document; rows ask through the existing
  stable actions objects, so they stay memoised.
- **Viewer keys:** ←/→/Home/End move between the images, Enter or a click shows one large. The
  photo viewer gained a `badge` slot and `browse` (←/→ and Previous/Next, `aria-disabled` at the
  ends so the focus is never dropped, "1 / 3"). Escape closes the large view, back on the image
  last shown, then the guide, back on the row, ready for the next key; keys never reach the
  checklist behind.
- **Nested dialogs act only on their own events.** React passes `close` and `cancel` up from inner
  `<dialog>`s, so the guide dialogs check `event.target === currentTarget`, and the guide editor
  takes Escape only from its own content.
- **Sizes:** the editor is at most 60rem wide, as tall as its content up to the window (the body
  scrolls); the viewer 64rem. Image grids fill the width with tiles of at least 11.5rem (editor)
  and 14rem (viewer).

### Annotation editor (phase 4 carry-overs)

- **Leaving asks while an editor dialog has unsaved changes.** The leave guard takes a third
  flag, `editorDirty`: such changes are not in the document yet, so nothing can save them; Back or a
  link asks "Leave without saving?" ("The open editor has changes that aren't saved yet."), and
  Leave then saves the rest of the page as any link does. Closing the tab warns too. An untouched
  new photo doesn't count, as with the editor's Cancel. The flag comes up through `onDirtyChange`:
  annotation editor → `AnnotatedPhotos` → deviation card and summary → inspection page, and guide
  editor (its own changes or its open photo editor) → template document → template editor. The
  guard arms in an effect after the change: a script that goes back within milliseconds of typing
  can slip through; a person can't.
- **The lazily loaded editor has an error boundary** (`EditorLoadBoundary`, around its Suspense, so
  it covers the guide editor too): "Couldn't open the editor" with Close and **Reload page**
  instead of the route's error screen, keeping the page and its unsaved work. There is no retry
  in the page, because a module import that failed stays failed until a reload. A crash inside the
  editor gets the same message.
- **Yellow and white lines have a dark outline:** a wider copy in black at 80 % under the line,
  0.35 × the line's width each side, arrow heads included, without shadow and not clickable, from
  the same shape settings in the editor and the flattened JPEG. Measured on a light panel, 7 px
  from the line's centre: 40–44 luma beside the line, against 248 for the surface. Red (36 %
  luma) and cyan (54 %) print dark enough and keep only their soft shadow; yellow (77 %) and white
  (100 %) vanished on light machine paint (80–90 %). Labels already had an outline.

### Print appendix

- **A pure model (`print/appendix.ts`)** lists the rows whose guides have images, in checklist
  order, with their images in rows of two and each caption's text; the print view
  (`ReferenceAppendix`) and the Word export both lay it out. Rows whose guide has only a
  description are skipped.
- **Every image sits in the same 4:3 box at half the width** (about 90 × 67 mm): never cropped, a
  portrait image letterboxed, standing on its caption. Rows stay even, about three to a page. The
  caption is the bold "3.c · ✓ Good" with the image's own caption on a muted line below.
- **A description keeps its line breaks** (review), on paper and in Word, as the guide viewer
  shows them: a numbered list was printed as one run-on line.
- **Page breaks:** a row's heading, description and first images are one block that never splits;
  so is every row of two and every image with its caption. Entries are divided by a thin rule.
  The appendix heading doesn't repeat on later pages, since every caption names its ref.
- **On paper the verdict symbol is drawn** (the same lucide icons as on screen), because the
  bundled Inter has no ✓ ✗ ⓘ and they would come from a system font. The PDF's text therefore
  reads "3.c · Good"; image alt texts and the Word export write the symbols as text.
- **The appendix's images load only while it is on.** Turning it on adds it to the preview
  without going back to the loading screen; Print says "Preparing…" and `data-print-ready` waits
  until its images are in.
- **The toggle is a checkbox after the layout switches,** kept in the address as `appendix=1`
  (replacing the history entry and dropping `autoprint`; a template preview keeps its
  `revision`). Without any reference images it is disabled with "No reference images in this
  checklist", and `appendix=1` prints nothing extra.
- **One set of verdict icons** (`guides/verdicts.ts`) for screen and paper (integrator: print had a
  copy of its own).

### Word export

- **One module, `features/export/`:** the toolbar's "Export to Word (.docx)" button sits in the
  main chunk and imports `exportWord.ts` only when clicked, which brings `docx` (a 445 kB chunk,
  129 kB gzip); the main chunk has none of it. `wordDocument(model, { appendix, images })` is a
  pure builder from the print model, tested in node: `Packer.toBuffer`, then the XML read with
  JSZip (docx's own dependency, not listed by the app).
- **The file is named like the printout:** its PDF name plus `.docx`, e.g. "FI-2026-0042 RigiMill
  MG – Volvo Skövde – Inspection report.docx" ("– Blank checklist", "– Draft report", "… –
  Checklist preview"), so a blank and a report export of one inspection don't collide. The
  characters Windows and macOS refuse (`\ / : * ? " < > |`) and control characters become `-`,
  spaces are collapsed, trailing dots and spaces go, 150 characters at most.
- **Text is made safe for XML first** (review): docx escapes markup but writes control characters
  as they are, and one of them (a line break pasted from Word, U+000B, is the usual one) made Word
  and LibreOffice refuse the whole file. Every string of the print model, so also the footer and
  the file's properties, loses the characters XML 1.0 forbids (vertical tab and form feed become
  spaces) at the start of the builder, which covers data already stored. The inputs are left as
  they are.
- **A long name is shortened before its kind** (review): over 150 characters, the machine part is
  cut with "…" and "– Blank checklist" or "– Inspection report" stays, so the two exports of an
  inspection with a 200-character machine name no longer get one name.
- **The logo gets a fresh read URL at export**, like the photos (review): the preview's could have
  expired, and Word then showed the company name instead.
- **It includes the appendix exactly when the preview shows it.** Its images are fetched through
  fresh read URLs (expired ones are renewed) with `cache: 'no-store'`: Chrome reused the preview's
  cached responses, loaded without CORS, and blocked the export's CORS fetch. An image that can't
  be loaded prints "The photo couldn't be loaded." in its place, as on paper. Format and size come
  from the JPEG or PNG header, not from decoding in the browser.
- **Arial 9 pt** (on every Word installation; LibreOffice uses the metric-compatible Liberation
  Sans), not Inter; ✓ ✗ ☐ ⓘ in Segoe UI Symbol, which Word itself uses for them. Print's greys
  and rule widths.
- **Word's own pagination with print's rules:** each section is a table whose two header rows
  repeat and keep with the next; the first row keeps with the second, the second-to-last with the
  last; rows never split. **Except a row or deviation block taller than a page** (review): Word
  hides what a non-splitting row can't fit on a page, and LibreOffice drew it over the footer, so
  the end of a long comment was lost. A row or block estimated at 200 mm or more (characters per
  line of Arial 9 pt in its column, 3.9 mm a line; a block adds its photos) may split, and its
  row keeps with nothing, so its section's heading isn't left alone on a page. A block's photos
  stay whole. Only text near the schema's limits gets there. Each deviation is a framed one-row table that never splits, and the
  blocks flow instead of 2 or 4 to a page. Photos: one up to 120 × 80 mm, two up to 85 × 64 mm;
  none gives a dashed 40 mm "Sketch / photo" frame; the Closed line uses underscore tab leaders.
  A critical deviation's severity is filled black with white text, as on paper; a reference image
  that can't be loaded keeps its 4:3 frame with "The image couldn't be loaded." (review).
  Appendix headings and descriptions keep with their first images.
- **The front page fits one page:** the machine photo at most 186 × 85 mm, the signature space
  15 mm (95 and 23 overflowed). (Review: the photo, or the 60 mm frame without one, gives up about
  4.5 mm for every line a front-page value takes beyond its first, down to 30 mm, so long values
  keep the signatures and Rev on page 1.) Its field rules are set per cell, because LibreOffice drops a
  table's own borders when some sides are "none"; without a photo a 60 mm frame.
- **The footer's size and colour are a paragraph style** ("Page footer"): LibreOffice renders
  field results (PAGE, NUMPAGES) in the paragraph style, not the run's formatting.
- **No Vite `optimizeDeps` entry for docx** (integrator). A dev server whose dependency cache was
  built before the export existed discovers `docx` at the first click and reloads the page once,
  losing that export; a fresh cache finds it by itself, and a lockfile change rebuilds the cache.
  Konva got the same treatment in phase 4.

### Print (phase 4 carry-overs)

- **A card taller than a page's room gets the page to itself** (R1): `useCardPages` now returns
  every card's height and the room per page; such a page has no empty slots, and the card is
  laid out full width (`data-wide`, the 2-per-page layout) even at 4 per page. Before, the slots'
  gaps pushed it on, printing an empty page or splitting it.
- **Only a card whose text alone is longer than a page runs on.** A `data-wide` card may break
  inside, but its photos and Closed line never do, and it starts at the top of its own page.
  Measured: every field at the schema's limits in ordinary text is 209 mm of 253 mm, so it fits;
  in capitals ("WMWM…") 338 mm, which now continues cleanly instead of leaving a page with the
  heading alone and splitting the photos. At 2 per page a lone card that fits keeps its empty
  slot below (phase 4 behaviour, left as it is).
- **One source for the content height** (R4): `--paper-content-height: 265mm` on the sheet is used
  by the front page, the card pages and the measuring page, and `useCardPages` measures the page
  box instead of a constant. `.paper-secondary` is gone; `ChecklistTable` uses `STATUS_ICONS`.
- **The toolbar keeps Export and Print together on the right,** also when it wraps.

### Tests and tooling

- **`e2e/guides.spec.ts`:** an admin writes a guide in the real editor (an image pasted while
  typing the description, one dropped on the dialog's heading, one marked with an arrow and a box,
  verdicts, captions trimmed), autosaved and the same after a reload; an inspection opens it
  read-only from the row's icon and `G` (arrow keys, the large view, Escape back to the row, keys
  kept from the row), keeps it after the template publishes a reworded guide (through the API),
  and a new inspection gets the new one.
- **Paste and drop in tests are real events:** an image put on the clipboard as PNG (the only image
  type the async clipboard API takes, with permissions granted) and Ctrl+V; drops dispatch
  dragenter, dragover and drop with a `DataTransfer` holding a `File`.
- **The appendix test holds the appendix's images back** (`page.route`) after turning it on, and
  checks that the page is not ready and Print says "Preparing…" once the fonts are in and two
  frames have passed, then lets them through. In the PDF every appendix page paints as many images
  as it has captions (no image parted from its caption), the captions come in checklist order,
  two to a line in the left and right halves, and every row heading has a caption of its row
  below it on its page. The marked-up image's original is never fetched.
- **The Word test downloads through the toolbar** in a Chromium of its own launched with
  `LC_ALL=C.UTF-8` (a fixture): on Linux, Chromium names a download "download" when the system
  locale can't write its name, as in this container's POSIX locale. It unzips the file with JSZip
  (as the unit tests do) and checks the file name, two repeating header rows per section, every
  checkpoint, the deviation, the reference images' captions with their symbols, the embedded
  images (logo and eight), and PAGE and NUMPAGES fields in the footer; then the blank checklist's
  file: D-01 to D-15, no appendix.
- **Phase 4 test gaps** (`e2e/annotate.spec.ts`): two photos remove Add, and a drop or paste then
  says why (a non-image drop in between proves each message is new); a photo added to an extra
  deviation in the UI is saved with its flattened copy; a finalised inspection's photo opens in the
  viewer without any request for the editor's code or Konva. The editable test shows the same
  pattern matching the editor's background prefetch, and a mutation (always prefetching) fails the
  finalised test. Shared: `ExtraDeviationSchema` takes two photos and refuses three; API: a PUT
  with three photos on a row or an extra deviation is a 400 with the zod path, and nothing is
  stored.
- **`deleteTemplate` also deletes guide images** (originals and copies); inspections share them
  through their snapshots, so they go with the template.
- **Leaving with an open editor and the editor's load failure are tested** (review;
  `annotate.spec.ts`, `guides.spec.ts`). The leave tests open the page from a list, so Back stays
  in the app, and wait two animation frames before Back, because the guard arms in an effect
  after the change (see Annotation editor carry-overs): no fixed wait. The load-failure test
  aborts the editor's code (`page.route`), adds a photo, and checks the message, Reload page,
  and that Close returns to Add photo with the typed description intact. Removing
  `onDirtyChange` fails the photo leave test. Keeping `useBlocker` on a ref updated during render,
  as the review first suggested, breaks the hooks lint rule and still let a Back sent in the same
  frame through, so the guard is unchanged.
- **Review fixes have tests that fail without them** (mutation-checked): the editor test with a
  stored photo (first opening returns the focus, the bin keeps it, a colour picked while typing a
  label, a hanging PUT held with `page.route` and stopped with Cancel), the transparent PNG's
  white corner in the flattened copy, the mixed text + picture paste, print with long front-page
  values and refs to 10.an, the 50 mm floor at 2 per page, the appendix footer without
  `navigator.userAgentData`; in node the Word builder (control characters, description line
  breaks, tall rows and blocks, the shrinking photo, the 12.5 mm column), upload timeouts and
  stopping, `pastesText`, guides in the unpublished-changes check, and the API's guide image cap
  and a guide frozen by publishing.

## Phase 6 – Insights

### Worth reviewing first

The calls with product or KPI impact. Each is explained in its section below.

- **First-pass rate = OK rows ÷ (OK + NOK rows)** of the inspections in the selection. N/A rows
  were not checked, so they count neither way. "On first inspection" is the status as recorded:
  the app has no re-inspection, and a NOK row stays NOK when the fault is fixed (Contract).
- **Deviations per machine is per inspection** in the selection: a machine inspected twice
  counts twice (Contract).
- **"% of inspections where it failed" divides by the inspections whose checklist had the row**,
  read from the published revisions they were made from, not by every inspection of the model: a
  row added in revision 5 is not diluted by inspections from revisions 1–4 (Contract).
- **"Current ref + text" comes from the template's latest published revision.** A row removed
  since shows the ref and text it had when it last failed, marked "No longer in the checklist"
  (Contract).
- **By severity is one bar for the whole selection**, split into minor, major and critical.
  Severity per month or per model would repeat the totals of the month line and the model bars.
  Easy to change if you meant one of those (Page).
- **Recharts draws the month line only.** Sections, models and resps are ranked bars in plain
  HTML: long section titles wrap instead of being cut off, and every value is printed (Page).
- **The default period is the last 12 months** (this month and the eleven before). Dates are
  front-page dates. A period in a link is relative; only a custom range keeps its dates (Page).
- **The CSV uses semicolons and a UTF-8 byte order mark**, which Excel with Swedish regional
  settings opens straight into columns, and a cell starting with `=`, `+`, `-` or `@` gets a
  leading `'` so it never runs as a formula. A comment typed as "- loose screw" shows as
  "'- loose screw" in Excel (API).
- **Which inspections count comes from the inspection list (the blobs)**; their deviation rows
  are matched to them by id, so a row left behind by a deleted inspection never counts
  (Contract).
- **The inspection list row gained `okCount`, `templateId` and `templateRevision`.** An
  inspection saved before this phase has an outdated summary and is read in full by the list
  until its next write; a finalised one until it is reopened. Nothing is deployed yet, so only
  local data is affected (Contract).
- **Editing the settings is still not built:** the brief describes the screen (§5.6) but puts it
  in no phase. (Built since: see Settings lists and deviation categories.)

### Contract (shared)

- **`shared/src/insights.ts`** holds the filters (`parseInsightsQuery`, `insightsQueryParams`),
  the answer (`InsightsSchema`) and the aggregation (`aggregateInsights`), a pure function of the
  inspection list, the deviation rows and a lookup of published revisions. The API gathers the
  data; unit tests cover the rules without storage. The answer carries counts; the rates
  (`firstPassRate`, `deviationsPerInspection`) are computed where they are shown.
- **Filters:** `from` and `to` are inclusive front-page dates in 2000–2099 (a typo like year 0026
  would otherwise ask for a 24 000-month axis), `from` must not be after `to`, `model` is a model
  code, `includeInProgress` is `true` or `false`. An empty value counts as not given. The model
  filter's choices (`modelCodes`) are the models of every inspection, whatever the filters.
- **Months:** every month from `from` to `to`, empty months included; an open end reaches the
  first or last inspection in the selection. A deviation counts in the month of its inspection's
  date (from the blob, which the row's `inspectionDate` mirrors).
- **Grouping:** sections and resps are grouped trimmed and ignoring case, shown in the spelling
  most rows use (the first one met on a tie), most deviations first. Extra deviations (no row, no
  section) and deviations without a resp come last whatever their count: the ranking is about
  sections and people. Sections with the same title count together across models.
- **Top 10:** grouped by item id. Most failures first, then the higher share, then model code
  and checklist order (`1.z` before `1.aa`). Extra deviations are not checkpoints and are left
  out. If a revision can't be read, every inspection of the checkpoint's template counts as
  having had it.
- **Ties at the tenth place are cut,** not extended: the brief asks for ten.

### API

- **Two registrations, 15 in all:** `GET /api/insights` and `GET /api/insights/export.csv`
  (`functions/insights.ts`), admins only, with the filters in the query string. A bad filter is
  a 400 with the zod issues in `details`.
- **The table is queried with the filters** (model as PartitionKey, date range, `finalised eq
true` unless in-progress is included) and only the table's columns (17 then, 18 since the
  category). A row that fails the schema is skipped with a warning, so one hand-edited row can't
  take the dashboard down. The inspection list is the same blob listing `GET /api/inspections`
  uses.
- **Published revisions are cached in memory** for the life of the Functions instance: they never
  change, so after the first request the dashboard reads only the template listing for them. A
  missing revision is not cached (and logged), so it is looked for again next time.
- **CSV:** the table's columns in the brief's order as the header row, CRLF line ends, values
  with a quote, semicolon, line break or surrounding spaces quoted. Rows: oldest inspection first
  (date, then number), each inspection's rows in checklist order, extra deviations last.
  `Content-Disposition: attachment` with a name made of the filters (`Deviations start to
2026-11-03, RMMG, incl. in progress.csv`; an open end is "start", or today in Sweden), all
  ASCII, and `Cache-Control: no-store`.

### Page

- **Filters live in the URL** (`?period=&from=&to=&model=&includeInProgress=`), only those that
  differ from the defaults. Changes replace the history entry and render at once (`flushSync`,
  as on the inspections list): the checkbox and date fields show what the URL holds, so a
  transition would make a click seem to do nothing for a moment.
- **A custom range that ends before it starts says so under the dates and asks for nothing;**
  the numbers come back when the range makes sense.
- **While new numbers load, the previous ones stay on screen, dimmed** (TanStack Query's
  `keepPreviousData`): no skeleton flash, no layout jump.
- **Layout:** the filter row; four headline tiles; the top 10 table (the brief's most important
  table, so second); the month line and the severity bar; then sections, models and resps. On a
  phone everything is one column and the top 10 table fits 390 px without scrolling sideways.
- **The top 10 table shows a Model column only when the selection has more than one model:**
  refs like 1.a repeat across models.
- **Colours:** counts are one hue (brand 600, 4.5:1 on white); severity is one red ramp from
  light (minor) to NOK red (critical), checked as an ordinal ramp (lightness falls in visible
  steps, minor still 2.2:1 on white). Both are theme tokens in `index.css`. Status is never colour
  alone: the severity legend names each part with its count.
- **The month line:** hairline grid, muted axis text, a 2 px line with dots (dots hidden past
  36 months), a crosshair tooltip with the count first and the month and inspections after it,
  and a table of the same numbers for screen readers. One month of data is a single dot.
  Recharts' default colours are restyled with CSS from the theme tokens; it sets inline styles
  through the DOM, which the Content-Security-Policy (`style-src 'self'`) allows (the e2e test
  checks the console).
- **The CSV is downloaded with `fetch`, not a plain link,** so an ended session goes to the
  sign-in page instead of saving the login page as a .csv, and an error shows on the page.
- **Model choices** are the models with inspections, by name, plus one from a shared link that
  has none, as on the inspections list.
- **Recharts (3.10) is loaded with the chart only** (about 105 kB gzipped, its own chunk), so
  inspectors never download it.

### Tests and tooling

- **`shared/src/insights.test.ts`:** filters and their URL form, months across New Year, ref
  order, scope by state, date and model, orphan rows, months with open ends, grouping, models
  without deviations, severity, the top 10's share against the revisions that had the row, a
  removed row, an unreadable revision, the limit of ten, and the two rates.
- **`api/src/functions/insights.test.ts`** against the test Azurite: registrations, roles, a bad
  filter, an empty store, the counts of finalised and in-progress inspections, date range and
  model, a row moved and reworded in a later revision (current ref, share), orphan rows, and the
  CSV (headers, BOM, column order, row order, quoting, the formula guard, Swedish text, the file
  name). The test request helper takes a query string.
- **`e2e/insights.spec.ts`:** each test publishes a template with a model code of its own
  (`createTemplate` takes one), so other tests' inspections never mix into its numbers.

## After the first deploy

- **The no-access page shows the sign-in's account ID.** A Static Web Apps role belongs to the one
  Microsoft sign-in that accepted the invitation, not to the email, so the ID is what an admin
  compares with `az staticwebapp users list` (README, Invite users).
- **A refused request no longer bounces between the app and the no-access page.** The app sends
  a read that Static Web Apps refuses (401/403 without the API's JSON) to the sign-in or
  no-access page, and those pages send anyone whose sign-in has a role straight back into the
  app. When the two disagree they bounced back and forth, which is what the first admin saw. Now
  the app records the refused request (path, status, time) in `sessionStorage` first, and a
  pre-login page that finds a record younger than a minute for a sign-in with a role stays on
  the no-access page and shows "The server refused a request" with the request, the status, the
  time, the roles and the account ID, plus Try again (which clears the record). Without a record,
  or for a sign-in without a role, nothing changes. (Users and names keeps the record but has the
  pages ask `/api/me` instead of reading the roles, see there.)

## Settings lists and deviation categories

### Worth reviewing first

- Saving the settings sends every field at once, needs `If-Match` and answers 412 on a conflict;
  leaving the page never saves on its own, it asks (Settings page).
- A saved model's code can't be changed in the UI, only removed and added again (Settings page).
- Responsible is now a select of the settings' list instead of free text with suggestions; the
  suggestions endpoint is gone. Values stored before it was a list are kept and offered
  (Deviations).
- Leaving NOK drops the category along with the severity (Deviations).
- The blank Deviation Summary gets a Category column; Description shrinks from 85.5 to 61.5 mm
  (Print and Word).

### Contract and API

- **`SettingsInputSchema` (shared/src/settings.ts) checks both sides with the form's own
  messages.** It trims every field, checks model codes as `ModelCodeSchema` does (the pattern is
  now exported as `MODEL_CODE_PATTERN`), and limits sizes: 100 models, 50 entries per list, names
  and entries up to 100 characters, location and company up to 200. Fifty entries is about what a
  select stays usable with. The list editor refuses a 51st entry at once, not only at Save.
- **Model codes, model names and list entries are unique ignoring case and surrounding spaces,
  and the later duplicate is flagged.** Two "Mechanical" entries, or RMMG next to rmmg, could not
  be told apart in a picker. Codes are matched ignoring case too (stricter than the task asked),
  because they are table PartitionKeys and filter values; the first one stays as it was.
- **`PUT /api/settings` takes the whole editable part: machine models, default location, company
  name, `logoImageId?`, responsibles and deviation categories.** The server sets `updatedAt` and
  `updatedBy`. Check order follows the template save: If-Match (400), body (400 with the zod
  issues), not seeded yet (404), stale ETag (412), then the conditional write. GET and PUT share
  one registration, so the new method costs none; the old Resp autocomplete's registration is
  removed, 14 in all.
- **The logo id is not checked against storage,** as with a template's `coverImageId`.

### Settings page

- **One card, one Save, not autosave.** Settings change rarely and affect every inspection, so a
  half-edited list should never be live. Problems show after the first Save attempt and then
  follow the fields, and the first one gets the focus, as on the new-inspection form. A 412 shows
  the usual conflict message with Reload, which asks before it discards changes (`useReload`).
- **Leaving with unsaved changes asks first and never saves.** `useLeaveGuard` gets a flush that
  resolves `false`; closing the tab gets the browser's own warning.
- **The card is a `<div>`, not a `<form>`.** Its confirmation dialogs are forms of their own
  (nesting is invalid HTML), and Enter in a list's "New …" field adds the entry instead of saving
  everything.
- **A new model's code is suggested from its name until the code is edited** (emptying the code
  turns the suggestion back on): the capitals and digits of each word, or a word's first letter;
  the whole name in capitals when that gives fewer than two characters; accents dropped; a taken
  code gets a number (RMMG2). The New template and Import JSON dialogs use the same
  `suggestModelCode` (shared/src/settings.ts), so a model gets the same code wherever it is added.
- **A saved model's code is fixed in the UI.** Templates, inspections and deviation rows carry it,
  so a rename would really be removing one model and adding another; that stays possible (remove,
  add), and the server accepts any valid list. A saved code can still carry a problem (two saved
  codes that differ only in case): it shows under the code, and Save moves the focus there.
- **Removing a saved model asks first**: new templates can't be made for it; templates and
  inspections keep the code and show it where the name was (`modelName` already falls back to the
  code). Removing a model that was never saved doesn't ask.
- **List entries are moved with up and down buttons, not drag and drop.** The buttons are
  keyboard operable. At either end a button stays focusable but inert (`aria-disabled`), so the
  focus stays on the button that was used; removing hands the focus to the next entry, or to the
  field for a new one. Changes are read out in a polite live region.
- **The company logo is included.** `PhotoField` already does upload, replace and remove; Save
  waits while an upload runs. Without a logo, reports keep the Modig logo.
- **After a save the form takes the server's trimmed values and keeps its React keys,** so fields
  and focus stay put. Edits made while the save ran are kept, still unsaved. The `['settings']`
  query is updated at once, so other pages get the new lists without a reload.

### Deviations

- **Responsible is a select of `settings.responsibles`, empty allowed.** A stored value that isn't
  on the list (a free-text name from before, or one removed since) is matched exactly. It is
  offered as "`<value>` (not in the list)", and stays on offer while the page is open, even after
  another value is picked, so a slip can be undone. Data is never lost: the value is stored as
  text, as before.
- **"Responsible" on screen, "Resp" on paper and in Word.** The printed checklist's column (not
  this package's file) and the cards keep the workbook's short label; the template editor's column
  label (templates package) also still says Resp. (Superseded by UI pass, review fixes: the cards say Responsible; the
  checklist's narrow column and the blank summary keep Resp.)
- **On a wide sheet an empty Responsible select looks like an empty text field.** Its
  "Responsible" text is hidden like the inputs' placeholders, because the column label already
  says it; it shows again when the keyboard reaches the select. Options set their own colour, so
  the open list never inherits the hidden text.
- **A NOK row's Category select goes on the line below, under the comment, before the severity.**
  Tab order is comment → responsible → category → severity → next row: reading order, left to
  right. The severity stays last, and the common NOK flow (2, C, comment, Tab, responsible, Enter)
  never passes either select.
- **Enter in the Responsible select still moves to the next row, as it did for the text field.**
  Chrome's open list takes the Enter that picks an option. Category and severity keep Enter.
  Letters and arrows in a select pick entries and are never shortcuts: the row only handles keys
  aimed at itself.
- **A category is optional and only on a NOK row or an extra deviation.** Leaving NOK drops it, as
  it drops the severity. `deriveDeviations` and `validateForFinalise` are unchanged; finalising
  never asks for one.
- **The Resp autocomplete is removed: its endpoint, its table query, the client hook and their
  tests.** With a list there is nothing left to suggest.

### Print and Word

- **Each card has a "Category" line above "Resp", "—" when none,** so every card has the same
  shape. The extra line is measured like the rest of the card. The Word card's height estimate
  grows by one line.
- **The blank Deviation Summary has a 24 mm Category column, taken from Description, which keeps
  61.5 mm** for handwriting. The rows stay 9.5 mm and never split; Word mirrors the widths [13,
  12.5, 61.5, 17, 24, 30, 28] mm. The printed checklist table is unchanged.

### Insights

- **The deviation rows, and so the CSV, gain a `category` column after `severity`:** 18 columns,
  the brief's 17 plus this one.
- **"By category" is grouped like "By resp"**: trimmed, ignoring case, in the spelling most rows
  use, none last ("No category"). The panel is renamed "By responsible", with "Not assigned" for
  none. The four ranked panels form a 2×2 grid.
- **A null in a deviation row is read as a missing property** (after the first deploy).
  Insights reads the table with `$select`. For a property a row lacks, Azure's Table service
  returns null, while Azurite, which every test uses, leaves the property out. So every row
  written before `category` existed failed the schema and was skipped: Insights showed 0
  deviations for an inspection with NOK rows. Without its nulls, such a row gets the schema's
  default (`''`, no category). Old rows aren't rewritten. The API test makes the table answer
  as Azure does.
- **Rows that can't be read are counted, not only logged.** The response carries
  `unreadableRows`, and the page then says that number of deviation records is not counted, so
  its numbers may be too low. A dashboard that drops rows silently looks the same as one with no
  deviations. The log names the first problem (field and message).

### Tests and tooling

- **`e2e/settings-lists.spec.ts` changes nothing other tests rely on.** It adds a model and list
  entries named with a fresh tag, and removes everything tagged afterwards (in a `finally`,
  through the API, re-reading on a 412). The conflict test re-saves the settings unchanged. The
  default location and company name are never edited, because other specs read them. Its tests
  run in order (describe mode `default`), because each settings save changes the shared ETag.
- **Other specs that read the pick lists, the inspection tests among them, use only the first two
  entries of each, read from `/api/settings`.** The settings test only adds at the end, so those
  two never move.

## Users and names

The people list in Settings → Users & access, and names instead of emails.

- **The app manages people itself in `config/people.json`; Static Web Apps role invitations still
  count.** Managed functions can't call the Azure management API without a stored
  service-principal secret, so the app keeps its own list (email, name, role, added by/when). A
  caller's role is their role on the list, matched on the lowercased `userDetails`; otherwise it
  is their invitation's roles, so nobody lost access when the list started empty (the first admin
  was invited). A role on the list replaces the invited one, also downwards.
- **Authorization now trusts the sign-in's email (`userDetails`) from Static Web Apps' Microsoft
  sign-in.** Microsoft sets it from the account: the UPN for work and school accounts, which must
  be on a domain the tenant has verified, and the account's email for personal Microsoft
  accounts, which Microsoft verifies when the account is created. Only `aad` sign-ins are matched
  against the list. The other providers are switched off by route rules, and a GitHub-style
  `userDetails` would be a user name anyone could choose.
- **The route gate is `authenticated`; the API is the gate.** People on the list have no SWA role,
  so `/*` (the app and `/api/*`) only needs a sign-in, and `endpoint()` checks the role on every
  request, as it always did. This supersedes "never on `authenticated`" (Phase 1, Auth). The app
  bundle and its source maps (no data, no secrets) can now be loaded by any signed-in Microsoft
  account.
- **`getUser` reads the list through a 5-second cache per Functions instance.** One small blob
  read per request would be cheap, but the cache makes most requests free. A save clears that
  instance's cache after the write. On other instances a change, including a removal, takes
  effect within 5 seconds. A failed read is not cached. If storage is down, requests fail with
  500, as every data request would anyway.
- **A sign-in without any role gets 403 `forbidden` with "You don't have access to Final
  Inspection yet. Ask an admin to add your email in Settings."** The code stays `forbidden`. The
  app treats the API's 403 for `/api/me` (the minimum role) as "no access" and goes to the
  no-access page. An inspector asking for an admin endpoint still gets "You do not have access to
  this." and stays in the app.
- **The API is the one source of truth for the pre-login pages too.** `auth.js` uses `/.auth/me`
  only for the email and account ID and asks `/api/me`, which can answer in, no access, signed out
  or failed. It sends someone to `/` only when the API lets them in and no refusal was recorded in
  the last minute. The app records one before every trip to those pages, including the no-access
  one, so a brief disagreement between instances (just added or removed) can't bounce between the
  app and the page. "Check again" on the no-access page asks `/api/me` in place rather than
  reloading the app. The refused-request view stays for "the API lets you in, but the app was
  refused" and for API failures.
- **The app shell replaces the app with the account error only when `/api/me` has never loaded.**
  Settings refetches `/api/me` after each change to the people list, and a failed refetch keeps
  the user already loaded.
- **`PUT /api/users` saves the whole list with ETag concurrency.** It needs `If-Match` with the
  version read, or `If-None-Match: *` when there was no list (`GET` answers `{ people: [] }`
  without an ETag). Sending both, or neither, is a 400. A first list that loses the race to
  another admin's (a 409 from storage) is answered as 412 like any other conflict. On a 412 the
  client reloads the list and says so, and saving again applies the same change on top. apiFetch
  gained an `ifNoneMatch` option for this.
- **Lockout rules on the server, mirrored in the UI:** a save may not take away the caller's own
  admin access, judged by their entry on the new list or, when the list leaves them off, their
  invitation. And a list with people on it needs at least one admin, otherwise only invited admins
  could ever change it again. An invited admin may take themselves off the list (the invitation
  still counts) or empty it. The UI locks your own role to admin and has no Remove on your own
  row. An admin who has access only through an invitation sees "You're not on the list yet → Add
  yourself", and the first save needs an admin on the list.
- **`addedAt`/`addedBy` are the server's.** They are kept for people already on the list and set
  for new ones. Someone removed and added back counts as new.
- **No email is sent by the app.** After adding someone, the dialog shows a ready-to-send
  invitation (the app's address, the role, and "sign in with your Microsoft account" with their
  email) with Copy (falling back to selecting the text) and a `mailto:` link.
- **Names are looked up at display time, not stored.** Documents keep emails (`updatedBy`,
  `finalisedBy`, `publishedBy`, `addedBy`) and the app shows the name from `GET /api/people` (open
  to inspectors, since they see who finalised and published). Someone not on the list is shown by
  the stored value: their email, or "seed". This means a person removed from the list later shows
  by email again on old reports. That is simpler than copying names into every document, and more
  honest than guessing a name. The print page waits for the directory before building the model
  (an autoprint must not print emails), but prints emails if it fails. The Word export uses the
  same model.
- **Participants are suggested from the directory with a `<datalist>`.** Picking a suggestion adds
  the chip at once (the browser sends a replacement rather than typed text); free text still
  works.
- **Search appears from six people on**; below that the whole list fits on screen. The query
  filters only while the box is shown: otherwise a removal that hides the box could leave a filter
  no one can clear. People are sorted by name, the Swedish way.
- **E2E: the people list is one shared document,** so the Settings test uses emails unique to its
  run and removes them in `finally` (`e2e/support/people.ts`, deleting the blob when it becomes
  empty). Other tests, signed in by invitation roles, are unaffected.

## Templates: delete, spare lines, cards, JSON files, new models

- **Deleting a template deletes the draft first (only if it is still the `If-Match` version), then
  every blob under `templates/{id}/`, listed again after the draft is gone.** The template
  disappears for everyone at once, since a folder without a draft is never listed. Listing again
  catches a revision published meanwhile. A revision that fails to delete is logged and the delete
  still answers 204: the template is already gone, and a retry would only get 404. The list and
  the detail treat a revision that vanished mid-read, with its draft gone too, as a deleted
  template, not a 500.
- **Deleting keeps the images, the inspections and the deviation rows.** Inspections share the
  cover and guide images through their snapshots. Insights counts the deviations as before; with
  the template's revisions gone, a checkpoint shows as it was last inspected and is marked
  `removed`.
- **The editor saves what is unsaved before deleting, then sends the draft's current ETag.** An
  autosave in flight would otherwise make the delete fail on the editor's own save. A failed save
  leaves the ETag of the last successful one, so another admin's newer save still blocks the
  delete (412). A 404 counts as deleted.
- **Locally, deleting the seeded RigiMill MG template brings it back at the next `npm run dev`.**
  The seed imports it whenever no template for RMMG exists. Production seeds once, by hand.
- _Superseded: spare lines were removed, see 'Spare lines removed'._ **Spare lines: a section gets
  its own `spareRows` the first time one of its spare lines is added or deleted. The template's
  number stays the default for the other sections, and nothing normalises a section's count back to
  it.** Deleting a spare line removes the last one: the lines are all alike, so the letters never
  jump. Undo puts back the previous own count, or none.
- _Superseded: spare lines were removed, see 'Spare lines removed'._ **"Unpublished changes"
  compares the spare lines each section prints, not how they are stored.** A section's own 3 next to
  a default of 3 is the same paper.
- **Import keeps the file's section and row ids only when no draft or revision anywhere uses any
  of them; otherwise every section and row gets a new id.** Re-importing an exported template (a
  backup, a move between installations) keeps its checkpoints' KPI history. Copying one next to
  its original can't create duplicate ids. Two admins importing the same file at the same moment
  could both keep the ids; accepted, like one-template-per-model.
- **Import drops each image id whose blob is missing and counts the dropped ids.** That covers the
  cover photo, a guide image (when its photo is missing), a marked-up copy, and a guide left with
  nothing in it. The model check (and adding a new model) runs last, so a refused import changes
  nothing.
- **The import file is checked in the browser first (format, version, schema, at most 5 MB), with
  plain reasons; the API validates the whole request again.**
- **Import JSON preselects the file's model when a free settings model has the same code, in any
  case.** It offers it as a new model only when the settings have no model with that code in any
  case (with a suggested code when a template already uses the file's).
- **A new machine model is added in the same conditional settings write (`updateSettings`) that
  checks its code and name are free; 409 otherwise.** A check before a separate write would let
  two admins adding the same model at the same moment end up with two templates for one model.
  What is taken is the same in the dialogs and in `POST /api/templates` and `/import`: a code that
  any settings model or any template uses, whatever the case; a name only if a settings model has
  it (a template's name is never a model's name). A code a template already uses without the
  settings having it is a 409 too, checked before the settings change. If writing the draft fails
  after that, the model stays in the settings, offered as a model without a template.
- **The suggested code is the Settings one (`suggestModelCode`, see Settings lists): the capitals
  and digits of each word, accents dropped, e.g. RigiMill MG → RMMG, with 2, 3, … added while
  taken (by the settings or by a template's code).** It is editable, and stops following the name
  once edited. Create stays disabled until the model fields are valid; taken and malformed values
  show at the field at once.
- **The New template dialog always shows the form.** With every model taken it starts on "New
  machine model…" instead of the old "Every machine model has a template" message.
- **The list/cards choice lives in localStorage, per browser, wrapped in try/catch; the list is
  the default.** It is a viewer's convenience, not shared state.
- **Cards show the draft's cover photo, to inspectors too,** like the list shows the draft's name
  and row count. Images are decorative there (`alt=""`): the card's name is the link.
- **Export JSON writes the editor's draft as shown, unsaved changes included,** named
  `<template name>.json` with characters Windows and macOS refuse replaced.
- **Import is a registration of its own (`templates/import`); DELETE shares `templates/{id}`'s.**
  17 registrations in all, with the two from Users and names.
- **The e2e tests that take the first machine model without a template (New template, Import
  JSON) run serially in their own describe.** In parallel both could pick the same model. The
  new-machine-model e2e test stops before Create, so local settings never collect test models.

## Theme and quick preview

### Theme

- **System, Light and Dark; System is the default.** A choice is kept per browser in localStorage
  (`theme`). System stores nothing (choosing it removes the key), so the device's own setting
  applies. Workshop tablets are often set to dark; desks rarely are.
- **The dark theme is the same tokens with dark values, designed rather than inverted.** The
  canvas (#0f1216) is darker than the cards (#171b21), as in light. The ink ramp is mirrored
  (ink-900 is near-white, ink-200 a quiet border at 1.4:1), and text stays at ink-500 or lighter
  (≥ 4.57:1 on the canvas, cards, quiet fills and tints; ink-500 is 6.75:1 on the cards and 4.77:1
  on ink-200). Brand 700/800 become light cyans for text (≥ 6:1; brand 700 is 8.28:1 on the
  cards). Brand 600 stays #0b7db3: it carries white text (4.57:1) and, as the focus ring, is
  3.78:1 on the cards, 4.11:1 on the canvas and ≥ 3.2:1 on ink-50 and ink-100. Status colours are
  dark tints with light text (OK 7.18:1, NOK 6.50:1, N/A 6.76:1). Every pair in use was computed;
  none fails.
- **Severity runs the other way in the dark theme**, from a dark red (minor #8c3a31) to a light one
  (critical, the NOK red #f68174). Severity is a sequential ramp, so the most severe must contrast
  most with the background, and on a dark card that is the lightest. Steps fall in visible
  lightness steps (relative luminance 0.09 → 0.17 → 0.37). Each fill has its own label token
  (`on-severity-*`): white on minor (7.60:1) and major (4.73:1), ink on critical (6.85:1). In
  light, the major label is now near-black (4.62:1): white on #dc5a4b was 3.75:1, below AA.
- **Fills under white text have their own tokens, `primary`, `primary-hover` and `nok-solid`.** In
  the dark theme brand 700 and nok-fg are light text colours, so a button hovering to brand 700,
  or a critical badge on nok-fg, would have lost its white label. White on `primary` (#0b7db3) is
  4.57:1 in both themes; `primary-hover` and `nok-solid` stay at least 5:1 with white (the dark
  `nok-solid` 5.32:1).
- **Some colours don't follow the theme: `paper`, `scrim`, `stage`, `on-stage`.** Paper is white
  (photo mattes, printed sheets). The scrim darkens what is behind a dialog and the controls on a
  photo. Photos are viewed and marked up on a dark stage. These were ink-900/950, which become
  near-white in the dark theme. Annotation colours and everything drawn into an image are
  unchanged.
- **The theme is applied before the first paint by `public/theme.js`**, a blocking classic script
  in the `<head>` of the app and both pre-login pages. The CSP allows no inline script, and the
  app bundle comes too late (a flash of the wrong theme). It has its own anonymous route, like
  every pre-login file. Without JavaScript or storage, the system's setting still applies through
  `prefers-color-scheme`.
- **`dark:` is redefined (`@custom-variant dark`)** to mean "the dark theme is showing":
  `data-theme="dark"`, or the system's dark setting when no Light is stored. It applies on screen
  only, so printing any page uses the light tokens.
- **Paper is light in both themes.** The sheets keep their own greys, white and
  `color-scheme: light` (set on `.paper`); only the grey desk around them, and the toolbar, follow
  the theme. The e2e test checks white sheets and black text while the app is dark, and light
  tokens in print.
- **The control is a three-way segmented radio group in the sidebar's user panel**, so the tablet
  drawer (the same Sidebar) has it too. Native radios give one Tab stop and arrow keys. System's
  tooltip says which theme it gives right now. Both copies share one store and stay in step.
- **A white-wordmark logo for the dark theme (`modig-logo-dark.png`)**, made from the official PNG
  by turning only its black palette entries white; the blues and the transparency are untouched.
  The black wordmark disappears on a dark surface. CSS filters would also have changed the blues.
  Replace it with Modig's official negative logo if there is one. The pre-login pages could only
  change in their `<head>`, so they show it as the background of their one `<img>` and move the
  black image out of its box: one image, and the alt text stays.

### Quick preview

- **Preview opens the printout in a full-screen native `<dialog>` on the inspection page.** It
  does not open a new tab, save first, or open the print dialog. It is built from what is on
  screen (`inspectionOnScreen`: the draft and the server's state), so unsaved edits show. It
  reuses PrintDocument, usePrintImages and the card measuring (`usePrintDocument`, shared with the
  print route), so it waits for fonts and images and packs the cards as on paper.
- **It opens on the report** (what an inspector wants to check), with a switch to the blank
  checklist. Deviation cards are 2 to a page and there is no appendix, as the Print / Save PDF
  menu opens them. (Superseded by UI pass, review fixes: 4 to a page when no deviation has a photo, as the print route.) The print route keeps the other layout switches.
- **Sheets are scaled with a transform, not `zoom`**: the browser lays the pages out exactly as
  for print and only draws them smaller, so lines break where they will on paper. The scale fits
  the desk's width, never above 100 % and never below 37.5 %. Card measuring (`useCardPages`)
  divides the measured rectangles by the scale (rect height ÷ computed height), so packing is the
  same at any size.
- **Its Print / Save PDF closes the dialog, then does what the page's does**: the page's
  `openPrint(mode)` saves pending changes and opens the print route in a new tab, which prints
  once loaded. Ctrl+P / Cmd+P in the dialog does the same, instead of printing the page behind it.
  Closing first hands the focus back to Preview, and a failed save shows on the page.
- **Close has the focus on open**; Escape or Close returns it to Preview, natively and also
  explicitly, because Safari doesn't focus clicked buttons.
- **In the dark theme the pages region's focus ring is brand 500,** because brand 600 is 2.67:1
  on the dark desk.
- **A template needs no new preview:** the template print page never prints by itself (only
  `autoprint=1` prints), so the editor's "Print preview" link already serves as its quick preview,
  and an e2e test checks it.

## UI pass

A review of every page in both themes, at phone (390 px), tablet (820 px) and desktop (1366 px)
widths, against local demo data. No page scrolls sideways at 320 to 1366 px any more.

### Shell and shared components

- **Below md (768 px) the inspections list has one Inspection column** (number, machine,
  "S/N … · date") beside State and NOK; from md the seven columns, 12 px apart so they fit a
  portrait tablet and a landscape one beside the sidebar. Each layout's cells are `display: none`
  in the other, so a test at desktop width still sees seven cells and one link per row.
- **On touch screens** nav links are 44 px, menu items 40 px, Sign out 36 px and a participant
  chip's remove button has a 28 px hit area. Buttons and inputs stay 36 px everywhere: many pages
  set their own heights, and a global touch height would change their layouts.
- **Below lg the page has `scroll-padding-top: 4.5rem`** for the sticky top bar, so a field
  reached by Shift+Tab or a link to an id is never scrolled under it.
- **In the dark theme modal backdrops are scrim at 70 %** (30 % in light): 30 % of near-black over
  a near-black page dimmed almost nothing. The drawer and the skip link have a border there.
- **`Button` has a `danger` variant** (nok-solid with white text in both themes), used by every
  delete and remove confirmation.
- **The loading skeleton matches the sidebar's user panel** row by row (shared sizes in
  `components/layout.ts`), so nothing jumps when the account arrives. `PageLoading` draws no fake
  header under a page's real one (`header={false}`).

### Inspection page

- **Read-only (finalised) has its own, tighter grid** (`READ_GRID`): ref | checkpoint | Status
  (7rem) | Responsible (10rem) from 34rem, with the comment and a NOK row's category and severity
  under the checkpoint. With nothing left to fill in, an empty Comment column only made 90 rows of
  "✓ OK" twice as tall. Rows stay focusable from script for jump links.
- **The header is laid out by its own width** (a container): from 52rem the actions sit beside
  the title and the details run under both, so the save status changing never re-wraps them;
  narrower, the actions go under the details. **It sticks only from 40rem wide and 40rem tall;**
  on a phone it would take a third of the screen. On a phone the menu reads "Print" (its
  accessible name stays "Print / Save PDF").
- **The keyboard shortcut bar is hidden on touch-only devices,** where it took four lines.

### Templates, Settings, Insights

- **Every header's actions wrap** instead of pushing the page wider (template editor, Templates,
  page headers in general).
- **Template cards name the last editor** as the list does, not by email.
- **The people table and the list editors fit a phone;** the invitation text grows with its
  content instead of a fixed six rows.

### Report

- **Refs and card heads use proportional figures:** Inter's tabular ones spaced "D-01" out.
- **A card's Category and Responsible values line up** in an 18 mm label column (Word: a 20 mm
  tab stop and hanging indent).
- **The print toolbar has two parts:** the way back, the subject and Export / Print, then the
  layout choices with the PDF hint on the right. It is sticky from 640 px up only.
- **The Preview names the finaliser as the print route does.**

### Review fixes

Two reviewers then went over the screenshots of the pass (41 findings); these came out of fixing
them.

- **Two new tokens: `raised` and `overlay`.** `raised` is the chosen segment of a segmented
  control on its ink-100 track; `overlay` is a menu, popover or dialog. Both are white in light; in
  dark they are lighter than the surface (#353c46, #232931), because there elevation is lightness
  and a shadow doesn't show. Inside an overlay a hover is ink-200 in dark (ink-100 is the overlay
  colour), the ghost button's hover included.
- **One segmented control look:** a ringed ink-100 track, rounded-md segments, the chosen one
  raised, a raised/60 hover. The sidebar theme toggle keeps its own size (three columns of the
  215 px panel, h-7, text-xs), the checklist status keeps its status colours and the row height
  (28 px with a mouse, 40 px on touch), the guide verdict picker keeps text-xs.
- **Minor severity is a neutral grey,** in Insights and its badge alike; major and critical stay
  red, critical the strongest. The critical badge uses the severity token, so it matches Insights.
- **Overlays share one frame** (`DIALOG_FRAME` in components/Dialog.tsx): bg-overlay, an ink-300
  border in dark, a scrim backdrop at 30 % (light) and 70 % (dark). The guide, annotation and photo
  dialogs, which are not built on Dialog, use the same classes. **A dialog's closing row of buttons
  sticks to its bottom** above a divider (components/dialog.css, found by position, as every
  dialog ends with it), so a long dialog on a phone keeps Save in view.
- **Secondary buttons in dark are a faint white wash** (5 %, hover 10 %): on a dialog a surface
  fill sank in and read as a text field. **Disabled primary and danger buttons turn ink-200 with
  ink-500 text;** half-faded white on pale cyan read as loading. Settings' Save, which is
  aria-disabled to keep the focus, looks the same, but still fades while saving.
- **Dark field outlines are ink-400** (3.7:1 on the surface). Tailwind emits `dark:hover` after
  `focus-visible` and `aria-invalid`, so the focus and error borders are restated for dark.
- **Empty and error states share `StateCard`** (a size-11 rounded-xl tile, title, hint, action),
  so a retry that turns an error into an empty list keeps its height. The template editor's "No
  sections yet" matches it.
- **One card header:** a small semibold title, an xs description, an ink-200 divider and an
  optional aside, no icon tiles, on Settings, Insights, the front page card, the revision history
  and the New inspection Checklist card (whose h2 sits in the fieldset's legend, so the radio
  group keeps its name). The five differ in alignment and phone padding, so they stay inline
  rather than one component.
- **A focused, checked template card shows one 2 px frame**, the outline drawn over its border.
- **Link-styled buttons with a touch-sized box** ("Continue at 3.b", a card's "1.d ↳") keep the
  focus ring and hover underline around the text (`linkText.ts`), so the focus on load reads as a
  focused link.
- **Labels in rows are grey** (Category, Severity, Responsible, the finalised notes). Red is kept
  for the NOK bar and chip, the Major and Critical badges and real errors.
- **Inspection header on a tablet:** from 42rem the actions sit beside the title, and below 52rem
  the save status moves to the end of the details line, at its text's height (`SaveStatus`'s
  `height`). The sticky header drops from 162 to 122 px and never changes height while typing.
- **Phone checklist:** below 34rem the fields span the ref column, inset to line up with the row
  letter and clear the NOK bar, on a sheet with 12 px sides; controls are 294 px wide at 360 px
  (250 before). Status and Responsible stay on separate lines: side by side the status segments
  would be too narrow to tap. A chosen Responsible gets a grey label on a phone; tablets get the
  column labels on a second line of the section header.
- **The template editor's header follows the inspection's rules:** sticky only from sm and 40rem
  tall, scroll padding measured from the header (`lib/useScrollPaddingBelow.ts`, shared), a long
  name wraps to two lines.
- **Template cards show the list's badges;** "Unpublished changes" only when the draft differs.
- **Insights:** with one or two months the chart draws 24 px columns with their count on top (a
  line needs three points to show a trend), and from three months the line. The count axis has
  whole, round ticks with at least 15 % headroom; ticks read "Oct 2026". The panels share one
  two-column grid, "By severity" takes its own height, and on a phone the KPI tiles are two to a
  row (a subgrid keeps their values level) and the Top 10 table moves its numbers under the
  checkpoint ("2 failed · 100% of 2 inspections"), staying a real table.
- **Report, Chrome PDFs:** every sheet's content keeps the 0.5 mm inset off the right margin, so no
  box's right border is clipped to a hairline.
- **Report on a phone or tablet:** the print route fits its sheets to the screen with the
  Preview's `FittedPages` (a transform, 37.5–100 %, screen only), so paper stays 1:1.
- **A report without a machine photo leaves its space blank;** a "No machine photo" frame read
  like a missing image in the customer's copy. Blank and template forms keep a "Machine photo"
  frame to stick one in. Word does the same.
- **4 deviations per page when none has a photo** (`defaultDeviationsPerPage`): with 2, three
  quarters of each card page were empty sketch frames. 2 stays the default with photos, and a
  choice in the address always wins.
- **The summary counts statuses for the customer:** "90 checkpoints: 82 OK · 5 NOK · 3 N/A ·
  7 deviations", plus "N not checked" on a draft report.
- **A row with a very long comment (over 600 characters, about a third of a page) is free of the
  keep-with-next rules.** In a short section, first-keeps-with-next and last-keeps-with-previous
  chained every row into one block; three such rows were taller than a page, and Chrome then split
  a row (and left the checklist's first page with only its heading) rather than break between
  rows.
- **Lower report rows:** a 3.4 mm status symbol over 6 pt type and tighter cell padding take a
  90-row checklist from 5 pages to 4. The OK/NOK/N/A columns stay, as on the paper form.
- **The blank Deviation Summary has 24 lines,** as many as its page holds (the brief says about 15),
  instead of half a page left empty.
- **Revision wording:** running text (checklist heading, footer, toolbar) says "Rev 2" or "Draft –
  Rev 3". The front-page corner keeps the workbook's form field "Rev: n" for a published revision.
- **The print toolbar truncates only the subject's name,** never "Draft – Rev 3", and the PDF hint
  wraps between whole settings.
- **The search placeholder is "Number, machine or S/N",** which fits a 320 px phone.
- **A participant chip's 36 px remove area is for coarse pointers only,** so a mouse click near the
  end of a name doesn't remove it.

## Feature batch 2026-11-05

### Empty sections and template cards

- **A section may be published without rows; a checklist without any row may not ("Add at least
  one row.").** An admin can publish a heading as a reminder of checkpoints still to be written.
  A checklist with no row at all would give an inspection nothing to check: 0 / 0 rows, nothing
  for Continue at, a Finalise that every inspection passes at once and a report of empty tables,
  counted by Insights as an inspection. It is a template-level problem, after the name's; its
  "Go to it" focuses the first section's Add row (`data-add-row`). An empty section title and an
  empty row text are still refused: the row would reach inspections as a checkpoint without text.
- **An empty section keeps its number.** Sections are numbered by position (numbering.ts), so 4
  stays 4 and the sections after it keep theirs; nothing about numbering changed.
- **In the editor an empty section has a dashed frame where its rows will go, holding its Add
  row.** A section has one Add row: at the end of its rows, or in that frame, never both (the
  accessible name "Add row to section N" stays unique). The whole rows area stays the drop target,
  so a row dragged into an empty section lands as its first row; the frame says "Drop the row
  here" while a row is dragged. A folded section (being dragged) reads "No rows" rather than "0
  rows".
- **On an inspection, an empty section is its heading and a quiet line, "No checkpoints in this
  section yet."** No column labels (no column under them), no Set remaining to OK and nothing
  focusable, so `↑`/`↓`, `J`/`K` and `Tab` go from the row before it to the row after it. Progress
  and Continue at count rows, so they are unchanged. The finalised view, and the read-only
  template view for inspectors and revisions, show the same line.
- _Superseded: spare lines were removed, see 'Spare lines removed'._ **Print: a blank checklist
  prints the heading over the section's spare lines, lettered from a; a report prints the heading
  and one muted line, "No checkpoints in this section."** Word the same. Without spare lines a blank
  checklist prints that line too.
- **A section's only row keeps with its title, not with the next section.** "First row keeps with
  next" also applied to a row that was the last one, and a last row's `break-after: avoid` passes
  on to its table: an empty or one-row section then dragged the next section's start along. In a
  90-row report with two empty sections Chrome moved section 2 to the next page and printed 7
  pages instead of 6; now it stays under section 1 (checked in a PDF). Word's `keepNext` follows
  the same rule (`keepsWithNext`), though there a spacer paragraph stopped the chain anyway.
- **The seed imports a workbook section without checkpoints as an empty section, with a
  warning;** a checklist sheet without any checkpoint is still refused, as Publish refuses it.
- **Template cards: every photo in a 16:10 frame, fitted whole (`object-contain`) with 16 px
  around it.** Product renders are mostly wide: a 2.9:1 HHV3 render keeps the full width and a
  4:3 RigiMill render about 83 % of it, where 4:3 would have shrunk wide renders to a strip and 16:9
  left 4:3 ones narrow. A card without a cover keeps the frame with an icon.
- **The photo is multiplied onto a light panel (`mix-blend-multiply`, panel `isolate`d):** a
  render's white background takes the panel's colour, so the photo looks printed on it instead of
  a white box pasted in. Light: ink-50 with an ink-200 inner ring. Dark: a light grey mat inset in
  the card (ink-800 there, #dde1e7, with an ink-600 ring), which doesn't glare as pure white does
  on the dark card and dims the photo by about a tenth. Without a photo the frame is the card's
  own ink-50, in both themes.
- **Each card spans four rows of the list's grid and lays out its parts on them** (a subgrid, as
  the Insights KPI tiles), so across a row of cards the photos, names, badges and footers start at
  the same height even when a name or the badges wrap. The covers had a fixed ratio before, but
  the image's own height overrode it (`size-full` on an image in a box sized by `aspect-ratio`
  alone), so taller renders made taller cards.

### Admins delete inspections

- **`DELETE /api/inspections/{id}`, admins only, shares the `inspections/{id}` registration**
  (still 17 in all), as the template delete shares its route's. Like it: If-Match is required
  (400 without), an unknown id is a 404 and a stale ETag a 412, both before anything is deleted,
  and success is a 204. In progress and finalised alike.
- **The blob goes first, conditionally on the If-Match; the rest is best effort.** Without its blob
  the inspection is gone from the list, its page and Insights (which counts only the rows of
  listed inspections). Its deviation rows and photos are deleted after that; whatever fails is
  logged (`context.warn`) and left behind, unused, and the delete still answers 204, since a retry
  would only get a 404. Storage may answer the blob's condition with 412 when the blob is already
  gone (Azurite does): that is a 404, so two admins deleting at once never see a conflict.
- **The images that go are its deviations' photos and their marked-up copies, on rows and extra
  deviations.** Every upload gets a new id, so no other document names them. As a guard against
  hand-edited data, an id the inspection also uses as a guide image of its frozen checklist (the
  template's, shared with every inspection of that revision), as its machine photo, or that is the
  settings' logo is never deleted (one settings read). The machine photo always stays, even one
  uploaded for this inspection: telling it from the template's cover would mean reading the
  template's revision, and a photo left behind only costs storage. Photos replaced or removed
  earlier were already unreferenced and stay, as before.
- **A save whose deviation sync is slow can't leave rows behind.** `syncSettled` now deletes the
  inspection's rows when it finds the blob gone after syncing; the delete removes the rows after
  the blob, so whichever finishes last leaves none. A finalise or reopen racing a delete can still
  leave rows (it syncs the table before its blob write, which then fails); Insights ignores them.
- **Numbers are never handed out again: the counter is not touched.** Only if the counter blob
  were lost as well would the newest number come back after its inspection was deleted, since a
  lost counter carries on from the highest number in use.
- **The page saves what is pending, then stops autosave before it sends the DELETE with the latest
  ETag**, so no save or retry follows the delete; a save after it would be a 404 anyway (a save
  never creates an inspection). If the delete fails, autosave carries on, and a failed save's
  retry, whose timer stopping cleared, is sent again. A 404 counts as deleted (another admin got
  there first, or a lost answer's retry). A 412 keeps the dialog open with "Someone else changed
  this inspection since you opened it, so nothing was deleted." and Reload in place of Delete, and
  the page shows the conflict as after a finalise's 412.
- **Delete inspection is the only item of an admins-only ⋯ menu ("Inspection actions") after
  Finalise or Reopen,** as Delete template is on the template editor. It has no other item, so
  the menu's divider above destructive items is drawn above it too (`ActionMenu` draws one before
  every danger item; asked for a fix there). On a phone the menu's button is pulled 4 px closer to
  Finalise, so it shares their line at 390 px; narrower (360 px) it wraps onto a line of its own.
- **The dialog names the inspection and what goes** ("Delete FI-2026-0012?", its deviation photos
  and records, Insights stops counting it, can't be undone) and **adds a line for a finalised
  one:** its report may already have been sent.
- **Afterwards the list shows "FI-2026-0012 was deleted."** from router state, as the Templates
  page does after a template delete; dismissing it clears the state, search and filters kept. The
  row leaves the cached list at once, and the list and every Insights query (`['insights', …]`)
  are invalidated.
- **The e2e tests are a file of their own** (`e2e/delete-inspection.spec.ts`), with their own
  throwaway template, so they merge cleanly with the inspection tests.

### Insights month filters and page pass

- **Two new periods, Single month and Month range,** next to the relative ones and custom dates.
  "Custom range" is now "Custom dates", so it isn't mistaken for a range of months. The URL
  carries them as `month`, `fromMonth` and `toMonth` ("2026-10", in 2000–2099; anything else is
  ignored), and they reach the API as the first and last day of their months, so the API's
  filters are unchanged.
- **Months are chosen from menus, not `<input type="month">`,** which Firefox and Safari on a
  desktop show as a plain text field. The menus list every month from the earliest inspection's
  to the current one, newest first. A month a shared link names outside that stretch widens it,
  so the menu can show it. An inspection dated in the future doesn't lengthen the list.
- **The answer gains `firstInspectionDate`:** the earliest front-page date of any inspection,
  in any state and whatever the filters (like `modelCodes`), or null without inspections. It
  defaults to null in `InsightsSchema`, so an answer without it still parses.
- **A month range's open ends** (a link without `fromMonth` or `toMonth`) are the first
  inspection's month and the current month, which is what the menus show; a single month without
  `month` is the current one. The page always writes both ends into the URL.
- **Switching the kind of period starts from the dates on screen.** From Last 12 months a month
  range starts at 2025-12 to 2026-11, from Last year at 2025-01 to 2025-12; a single month takes
  the stretch's last month, never one after the current month; custom dates start at the
  stretch's dates unless dates were already typed. Picking the kind of period and then narrowing
  it is two steps, and the numbers shouldn't change at the first.
- **A month range that ends before it starts** says "The start month is after the end month."
  under the menus, marks both invalid and asks for nothing, as custom dates do.
- **The relative periods show the dates they cover today** next to the menu
  ("2025-12-01 – 2026-11-05"); the menu points to them with `aria-describedby`.
- **Merge safety for the filters module:** no existing export changed its name or signature. The
  month fields of `InsightsFilter` are optional and `filterFromParams` leaves them out when the
  URL has none, so code that builds or compares a filter without months still works. `Period`
  has two more values. New exports: `withPeriod`, `monthOptions`, `describePeriod`.
- **Month labels on the chart are chosen for its width,** measured from its container: every
  month when they fit, otherwise every 2nd, 3rd (quarters), 6th or 12th month, always the same
  months of the year (quarters start in January, April, July and October), at least 56 px apart.
  Recharts' own thinning left uneven gaps (2025-03, 2025-07, 2025-10, 2026-01, 2026-04, then
  2026-10). The plot keeps 26 px on its right, so the last month's label isn't cut off.
- **Loading draws the dashboard's shape** (the filter row, four tiles and the top 10 card)
  instead of one grey block. While other filters load, the previous numbers stay, dimmed, as
  before, and "Updating…" with a spinner shows at the end of the filter row: a status message,
  so a screen reader hears it too. On a phone it is for screen readers only, as it would add a
  line under the filters.
- **An empty selection says which:** "There are no finalised RigiMill MG inspections in
  2025-08. Inspections in progress count only when you include them.", with **Show all time**
  unless the period already is.
- **Ranked panels without rows say "No deviations."** (inspections that had none); the card
  body was blank.
- **A severity block shows its percentage only when it has room for it.** Each block is a CSS
  container; a fixed minimum share (8 %) still overflowed in a narrow card.
- **On a phone every filter has a line of its own,** the two ends of a range side by side.
- **The panel layout stays two columns.** A month chart across two thirds read better, but its
  gutter no longer lined up with the tiles', and the six panels then left one alone in a row;
  quarters fit the half-width chart.
- **Month labels and menus use proportional figures:** tabular ones spread "2026-10" out.
- **Tests:** `filters.test.ts` (URL round trips, month ranges, the month list, switching periods,
  the period in words, the month range error), `axis.test.ts` (month ticks: calendar steps, never
  closer than a label), `shared/src/insights.test.ts` (`firstInspectionDate`). In
  `e2e/insights.spec.ts` the `inspect` fixture takes a date; three tests cover a single month and
  a range narrowing the numbers with the URL keeping them, a backwards range, and an empty month.

### Insights report

- **A print route, `/insights/report`, under the print shell** (no sidebar) and for admins only,
  like Insights. A guard (`report/AdminOnly`) shows the app's "Admins only" page in the print
  routes' message column; the API checks the role again. The route reads the filters only through
  `features/insights/filters.ts` (`filterFromParams`, `insightsQuery`, and `filterToParams` for the
  links to and from it), so a period the Insights page learns is the report's too. Its own
  parameters are `deviations=1` (the list) and `autoprint=1`.
- **The numbers are the page's own query** (`useInsights`, same key), so a preview opened from the
  page has them at once. The report waits for the numbers of exactly its filters, never the
  previous filters' that the page keeps on screen meanwhile.
- **What the paper says is worked out in one pure module** (`report/model.ts`, unit-tested): the
  KPI tiles' words, the panels' labels ("Not assigned", "No category", "Extra deviations (not
  tied to a row)"), shares and bars. Paper and screen say the same.
- **The period is stated as months when it is whole months** ("2026-10", "2026-01 – 2026-10"),
  otherwise as dates; a period that moves with the day ("last 12 months", "this year", "last
  year") is named after its dates, which say what it meant that day. No ends: "All time"; one:
  "From …" or "Up to …".
- **The PDF is named like the CSV export** ("Deviation report 2026-01-01 to 2026-10-31, RMMG"):
  months for whole months, "start" and today for open ends, the model code (ASCII) and ", incl. in
  progress", so the two files of one selection sort together.
- **"Generated" is when the numbers were read** (the query's time), with the signed-in user's
  name (the email when the API knows no name), as the inspection report names people.
- **Ruled tables instead of the screen's widgets:** severity, sections, models, responsibles and
  categories as tables with a black rule over and under and light rules between rows, each entry
  with its count, its share of all deviations and a slim dark-grey bar as long as the count against
  the largest (as the page's bars). Every entry is printed; there is no "Show all" on paper.
  Severity is a table too, not the stacked bar: three greys would not read as severities in black
  and white, the words do.
- **The top 10 on paper** has a Section column of its own and "50% of 4" on one line; the Model
  column only with several models in the selection, as on the page.
- **The month chart is an SVG the report draws itself, not Recharts:** a fixed geometry prints
  sharp and identical at any size and in any browser, and Recharts stays in the page's own chunk.
  It follows the page's rules: columns for one or two months, a line from three, dots up to 36
  months, round ticks from `countTicks`. The numbers are a table under it, a year to a row. With a
  year or less the table's columns sit under the chart's (its label column is the axis gutter), so
  its header names the months and the chart doesn't repeat them; with more, the chart labels every
  few months, counted back from the latest.
- **The chart is drawn in CSS pixels and redrawn when the fit scale changes.** Chrome lays SVG text
  out for the scale it is drawn at and doesn't redo it when only an HTML ancestor's transform
  changes. FittedPages measures at full size and then scales down, so on a phone the axis labels
  came out twice their size and out of place. `FittedPages` now provides its scale
  (`print/fitScale.ts`, additive) and the chart is keyed on it. Millimetre user units (text 2.5
  units high) were tried first and were not the cause.
- **Page breaks:** each part keeps its heading and stays whole on a page when it fits
  (`break-inside: avoid`), so no heading ends a page; a part taller than a page breaks between rows
  and its column labels repeat. The month part may break between its yearly tables, the chart and
  the first year kept together: three years kept whole left half of the first page empty.
- **The deviation list is a new endpoint, `GET /api/insights/deviations`:** the CSV's rows as JSON
  (`loadExportRows`: the same filters, rows and order), in `InsightsDeviationsSchema` (`{ rows }`)
  in shared. It is fetched only when the list is included. On paper it starts a page of its own,
  each inspection's rows under a grey line (number, date, model, the machine when it says more
  than the model, the serial number, "In progress"), in five columns: ref, checkpoint and comment,
  severity (critical in bold), category, responsible ("—" when empty). Refs and texts are as they
  were inspected, not the current ones: it is the record of what was found.
- **The list is off by default** (Print report and the preview open without it) and greyed out,
  with no page of its own, when the selection has no deviations.
- **Firefox and Safari** print no page numbers; the footer's text repeats under the deviation
  list (a table footer), as under the inspection's tables. The report before it is a few pages.
- **An empty selection** prints the header and one framed "No inspections match these filters";
  filters that can't be used (a range that ends before it starts) show why instead of printing.
- **The print toolbar is shared:** its "Include reference images" became optional and it gained a
  `choices` slot, where the report puts "Include deviation list", drawn like the reference images
  toggle. The inspection's toolbar is unchanged.
- **The preview dialog is the report's own** (`ReportPreviewDialog`): `PrintPreviewDialog` is built
  around the inspection's print model and its mode switch. It behaves the same: Close has the
  focus, Escape or Close hand it back to Preview report, Ctrl+P prints, the pages region scrolls
  from the keyboard and has a brand-500 ring in dark.
- **Print report opens a new tab that prints once loaded**, as the inspection's Print / Save PDF;
  there is nothing to save first.
- **The Insights page got two secondary buttons before Export CSV** (`report/ReportActions`), shown
  and disabled under the same conditions as Export CSV.
- **Tests:** unit tests for the model (period, file names, facts, KPIs, shares and bars, top 10,
  empty, unreadable records, the list's groups), the chart's geometry and the links; API tests for
  the endpoint (registration, roles, a bad filter, filters and order). `e2e/insights-report.spec.ts`:
  the preview and both ways of printing from the Insights page (dark theme, light paper, the list,
  the new tab's autoprint and its address), a real PDF (A4, footer and page numbers on every page,
  nothing past the right margin, the parts in order, no page ending on a heading, the list on a
  page of its own), a single month, an empty selection and unusable filters, and admins only.

### Review fixes (feature batch)

- **A menu never opens past the screen's left edge.** `ActionMenu` right-aligns its menu under its
  button; on a 360–375 px phone the inspection page's ⋯ button wraps to the far left, and the menu
  ran 136 px off screen. Once the menu has a width, its left edge is kept 8 px inside the viewport.
- **The report chart keeps room for the latest month's label.** With more than a year the chart
  writes its own month labels, the last one centred on the last point; past about 17 months half a
  month's slot is narrower than half a label, and Chrome cut "2026-11" to "2026-1" at the content
  edge. The plot now ends half a label short of the edge when it writes labels. With a year or less
  it still spans the full width, so the month table's columns stay under its points.
- **The deviation list is a table to an inspection, with the inspection's line in its head**, so a
  page that carries on with an inspection's rows starts with that line again. The column labels
  head the first table only: in every table they would come round again for each inspection of a
  row or two. Browsers without margin boxes get the fallback footer from the last table only, for
  the same reason.

## Spare lines removed (2026-11-05)

- **Spare lines are gone from the whole product.** They were the blank, lettered lines printed
  after a section's rows on a blank checklist (template preview, an inspection's blank print, the
  Word export), with a template default (`printSettings.spareRowsPerSection`, 3) and a count per
  section (`Section.spareRows`) edited in the template editor. The user never uses them and asked
  for the function to go. Gone with them: the editor's spare lines with their delete, Undo and
  **+ Add spare line**, the "Spare lines per section (default)" setting on the front page card and
  in the read-only front page, the print row's `spare` flag and `data-spare`, and in shared
  `SectionSchema.spareRows`, `DEFAULT_SPARE_ROWS_PER_SECTION`, `sectionSpareRows`,
  `PrintSettingsSchema`, `Template.printSettings`, `templateSnapshot.printSettings` and the
  template file's `printSettings`. There is no other print setting, so nothing replaces
  `printSettings`. On paper a finding that belongs to no row goes on the blank Deviation
  Summary's lines; in a report it is an extra deviation, as before.
- **A blank checklist prints the checkpoints and nothing more.** The rows still letter 1.a, 1.b…
  and are at least 9 mm high; the page-break rules are unchanged (a section's first row keeps with
  the next, its last with the one before, a section's only row with its title). A blank
  checklist and a template preview take fewer pages; the e2e page-count ranges follow.
- **A section without rows prints, blank or report, its heading and the muted line "No
  checkpoints in this section."** That is the line reports already printed; with spare lines a
  blank checklist printed the heading over them instead. The line keeps with its heading and never
  holds the next section on its page, in print and in Word alike.
- **Backward compatibility: stored data and exported files keep working, and nothing migrates
  them.** Template drafts and revisions and inspections in blob storage, and template files
  exported before this change, carry `printSettings` and sections' `spareRows`. The zod objects
  strip keys they don't know (the default; no schema uses `.strict()`), so the API reads them, and
  the app and the import parse them, without those fields. A draft or inspection loses them at
  its next save; a published revision, never rewritten, keeps them in storage, where nothing reads
  them. Template files stay format `modig-final-inspection/template`, version 1: a version 1 file
  with spare lines imports like one without (version 2 would have made every exported file
  unreadable for no gain).
- **"Unpublished changes" ignores them too.** `sameTemplateContent` compares name, model, cover
  and sections field by field, never whole objects, so a draft saved now is not "changed" just
  because the latest revision still carries spare lines. A draft whose only difference from its
  revision was its spare lines shows no unpublished changes any more; there is nothing left to
  publish.
- **Tests:** shared unit tests parse an old stored template, an old inspection and an old export
  file (version 1, with `printSettings` and `sections[].spareRows`) and check the fields are
  dropped and the comparison is unchanged; the API tests store an old draft, revisions and
  inspection (`withSpareLines` in `api/test/storage.ts`), read and save them without unpublished
  changes, create an inspection from an old revision and import an old file; the app parses an
  old file. The e2e test of the editor's spare lines is deleted; the print tests count the
  checkpoints only and expect the empty section's line in the blank print too.
- **Earlier entries that mention spare lines in passing are left as written:** the seed skipping
  lettered rows without text (Phase 1, Seed; it still does, they are simply blank lines on the
  paper form), the snapshot keeping print settings (Phase 3, Contract), spare lines printing in
  blank mode only and the page-count ranges (Phase 4, Print and Tests and tooling).

## Insights report in cards (2026-11-05)

- **Each part of the report is a light card**: a thin grey outline with rounded corners, its
  heading and what it counts inside. Tables lose the black rules over and under them: grey column
  labels over a grey rule, hairlines between rows, and the card closes the table. Bars get a light
  track and rounded ends, so a short bar still reads as a share of a whole. Supersedes the ruled
  tables under "Insights report"; the deviation list keeps its table per inspection, its line's
  rule grey as the cards'.
- **Short parts go two to a row**: By severity next to Per model (two fifths and three fifths, so
  the model table's four figures keep room for their labels; it loses its bar, the share says it),
  and By responsible next to By category. Per model therefore comes before the top 10 now. The
  report of a busy year is a page shorter.
- **What the report covers is a grey panel of four labelled facts**, two to a row, instead of ruled
  lines, and the headline numbers are four cards like the parts.
- A card that runs onto the next page (the month numbers over several years) is closed and opened
  again there (`box-decoration-break: clone`).

## Quality checks: set up (2026-11-05)

Quality checks are the in-process checks along a machine's build ("Quality check – Pre start up"),
several per machine. This is their set-up: admins create, edit, publish, export, import and delete
them. Doing a check, printing one, Excel import, approvals and protective equipment or tools per
section are left for later; nothing of them is stubbed.

### Data model

- **A quality check is a template with `kind: 'quality'`.** It reuses everything a template has:
  the `templates` container (`{id}/draft.json`, `{id}/rev-N.json`), one draft with autosave and
  ETags, publishing revisions with change notes, the revision history, read-only revisions,
  delete, and guide images with editable marks. A second container and a second set of endpoints
  would have duplicated all of it for a checklist of the same shape.
- **`kind` defaults to `final` in `TemplateSchema` (zod `.default`).** Templates stored before
  this, drafts and revisions alike, parse as final inspection templates; nothing migrates them.
  New writes carry `kind`. `TemplateSummarySchema.kind` has the same default.
- **`parentId` is the machine: the id of its model's final inspection template.** The quality
  check copies that template's `modelCode` when it is created (or imported) and keeps it: its
  machine is `parentId`, so a final template moved to another model keeps its quality checks
  under it, and the copied code is only a record (the export file names the machine). A save
  never changes a quality check's model, whatever the editor sends.
- **The front page is `quality: { name, department, documentNumber, madeBy, date }`** (200, 200,
  100 and 200 characters; the date "YYYY-MM-DD" or empty). Final inspection
  templates have none: a save of one drops a `quality` sent with it.
- **A quality check is named after its in-process check, not numbered.** The first version had a
  Position ("QC4") and an Operation ("Pre start up") with the title "QC4 · Pre start up"; the user
  would rather not number them, so the front page has one **Name** ("Pre start up") and the title
  is **"Quality check – Pre start up"**, as a template is "Final inspection – RigiMill MG". A name
  that already starts with "Quality check" isn't prefixed twice. Changed before anything was
  released, so no stored data had a position.
- **The template's `name` follows the title** (`qualityCheckTitle`), so lists, summaries, dialogs
  and the delete callout have it without knowing about front pages. The editor keeps it in step as
  the name is typed; the server sets it again on every create, import and save, so the stored name
  can't drift from the front page.
- **Rows gain `how` (2000 characters, lines allowed), `references` (up to 20 strings of 1–100
  characters, trimmed) and `timeHours` (0–999).** Each is left out when empty: the editor stores
  no `how: ''`, no `references: []` and no time for a blank field. "What" is the row's `text`.
  Final inspection templates never set them, and their editor, print, Word export and inspections
  ignore them (an inspection's frozen checklist only ever comes from a final template).
- **Time is hours with one decimal, rounded when typed (`parseHours`), and sums are rounded
  again (`rowsHours`, `totalHours`),** so 0.1 + 0.2 shows 0.3 h. "0,5" is accepted: Swedish
  keyboards type a decimal comma. Something that is not a number (or more than 999) is marked
  invalid and not saved; leaving the field shows the last time again, as the date field does.
- **Pictures and "more information" are the row's `guide`.** The stored verdicts stay `good`,
  `bad` and `info`; a quality check shows them as "Should look like this", "Should not look like
  this" and "Info" (`QUALITY_VERDICT_LABELS`). The guide editor and viewer take a `wording`
  (`guides/wording.ts`): a final inspection's guide reads exactly as before.
- **Department is picked from the settings' Responsible list,** which is the list of departments,
  with "Not set" and, as for a deviation, a department removed since kept as "(not in the list)".
  A new quality check starts in Quality, made by the admin who creates it (their name from the
  people list) and dated today in Sweden: it is the Quality department's document and the
  defaults are what is usually true.

### Publishing and unpublished changes

- **`validateForPublish` takes `kind` and `quality`.** A quality check needs the name on its front
  page (its title follows from it): "The quality check needs a name.", and its "Go to it" focuses
  the Name field. The other rules are the template's; an empty row says "Row 1.a needs
  “What to check”.", the label of the field to fill.
- **`sameTemplateContent` compares the front page and each row's how, references and time,** field
  by field as before. A blank how or an empty list of references is the same as none, so an
  editor that sends either never shows "Unpublished changes" for nothing.

### API

- **The template routes take quality checks; no new registration.** `POST /api/templates` and
  `POST /api/templates/import` accept a body with `kind: 'quality'` (zod unions in shared:
  `CreateAnyTemplateRequestSchema`, `ImportAnyTemplateRequestSchema`). A final body may say
  `kind: 'final'` or nothing; a quality body missing its machine is never taken for a final one.
- **Creating or importing under a machine:** 404 when `parentId` names no template, 400 when it
  names a quality check (one level only). Admins only, as every template write; inspectors read
  the list and published revisions.
- **One template per model holds for final inspection templates only** (`findTemplateForModel`,
  the new-model check, the editor's taken models, the free models of New template and Import
  JSON). Quality checks share their machine's model.
- **`GET /api/templates` lists both kinds, each with `kind` and, for quality checks, `parentId`,
  the front page, the section titles and the total time:** what a quality check's card shows. A
  final template's summary gains nothing but `kind`; the list stays one request.
- **Deleting a final inspection template deletes its quality checks, after it.** The template goes
  first, on its `If-Match`, so a refused delete leaves everything; then each quality check's draft
  and revisions go without a condition (the admin confirmed it in a dialog that names them). A
  failure is logged and leaves a quality check without a machine, which no page lists. Deleting
  a quality check deletes only it.
- **An inspection of a quality check is refused with 400,** "A quality check can’t be used for an
  inspection. Choose the machine’s final inspection template.", before a number is taken: it can
  never succeed, so it is no conflict (409 says the state may change).
- **The seed's "is RigiMill MG imported?" check skips quality checks:** one left with RMMG's code
  must not stop the seed from importing the model's template.

### App

- **A template opens as its machine.** `/templates/:id` is the Final inspection tab and
  `/templates/:id/quality-checks` the Quality checks tab; both show "← Templates", the model's name
  as the page's heading (h1) and the two tabs. The tabs are links with `aria-current`, not ARIA
  tabs: each is an address, so Back, Reload and a shared link land on it. "Quality checks (n)" is
  the tab's accessible name; the count is a badge on screen.
- **On the Final inspection tab the template's own title is an h2** under the machine's heading,
  for admins (the editor) and inspectors (the latest revision) alike. The e2e tests that looked
  for it as the h1 now look for an h2. A template's revision page keeps its h1.
- **A quality check's pages: `/templates/:id/quality-checks/:qcId` and `…/revisions/:n`,** with
  breadcrumbs (Templates › machine › Quality checks) and the title as the h1. A quality check's
  id at a template's address, or under the wrong machine, is sent to its own address (and a final
  template's id at a quality check's address to its own), so old links keep working.
- **One editor for both kinds.** `TemplateEditor` reads the draft's `kind`: a quality check gets
  the breadcrumbs, its front page card (`QualityFrontCard`), its row cards, its wording in the
  publish, delete and leave dialogs, revisions under its address and no Print preview. The
  document components take a `variant`; `EditableSection` draws a quality check's section as a
  band (number, title, "5 rows · 0.8 h", ⋯) over its rows as cards (`QualityRow`). Drag and drop,
  focus, Undo and the actions are the same code (`useDocumentActions` gained `setFields`).
- **A row card:** the pictures on the left, then the ref and What (one line: `Enter` adds a row
  below, as in a final template), How (lines of its own), the references as chips with an input
  after them (`Enter`, comma or semicolon adds; pasting a list splits it; duplicates are skipped
  ignoring case), more information (two lines) and, on the right, the time and a ⋯ menu that is
  always shown (Pictures and information, Duplicate, Delete): on a card one menu is easier to
  find than icons that appear on hover. On a narrow sheet only What sits beside a small picture;
  the rest spans the card, which on a phone was otherwise a column a few words wide.
- **`Backspace` in an empty What removes the row only when the row has nothing else** (how,
  references, time, pictures). Clearing What to retype it should not lose the rest; the ⋯ menu
  deletes such a row, with Undo, as any row with content (`rowHasContent`).
- **The picture tile** shows the first picture as marked up, whole (`object-contain`, as
  everywhere marks may sit near an edge), with its verdict as a ✓ or ✗ badge: the words don't fit
  a 72–144 px tile, and they are in the tile's accessible name and the dialog. "+2" says how many
  more. Without pictures it says "Information" when there is some, or offers "Add pictures".
- **In the pictures dialog the verdict picker stacks its three choices** in a quality check: "Should
  not look like this" doesn't share an 11.5rem tile's width with two others.
- **Read-only (inspectors, revisions):** the same cards without inputs; a row without pictures
  keeps the pictures' column empty on a wide sheet, so every row's text starts in one line.
- **Templates page:** the list and cards show final inspection templates only, each with "1
  quality check" / "No quality checks", their names (a never-published one marked "(draft)")
  in the card's footer and a Quality checks column in the list. After deleting a template the
  callout adds how many quality checks went with it (counted when the delete is confirmed, as
  the list reloads without them).
- **The Quality checks tab** shows the cards (title, department · document · made by, revision,
  numbered section chips, rows, time, last edit) and, for admins, Import JSON, New quality check
  and a dashed New quality check card. The whole card is the link; its "Open" only shows that
  (hidden from screen readers, so it is no second stop).
- **A name another quality check of the machine already has is pointed out, not refused.** Two
  checks of one name may be wanted for a while (a copy being reworked); the hint says so.
- **The sidebar's group is now "Quality"** (the loading skeleton's label bar is shorter to match):
  Inspections and Templates cover final inspections and quality checks.
- **Quality checks don't print yet:** no Print preview in their editor or views, and the print
  route says so with a link back. The new inspection page offers final inspection templates only.

### Export and import (JSON)

- **A quality check file has a format of its own, `modig-final-inspection/quality-check`
  version 1:** `{ quality, modelCode, modelName?, sections }`. The template file format is
  unchanged, so every template file exported so far imports exactly as before. Each import
  refuses the other's file by its format, in the browser with a message that says where it
  belongs ("This is a quality check file. Import it on the Quality checks tab of a machine’s
  template.") and in the API with 400.
- **Export JSON writes the draft as shown, unsaved changes included,** named "Quality check – Pre
  start up – RigiMill MG.json" (the title, then the machine), with the characters file
  systems refuse replaced, as a template's.
- **Import JSON is on the machine's Quality checks tab** and always makes a new draft of that
  machine, with the name chosen in its dialog (the file's to start with) and
  the rest of the file's front page.
- **An imported quality check always gets new section and row ids.** A template keeps the file's
  ids when they are free so its rows keep their Insights history; quality check rows have no
  history yet, and the usual case (a copy next to the original on the same machine) would need
  new ids anyway. Pictures not stored in this installation are left out and counted, as for a
  template.

### Tests

- **shared:** old templates parse as final; a quality check's fields; references and times out of
  bounds; `validateForPublish` for quality checks; `sameTemplateContent` with the front page and
  row fields; the request unions; the quality check file (both ways refused); the hours, title and
  `rowHasContent` helpers.
- **api** (`quality-checks.test.ts`): create (201 with the defaults, 404, 400 for a quality parent
  or no name, 403); one template per model unaffected; the list's kind, parent, front page,
  sections and time; saving (name follows, model and machine stay, front page kept when left
  out, none on a final template, 400 for bad fields); publish (name required, revision frozen,
  a changed time is an unpublished change); delete cascading (drafts and revisions; another
  machine's kept) and alone; import (fresh ids, chosen title, missing pictures counted, each
  file refused by the other import, 404, 403); and inspections refusing a quality check. The
  existing template tests expect `kind` in drafts and summaries. **seed:** a quality check with
  RMMG's code doesn't stop the import.
- **app:** the row field edits (`setRowFields`), references, the names line and grouping, the
  links, and the quality check file (name, parsing, the template file refused); the template
  file parser refuses a quality check file.
- **e2e** (`quality-checks.spec.ts`, 5 tests; their machine and its quality checks deleted after
  each test): set up and publish from the tab, export and import, delete with the machine,
  inspectors read-only and refused, and no inspection from a quality check. The template list
  test expects the Quality checks column, and the editor title is an h2 on the machine's page.

## Quality checks: doing them (2026-11-06)

The user wanted final inspections and quality checks apart in the sidebar and when creating one,
and then (a scope change during the work) Insights apart for the two as well, with the same
report. Templates stay as they were: a machine's final inspection template and its quality checks
are still set up under Templates.

### Data model

- **A quality check done on a machine is an inspection with `kind: 'quality'`.** It reuses the
  whole inspection machinery (blob, list metadata, autosave with ETags, results, deviation photos,
  extra deviations, finalise, reopen, delete, conflicts, keys). `InspectionSchema.kind` defaults
  to `final` (zod `.default`), so every stored inspection parses as a final one; nothing migrates.
  `InspectionSummarySchema` has the same default. The kind is the template's kind, decided by the
  server when it is created, and never changes.
- **The frozen copy keeps the quality check's front page:** `templateSnapshot.quality` (name,
  department, document no., made by, date) next to the name and sections, whose rows already
  carry how, references, time and pictures. `snapshotTemplate` adds it only for a quality check.
  The check never reads the live template again, so deleting the quality check (or its machine's
  template) leaves every check done intact, as for inspections.
- **The front page is the inspection's, with what a check along the build has:** Machine (the
  model, fixed from the template), Serial number (required), Date and Checked by (the
  participants list, under that label). Machine name, location and the machine photo are dropped:
  an in-process check has no customer or delivery yet, and the machine is the model plus its
  serial number. They stay in the schema (one front page shape for both kinds) and are kept empty:
  the server sets `machineName` and `location` to '' and drops a photo on every create and save of
  a quality check, whatever is sent. Finalise asks a quality check for its serial number only
  (`validateForFinalise` takes the kind).
- **Numbers: `QC-2026-0001`, a series of its own,** counted in `config/quality-check-counter.json`
  by the same race-safe code as `FI-` (conditional write on the version read, retries with growing
  random waits, a lost counter carrying on from the highest number of its own series, the year in
  Swedish time). `INSPECTION_NUMBER_PATTERN` takes both prefixes; `parseInspectionNumber` reads
  either. The list sorts both series by year and sequence.
- **The summary gains `templateName`** (the frozen checklist's name): the quality checks list
  shows and searches the check's title without reading each blob. Older summaries default it to
  '' (final inspections, which never show it).

### API

- **`POST /api/inspections` takes both kinds.** The body is read as `{ templateId, front }` first;
  once the template is known, the front is checked against its kind's request:
  `CreateInspectionRequestSchema` for a final template, `StartQualityCheckRequestSchema`
  (`serialNumber`, `participants`, `date`) for a quality check. Problems are still a 400 with the
  zod issues under `details`. One change of order: an unknown template is now a 404 even when the
  front is invalid too. An unpublished quality check is a 409, "Publish the quality check first.",
  before a number is taken. The old 400 refusal is gone.
- **The list returns both kinds** with `kind` and `templateName`; the app filters (one request,
  shared by both lists through TanStack Query's `select`). Read, save, finalise, reopen and delete
  are unchanged apart from their messages ("This quality check is finalised – …").

### Insights: final inspections and quality checks apart

The brief first said to keep quality checks out of Insights; the user then asked for Insights of
quality checks too, "separate … similar report functionality". So they are counted, never mixed.

- **Each deviation row says its kind** (`kind`, plus `checkName`, the checklist's name). Rows
  written before have neither; `DeviationRowSchema` defaults them to `final` and '', and the next
  write of their inspection adds them (the sync compares the new columns too). No migration.
- **Every Insights query has a kind** (`?kind=quality`; final when absent, so every link and test
  from before is unchanged). The aggregation takes only the summaries of that kind and only rows of
  that kind belonging to them: the model choices, the first date, the counts, the first-pass rate,
  the charts, the top 10, the CSV and the report's list. For quality checks the table is queried
  with `kind eq 'quality'`; for final inspections it can't be (the table leaves out rows without
  the property under any condition on it), so their rows are filtered after reading.
- **Which quality check: by title, on every machine that has it** (`?check=Quality check – Pre
start up`). "Pre start up" is the same step on every machine, so its numbers across machines are
  what Quality wants to compare; the model filter narrows it to one machine, which is the same as
  one template. The title is the one frozen in each check, so a renamed quality check shows under
  its old and new titles until the old checks age out of the period. The choices
  (`checkNames`) are every title done, whatever the other filters, as the model choices are.
- **The page:** a segmented **Final inspections | Quality checks** switch above the filters
  (`aria-pressed` buttons, kept in the URL). Switching keeps the period, model and in-progress and
  drops the check. The previous numbers are kept on screen (dimmed) while the next load, but not
  across a switch: they would stand under the other kind's words. All wording comes from one
  table (`features/insights/words.ts`): "Quality checks finalised", "Deviations per check",
  "Of checks", "in 2 quality checks"…
- **CSV:** a final inspection's file is byte for byte as before (18 columns). A quality check's has
  the same columns with `checkName` where `machineName` was (a quality check has no machine name)
  and is named `Quality check deviations … , RMMG, Pre start up.csv` (the title without "Quality
  check –"). A title may hold characters a header can't carry, so the API sends an ASCII
  `filename` and the real name in `filename*` (RFC 6266), which the app now reads first.
- **Report:** "Quality check deviation report", with a Quality check line in what it covers
  ("All quality checks" or the title), the kind's words throughout, and the deviation list naming
  each check by its title where an inspection has its machine. The PDF is named like the CSV.

### App

- **Sidebar in four groups:** _Final inspection_ (Inspections), _Quality check_ (Quality checks,
  a ShieldCheck icon), _Setup_ (Templates) and _Admin_ (Insights, Settings). The gaps between
  groups are a little smaller (20 px) so four groups and the user panel fit a 720 px laptop; the
  loading skeleton draws the three groups everyone has.
- **The lists are one page with a kind** (`InspectionsPage kind="quality"`): the same search,
  filters, remembered search (a key per list), empty state and deleted notice, in each kind's
  words; the quality checks table has Machine (the model) and Quality check (the title) where the
  inspections table has Machine and Model. The inspections page keeps its heading "Inspections"
  (the group above it says Final inspection) but its button and new page say **New final
  inspection**. The template side keeps "New quality check" for creating one; doing one is
  **Start a quality check**, so the two never share a name.
- **Start a quality check** offers machines grouped by the quality checks' own model code (the
  code each check copied from its machine, which the check records), only quality checks that are
  published and whose machine's template still exists (a delete that stopped half way leaves
  checks no page lists), one machine or one check picked for you, and Checked by starting with the
  signed-in person. The check's department and document number come from its published revision.
- **One editor, a quality mode.** `/quality-checks/:id` is `InspectionPage kind="quality"`, and
  each address sends the other kind to its own (`/inspections/{id}` of a quality check lands on
  `/quality-checks/{id}`). `InspectionEditor` reads the kind: the header names the machine (the
  model) and the check, Print and Preview are hidden, the front page is `QualityCheckFrontCard`,
  the checklist `QualityCheckSheet`, and the dialogs, notices and leave warning say "quality
  check". The Deviations tab is the inspection's (its "they print on the report" hint left out).
- **Row cards, as the approved mockup, in the app's parts.** Each section is a grey band (number,
  title, "5 rows · 0.6 h", "3 / 5 done", Set remaining to OK) over white cards. A card: the first
  picture (the template editor's `PictureTile`: ✓/✗, "+1"), then ref and What, How, references,
  time and the start of More information, and **Pictures and information**; on the right OK / NOK
  / N/A and the comment. The mockup's in-card expansion of the pictures became the existing
  read-only pictures dialog (`GuideViewer` in the quality wording), as the brief asked; its
  section chips in the tablet header and the protective-equipment icons were left out (the app's
  sticky header, progress and Continue at do that job; equipment per section is for later).
- **Laid out by the sheet's width** (container queries): ≥ 52rem (a PC, a tablet on its side
  beside the sidebar) picture | text | buttons and comment; ≥ 34rem (a tablet upright) the buttons
  and comment under the text; a phone a small picture beside the text and the rest across. Each
  cell is placed with `grid-column: start / span n` at every width: a `col-span-*` at a larger
  width would otherwise reset a `col-start-*` from a smaller one (the shorthand wins), which first
  dropped a NOK card's picture to its bottom. The picture spans only the rows a card has, so an OK
  card has no empty band under it.
- **The status buttons are large toggles:** 44 px high, 52 px on a touch screen; the chosen one in
  its status colours, a NOK filled red (`nok-solid`, white text in both themes). As in a final
  inspection they are not Tab stops: the focused card takes the keys (`rowCommand`, the same
  actions via `useChecklistActions`), and Tab goes from the card into its comment and NOK fields.
  `G` opens the pictures (the hint bar says "Pictures" there).
- **A NOK card opens the deviation's fields on the card:** Responsible, Category, Severity and up
  to two photos with `AnnotatedPhotos`, added there (camera, file, paste, drop) rather than only on
  the Deviations tab, because on a tablet the photo is taken at the machine right after NOK.
  Responsible is shown on NOK cards only (a final inspection has it on every row): on a card it
  belongs to the deviation, as in the mockup.
- **Read-only (finalised):** the same cards with the status as a mark, the comment and the NOK
  fields as text, photos in the viewer.

### Printing, Excel and approvals

Not this round, as the brief says: no Print / Save PDF, Preview or Word export on a quality
check, and `/quality-checks/{id}/print` (or `/inspections/{id}/print` of one) says "Quality checks
don't print yet" with a link back.

### Tests

- **shared:** old inspections, summaries and deviation rows parse as final; a quality check
  (QC number, frozen front page and row fields); the snapshot of a quality check and of a final
  template; QC numbering and `parseInspectionNumber`; the start request; finalise rules by kind;
  the Insights query's kind and check, and the aggregation keeping the kinds apart (final numbers
  unchanged by quality checks, quality numbers by check and machine); `qualityCheckShortName`.
- **api** (`quality-check-inspections.test.ts`, plus numbering in `lib/inspections.test.ts` and
  rows in `lib/deviations.test.ts`): create from a quality check (kind, QC number, frozen copy,
  no photo), the two series side by side, four at once, unpublished refused without a number,
  the start request's rules, a final template unchanged; list with kind and title; save keeping a
  quality check's front page; finalise without a machine name, locked in its words, reopen by an
  admin only; delete with its rows; kept when its quality check is deleted; Insights, CSV and the
  report rows apart by kind and check, with the encoded file name. The old refusal test is gone.
- **app:** the list filter and its remembered search per kind, the Insights filter's kind and
  check, the report model in a quality check's words, the start page's choices, and the download
  file name.
- **e2e** (`quality-check-inspections.spec.ts`, 4 tests; each test's machine, quality check and
  everything done with them deleted afterwards): the sidebar's groups; an inspector starting,
  filling in and finalising one; Insights and its report by kind; reopen and delete. Changed: the
  quality-checks spec's last test (the API now starts a quality check), the smoke test's "New
  final inspection", the deviation table's two new columns, and the sidebar checks.

## Green annotation colour (2026-11-06)

- **Green is a fifth colour for photo marks,** `#22C55E`, shown right after red in the editor's
  colour picker (Red, Green, Cyan, Yellow, White), for marking what is right next to what is
  wrong. Brief §5.4 named four colours; the others are unchanged and red stays the default.
- **Green keeps the soft shadow only, like red and cyan:** a black-and-white printer turns it into
  a grey of 54 % luma, as dark as cyan, so it stays clear of a light machine surface without the
  dark outline yellow and white get.
- Stored marks carry their colour as text, so no data changes; older apps would draw a green mark
  in green too.

## Deviation log (2026-11-06)

The user wanted "a summary list of all the deviations divided in final inspection and quality
checks like before", like their Excel log ("Avvikelselogg QC": one line per deviation with machine,
model, ID, description, action, category, Open/Closed, found and done dates, department), with
the overview Excel lacked: what is still open, per machine and per department. Then, during the
work, a Machine ID on quality checks too ("Standardize it to make sense").

### Follow-up: apart from the inspection

- **A follow-up per deviation:** `status` open or closed (none: open), `action` (what was done,
  optional), `closedOn` (a day, today unless another is given), `closedBy` (a name as typed, the
  signed-in person's unless another is given), `updatedAt` and `updatedBy`. Keyed by the
  deviation's key, as the table's RowKey: a NOK row's item id or an extra deviation's id.
- **Stored in a blob of its own per inspection, `follow-ups/{inspectionId}.json`**, in a new
  `follow-ups` container (Bicep, the seed and the API's `ensureStorage` create it; an existing
  deployment gets it on the API's first storage call). Not in the inspection blob: closing a
  deviation must not change the inspection's ETag, which its open page autosaves against
  (`If-Match`), and it doesn't change what the inspection found (the row stays NOK). Written over
  the version read (If-Match, or If-None-Match for the first), read again on a 412, so two
  deviations of one inspection closed at once both land.
- **Allowed in progress and finalised**, for inspectors and admins: following up is everyday
  work, not an admin's, and a finalised report is exactly what gets followed up.
- **Reopening keeps the action** and clears the day and name: whoever picks it up sees what was
  tried. Editing a closed one's action keeps its day and name unless they are changed.
- **A follow-up outlives its deviation.** A NOK set back to OK drops the deviation from the
  table and the log, as before; the follow-up stays in the blob and applies again if the row is
  NOK again, since it is the same checkpoint of the same inspection. Pruning it would lose a
  closure to a slip of the keyboard (OK, then NOK again), and the leftovers are a few bytes.

### The table carries it

- **Each deviation row gets `deviationNumber` (D-03) and the follow-up's `status`, `action`,
  `closedOn`, `closedBy`**, so the log is one table query. The number isn't derivable from the
  rows alone (extra deviations are numbered in the inspection's array order), so it is stored;
  rows written before it are numbered on reading in the Deviations tab's order (rows by ref,
  extras by when they were recorded), and get the real one at the next write. Old rows read as
  open. Insights still selects only its own columns, so its numbers, rows and report are
  unchanged.
- **`syncDeviations` reads both blobs** (the inspection given, its follow-ups from storage) and
  returns the follow-ups' ETag. `syncSettled` checks both ETags after its sync and syncs again
  when either changed. A follow-up PUT writes its blob and then runs the same `syncSettled`.
  Every write syncs after it, so whichever sync lands last has read both blobs after every write
  before its check: a save's sync that read the follow-ups just before a deviation was closed is
  caught by its own check (a test drives exactly that interleaving), and a rebuild of the table
  from the blobs brings the follow-ups back.
- **A PUT whose table sync fails answers 503** ("saved, but the deviation log could not be
  updated. Try again."). Unlike the other 503s something was stored, but sending the same request
  again is safe (it sets values), and a 200 would leave the log showing the old state with nothing
  to repair it, as a finalised inspection may never be saved again.
- **Deleting an inspection deletes its follow-ups** (best effort, like its rows), and a sync that
  finds its inspection deleted removes a follow-ups blob written meanwhile.

### API

- `GET` and `PUT /api/inspections/{id}/follow-ups/{key?}`: one registration with an optional key
  (23 registrations now, well below the 40 that trouble SWA). The PUT body is a discriminated union
  on `status` (`FollowUpRequestSchema`); the server applies it with `applyFollowUp` (shared, so its
  defaults are tested once). 404 when the key isn't a deviation of the inspection now.
- `GET /api/deviations` and `/api/deviations/export.csv` take `kind` (final by default, as
  Insights) and `status` (open by default, as the page), `model`, `resp`, `category` (ignoring case;
  `-` for none, as no list entry is a lone dash) and `q`. Quality checks' rows are picked by the
  table (`kind eq 'quality'`), final inspections' after reading (rows without `kind` are theirs),
  as in Insights; only rows of inspections still listed count. One shared `matchesDeviationLog`
  filters in the API and on the page, so the CSV is what the page shows.
- **The CSV has the Excel log's columns** in words, not the Insights CSV's camelCase: Machine ID,
  Serial number, (Quality check,) Model (by name), Inspection, Date, Deviation ID, Description
  (ref and checkpoint), Comment, Action, Category, Severity, Responsible, Status, Found, Closed,
  Closed by. Same format (semicolons, BOM, CRLF, formula guard); the CSV helpers moved to
  `api/src/lib/csv.ts` for both.
- **Found is the day the deviation was first recorded** (the row's `createdAt`, Swedish time), not
  the inspection's date: a quality check done over a few days finds its deviations on different
  days, and that is what "open for more than 30 days" should count from. A table rebuilt from the
  blobs would date them to the rebuild, as Insights' `createdAt` already would.

### The log page

- **`/deviations/final` and `/deviations/quality`** (`/deviations` leads to the first), a
  "Deviations" item (ListChecks icon) under Final inspection and under Quality check, for
  everyone; NavLink marks the one shown. The loading skeleton draws two links in those groups.
- **The page loads every deviation of its kind once and filters in the browser**, with the same
  shared matcher: a search or filter shows at once, and the summary counts what the status filter
  hides (Closed while Open is shown). Filters live in the address; the search is kept as typed.
- **Summary:** Open (the oldest's found date), Closed (its share), Open more than 30 days (red when
  any), under every filter but the status; then the open ones per responsible as chips (spellings
  that differ only in case count together), which pick that responsible.
- **Grouped by machine** (the scope change): Machine ID and serial number, ignoring case and
  spaces, of a model, plus the title for a quality check (a machine has several). Usually one
  inspection; a machine inspected twice keeps both under one header, each linked, and each
  deviation's ID ("QC-2026-0004 · D-03") says which it came from. Machines with open deviations
  first, then the newest; their deviations oldest inspection first, by number. "3 open · 9 closed"
  and a bar count every filter but the status.
- **A table from a 58rem card (a desktop), a card per deviation below** (tablets and phones): the
  six columns don't fit a tablet beside its sidebar. Both are rendered and one is hidden, as the
  inspections list does with its cells, so only one is in the accessibility tree. Severity is a
  badge by the ID rather than a column of its own.
- **Close…, Edit, Reopen…** (`FollowUpActions`, also on the Deviations tab): Close and Edit share
  a dialog (Action taken, Closed on with today as the latest day, Closed by); Reopen asks first,
  with a primary button (`ConfirmDialog` gained `confirmVariant`: reopening isn't destructive).
  Each button carries the deviation's ID for a screen reader. The change is optimistic in both
  caches (the log and the inspection's follow-ups), rolled back with a message if it fails; a
  success notice says where a closed deviation went when the list shows open ones only.

### The inspection's Deviations tab

- **Each card gets a follow-up bar**: Open/Closed, when and by whom, the action, and the same
  buttons, also when finalised. The follow-ups are read when the tab is first shown. A deviation
  just marked may not be stored yet (the PUT would be a 404), so a close saves pending edits first
  (`saveAll`), as Print does.
- **`?tab=deviations&deviation={key}`** opens the page on that tab with the focus on that card:
  the log's links. A quality check's address keeps them when it redirects.

### Machine ID (scope change)

- **"Machine ID" for both kinds**, the machine as the ERP (Monitor) knows it, with the hint "As in
  Monitor, e.g. Magellan#1". Stored in `front.machineName`, so nothing migrates; only the words
  changed (labels, list columns, search, "Machine ID is required", "The front page needs a Machine
  ID."). Printing and Word are the other change's.
- **Quality checks have one**: required to start one and to finalise one (the finalise rule is now
  the same for both kinds), on the start form and the front page in a final inspection's order
  (Machine ID, model, serial number, date, Checked by), in the header ("QC-2026-0004 ·
  Magellan#1") and in the list's Machine ID column with the model under it. The API stopped
  blanking it. Older quality checks show "—" and need one before they can be finalised.
- **The deviation rows carry it** for quality checks too; the quality checks' Insights CSV has
  `machineName` back, with `checkName` after it (its tests changed), and the Insights report's
  deviation list names a check "Magellan#1 · Quality check – Pre start up".

### Tests

- **shared** (`deviationLog.test.ts`): the request contract, `applyFollowUp`'s defaults, old rows
  as open, numbering older rows, the found day in Swedish time, overdue, the filters and search;
  the Machine ID rules in `inspections.test.ts`.
- **api** (`functions/deviation-log.test.ts`, 20 tests): close, edit, reopen; the inspection's ETag
  untouched; finalised and quality checks; 404 and 400; roles; two at once; kept across a save, a
  rebuild and a save's sync racing a close; delete; the log's order, filters and old rows; deleted
  inspections left out; the CSV. Changed: the table's columns (25) and the batch count (the
  remaining extras renumber), the quality check tests for the Machine ID and their CSV.
- **app** (`features/deviationLog/model.test.ts`): the address, grouping by machine (two
  inspections of one, a machine's quality checks apart), order, the summary and chips, the
  menus' choices; the list search by Machine ID; the report's quality check names.
- **e2e** (`deviation-log.spec.ts`, 3 tests): the sidebar items; a quality check's deviation in its
  own log, closed with an action, closed on its Deviations tab, reopened there; a fresh NOK
  closed from the tab (saved first), a finalised inspection followed up, a non-deviation refused,
  and the CSV. Changed: the sidebar groups, "Machine ID" labels, the quality checks' Machine ID
  and their CSV, and the deviation table's new columns.

## Quality checks: printing (2026-11-06)

The user wanted to print a quality check from its page, with a preview, either the entire report
or only the deviations: it is printed, kept at the machine and signed off there.

### One print machinery, two documents

- **A quality check's report is a second document in the same machinery,** not a second one: the
  print route, `PrintView` and its toolbar, the preview dialog, the card pages (`useCardPages`),
  the images, readiness, `FittedPages` and the page footer. `Printout` is the union of the final
  report's `PrintModel` (now with `document: 'checklist'`) and `QualityPrintModel`
  (`document: 'quality'`, `features/print/quality/model.ts`, pure and unit-tested);
  `PrintDocument` hands a quality model to `QualityPrintDocument`. The quality model keeps its
  cards in the final report's shape (`deviations: { kind: 'cards', cards }`), so the cards, their
  packing and the 2-or-4 default work unchanged.
- **Final inspection printing is unchanged** but for one label: "Machine name" is "Machine ID" on
  the front page and in the Word file (a scope change: the field is the machine's ID in the ERP,
  "Magellan#1"). The new `DeviationCards` options (title, sign-off, lead, closing) default to
  what a final report had.
- **Addresses:** `/quality-checks/{id}/print?mode=report|deviations[&deviationsPerPage=2|4]`, the
  entire report by default. `InspectionPrintPage` takes the kind as `InspectionPage` does and
  sends the other kind to its own print address with the same query; the "Quality checks don't
  print yet" page is gone. `mode` is the final report's parameter with the quality check's own
  values; a final report's `blank` on a quality check prints the entire report.
- **The page's header** has Preview and Print / Save PDF in the same place as on a final
  inspection. The Print menu offers _Entire report_ and _Only deviations_ (there is no blank
  form of a check done). Printing saves pending changes and opens the print tab, which prints
  once, as before (`openPrint` now takes the address).
- **The preview dialog takes its choices from the document.** An inspection's is the segmented
  _Blank checklist | Report_ as before; a quality check's adds _Deviations: 2 per page | 4 per
  page_ next to _Entire report | Only deviations_, so what is previewed is what prints (Print
  passes both on; a layout not picked is left to the print route's default, the same rule).
- **No Word export, no reference images, no guide pictures.** Pictures show how a row should
  look in the app; printed, they would make the report long. The Word export is left out of the
  toolbar for a quality check (as the brief says).

### What prints

- **Front page:** the final report's paper (logo, number, title at 24 pt as a check's title is
  longer, company name, finalised or the boxed "NOT FINALISED – DRAFT REPORT"). Machine ID,
  Machine model, Serial number, Date, Checked by and Department, as one list of fields. **No
  document number, made by or date of the quality check** (a scope change: document control is
  the app's, as for final inspections); the revision prints as on a final report, "Rev: N" bottom
  right, and "Rev N" after the subject in the print toolbar. Without a machine photo, the room
  goes to a **summary in numbers** (Rows, OK, NOK, N/A, Not filled only while some rows are, and
  Deviations, the last two shaded), and the sign-off lines sit at the foot of the page, as a
  final report's signatures do: _Checked by · Signature · Date_ and _Deviations closed / approved
  by · Signature · Date_.
- **Checklist:** the final report's tables (repeating heads, rows never split, the same keep
  rules) with four columns, Ref | What to check | Result | Comment. The section's heading has its
  rows and time on the right. How is a smaller line of its own (its line breaks kept), the
  references smaller and grey, joined by " · " as on screen. The result is one column, not three
  tick columns: a mark and a word, a NOK boxed so it stands out in black and white, an unfilled
  row "Not filled". **A NOK row's comment starts with its card, "D-02 · Major"**, so the paper
  leads from the row to the card to sign off. A row with very long how or comment text keeps its
  neighbours off its page as a long comment does on a final report.
- **Deviation cards:** the final report's, under "Deviations", with the sign-off a check needs at
  the machine instead of "Closed · Sign · Date": _Action taken_ on two lines, then _Closed on_
  and _Signature_, lines 7 mm apart to write on. With 4 to a page the lines run across the whole
  card under the text and photos: in the text's column they were too short to write on.
- **Only deviations:** a short header on the first page (logo, number, title, the draft marker
  while in progress, Machine ID, Machine model, Serial number, Date, Checked by and the number of
  deviations, "—" for what is empty), the cards, and _All deviations closed · Name · Signature ·
  Date_ after the last card. Both blocks are measured with the cards: `packCards` takes `first`,
  the room the header takes from the first page, and `closingFits` says whether the closing
  sign-off fits under the last page's cards; when it doesn't, it gets a page of its own with the
  heading, rather than pushing a card off a page. Without deviations the page says "No deviations
  recorded." and has no closing sign-off, as there is nothing to close.
- **Footer:** "QC-2026-0004 · Quality check – Pre start up · Magellan#1 · RigiMill MG · S/N …",
  as the brief has it (no company name or revision, unlike a final report's), the Machine ID cut
  at 60 characters as a final report cuts its machine and left out when a check has none (checks
  done before it was asked for), and "Not finalised" while in progress, as on a draft final
  report. The file name:
  `QC-2026-0004 Magellan#1 RigiMill MG – Pre start up – Quality check report`
  (`– Draft report`, `– Deviations`, `– Draft deviations`).

### Tests

- **app:** `print/quality/model.test.ts` (the front page's values and counts, revision, no
  document number, sections and rows with how, references and the card of a NOK row, the cards
  with extra deviations, only deviations, in progress, no deviations, no machine ID, a long one,
  a check without its front page or rows, the images), `packCards` with `first` and
  `closingFits`, the quality print links and modes; the final report's tests now expect "Machine
  ID".
- **e2e:** `quality-check-print.spec.ts` (4 tests): Preview in both modes and both layouts; the
  print page from the inspection print address, printed to PDF in both modes and measured (A4,
  footer and page numbers, no Word export); Print / Save PDF → Only deviations printing once in a
  new tab; a check without deviations. `quality-check-inspections.spec.ts` now expects Preview on
  the page and its print address to lead to the report.
- **Visual review** without the local stack: the app from Vite alone with every API call mocked
  (Playwright `page.route`), the preview and the print page screenshotted in both modes, 2 and 4
  to a page, a check in progress without a machine ID, one without deviations, and one whose
  closing sign-off needs a page of its own, and printed to PDF to check the page breaks.

### Not this round

A blank quality check form to fill in by hand (the template side's print preview of a quality
check still says it doesn't print yet), Word export of a quality check, and its guide pictures in
an appendix.
