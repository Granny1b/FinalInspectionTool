# Decisions

Judgement calls made while building, newest phase last. Each line: the decision, then why.

## Phase 1 – Foundation

### Worth reviewing first

The calls with product, security or cost impact. Each is explained in its section below.

- Node 22 instead of the brief's Node 20 (Platform).
- Free plan: anyone with a Microsoft account can sign in, so access depends only on the invited
  roles `inspector` and `admin`, written in lowercase (Auth).
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
  table to look names up in.

### Auth

- **Free plan with the pre-configured Entra ID provider; access is gated only on the custom roles
  `inspector` and `admin`, never on `authenticated`.** On the Free plan anyone with a Microsoft
  account can sign in, so the invited role is the only gate. At most 25 invited users.
- **Login is a static `/login.html`, not an SPA route.** The app bundle itself stays behind the role
  check. After sign-in users land on `/`: SWA's 401 redirect drops the deep link, which is
  acceptable for this tool.
- **Each pre-login file has its own exact anonymous route** (`/login-assets/auth.js`,
  `/login-assets/auth.css`), never a wildcard. The SWA CLI matches routes on the raw path, so
  `/login-assets/..%2fassets/…` matched `/login-assets/*` and served the role-gated bundle to
  anyone. A new pre-login file needs its own route.
- **`/api/me` derives the display name from the email.** SWA's `x-ms-client-principal` carries no
  claims (no name) on managed functions, and the brief rules out a user table.
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
- **`apiFetch` leaves the app only for SWA's own answers.** An expired session (a redirect, or a
  401 without an `ApiError` body) goes to `/login.html`; a 403 without one (no app role) goes to
  `/forbidden.html`. A JSON `ApiError` 401 or 403 comes from a function and is thrown for the page
  to show. Navigating on the API's own 401 would loop, because the login page sends every role
  holder straight back to `/`.
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
- **"Already imported" means a `templates/*/draft.json` with `modelCode: RMMG` exists.**
  `rev-N.json` is written before `draft.json`, so an existing draft means the import completed. A
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
  page.** The page is unloading; settling would only flash an error state.
- **`apiFetch`'s `schema` is typed structurally (`{ parse }`).** A non-JSON 2xx and a schema
  mismatch both become `ApiRequestError('internal')`, so the UI deals with one error type.
- **`/api/me` is cached forever (`staleTime: Infinity`).** Roles only change at the next sign-in.
  `useCurrentUser()` reads the cached query instead of a React context, because pages render only
  after `/api/me` has loaded.
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
  New template: phase 2, Export CSV: phase 6). The settings form says "a later phase" because the
  brief schedules no phase for it.
- **Inspectors see Templates without actions.** Insights and Settings are hidden from their
  navigation and guarded by `RequireRole` (UI only; the API checks again).
- **The Settings page carries the brief's invite how-to:** portal steps, the
  `az staticwebapp users invite` command, the 25-user cap, and "role changes apply at the next
  sign-in".
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
  idempotent calls per cold start in Azure. Direct `containerClient()`/`deviationsTable()` users
  must await it themselves.
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
