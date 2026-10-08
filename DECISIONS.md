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
  Export CSV: phase 6; New template arrived in phase 2). The settings form says "a later phase"
  because the brief schedules no phase for it.
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
  (successes only). Settings have no ETag yet (no settings editing). Create answers 201 without a
  `Location` header; `upload-url` answers 200 (the browser's upload creates the image).
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
- **Spare rows are previewed faint and hidden from screen readers** (one sentence says how many),
  before **+ Add row**, so the lettering continues as on paper.
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
  inspection – {model}" and follows the model until edited.
- **Spare rows accept whole numbers in the schema's range (0–30);** anything else reverts on blur.
- **"Who" is the stored email,** with dates in en-GB ("6 Oct 2026, 14:32"), so a Swedish browser
  doesn't mix Swedish month names into the English UI.
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
  `functions/inspection-state.ts` (finalise, reopen) and `functions/resp-suggestions.ts`.
- **`writeJson` takes optional blob metadata;** existing callers are unchanged.
- **API tests:** `resetStorage()` also clears inspections, the counter and every deviation row,
  row by row (deleting the table would defeat `ensureTable`'s once-per-process memo).
  `sampleInspection()` builds a valid inspection.

### Deviation table

- **Each write makes the table equal `deriveDeviations(inspection)`:** one range query reads the
  inspection's rows (RowKeys from `{id}_` up to, not including, ``{id}` ``: the backtick is the
  character after the underscore; built with the SDK's `odata` template), all 17 columns are
  compared, and only new or changed rows are written (upsert, Replace) and vanished ones deleted.
  Unchanged saves write nothing; most autosaves touch zero or one row.
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
  the sync and the resp suggestions need the table.
- **`createdAt` is the time of the sync that first wrote the row,** as an ISO string, kept on
  later saves, so KPIs over time don't move with every edit.
- **Column types:** `templateRevision` a number, `finalised` a boolean, `inspectionDate`
  (YYYY-MM-DD) and `createdAt` (ISO, UTC) strings; both sort correctly as text for range
  filters.
- **`resp` is stored untrimmed,** mirroring `deriveDeviations`. Only the suggestions trim.
- **Resp suggestions** filter on the server (`resp ne ''`) and select only `resp`. Values are
  trimmed; spellings differing only in case count as one name, offered in the spelling most rows
  use (the first found on a tie), sorted with a Swedish collation; at most 500, after sorting.

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
- **Resp suggestions use the browser's `<datalist>`,** one per sheet. In Chrome its popup takes the
  first Enter (pick) or Escape (close); the next press reaches the sheet.
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
  phase 5."
- **Read-only (finalised) is separate, simpler markup** with the same grid; rows stay focusable
  from script for jump links.
- **Performance:** rows and sections are memoised and the actions object is stable, so a change
  re-renders one row and its section. Measured in a production build on 180 rows: 1.9 ms of
  script per status key (p95 2.6 ms).
- **`SEVERITY_LABELS` (Minor, Major, Critical) lives in `checklist/status.ts`;** the Deviation
  Summary reuses it. A candidate for shared.

### Inspection pages

- **Tabs, not a side panel:** "Checklist | Deviations (n)". A side panel would squeeze the sheet
  below its one-line layout on most screens; the tabs sit in the sticky header, so the live count
  is always in view.
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
- **Resp suggestions** are the history merged with this inspection's own values, trimmed,
  de-duplicated ignoring case and sorted (Swedish). **This inspection's values are taken when a
  Resp field is left**, not as they are typed: otherwise the half-typed text was offered to its
  own field, first (a prefix sorts before its completion), and ↓ Enter stored "El" instead of
  "El-avdelningen", or a value one keystroke old.
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
  ring on a row focused by a click, Resp suggestions while typing, an unsaved participant (Back
  saves it, closing warns), the list's filters after "← Inspections", a finalise whose answer is
  lost, a 503 with Try again, and Escape twice on the busy Finalise dialog; in the API, three
  slow-sync races (save vs save, save vs finalise either side of its blob write), a lost counter,
  a table outage on a fresh instance, and a draft whose model differs from its published one.
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
- **4 per page is four stacked rows** (text left, photos right), not a 2 × 2 grid (Print).
- **A page holds fewer cards when their text doesn't fit.** The cards are measured in the browser
  before they are put on pages; a card is never split, and no text is cut (Print).
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
  or reloading the tab warns (open, see Deviation cards).
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
  colour readable on busy photos and in black and white.
- **The flattened copy** is drawn on an off-screen Konva stage from the same shape settings as the
  screen, at the stored photo's size (at most 1600 px), and saved as JPEG at quality 0.9 (photos
  use 0.8: JPEG blurs thin lines first) with `canvas.toBlob` (not `fetch(dataURL)`, which the CSP's
  `connect-src` refuses). It is uploaded as it is (`uploadJpeg`; `lib/images` only offers an upload
  that scales and re-encodes).
- **A copy is made only when the marks changed** (or never had one). A caption-only edit keeps it;
  removing every mark drops it, and print uses the photo itself.
- **A new photo opens in the editor at once** from a local copy while the scaled original uploads.
  A failed upload is reported at once and Save tries again; Save waits for an upload still running;
  Cancel drops a new photo (its blob stays).
- **Every image the feature loads asks for CORS** (`crossOrigin="anonymous"`, thumbnails and
  viewer too), so the browser cache never holds a response that would taint the canvas.
- **Thumbnails are 160 × 120 and show the whole photo** (contain, on white), so marks near an edge
  are never cropped; the caption sits underneath. The remove button is always visible (touch) and
  asks first. Focus goes to the new thumbnail after adding, to Add photo after removing.
- **`accept="image/*"` without `capture`:** a tablet offers its camera and its photo library. Paste
  works while the component's buttons have the focus, drop on its area; only the first image is
  used, pasted text is ignored, and a non-image or a drop when full says why.
- **Read-only** (no `onChange`): a thumbnail opens a simple viewer of the flattened copy, without
  Konva; with no photos the component renders nothing (the card says "No photos"). The hidden file
  input is rendered only while editable (integrator).
- **Escape is handled by the editor** (`closedby="none"`): Chrome lets a page refuse only one
  Escape per click. It asks before discarding changed marks or caption; in a label it ends the
  label only. Keys never reach the page behind (a checklist row would take "1" as OK). The dialog
  focuses itself, not its first tool, whose focus ring looked like a second selected tool.
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
  page's leave guard.

### Print

- **Print routes have no sidebar** (`PrintShell`), but wait for `/api/me` like the app shell.
- **Without `mode`, an inspection prints its report once finalised, else the blank checklist.**
  **Print / Save PDF** on the inspection saves pending changes first, then opens the route in a new
  tab with `autoprint=1`, which prints once everything is loaded and is then dropped from the
  address, so a reload doesn't print again.
- **Template preview:** admins see the draft ("Draft – Rev 3" on the front page, "(draft)" in the
  footer), inspectors the latest published revision, `?revision=n` any published one.
- **The footer is one `@page` rule with both margin boxes**, added at runtime through the CSSOM to
  the app's own stylesheet: the production CSP (`style-src 'self'`) blocks inline styles but not
  CSSOM edits. The text is escaped as a CSS string (control characters become spaces).
- **Chromium is recognised by `navigator.userAgentData`** (only Chromium browsers have it). Others
  get the footer's left text as a repeating table footer, without page numbers; the card pages
  have none, their heading already names the inspection.
- **A report of an inspection in progress** says "NOT FINALISED – DRAFT REPORT" on its front page
  and "Not finalised" in every footer, so no single page passes for the final report.
- **The PDF's file name** comes from the document title: "FI-2026-0042 RigiMill MG – Volvo Cars
  Skövde – Inspection report".
- **The front page is exactly one page** (a 265 mm column; the photo takes what the text leaves).
  Without a photo its frame stays, so every front page has the same layout. The finaliser is
  printed as stored, by email.
- **Checklist rows:** blank rows 9.5 mm (at least 9 mm to write in), report rows at least 7 mm. A
  status is an icon and its word in its column. **A NOK row's severity is a "Severity: Major" line
  at the top of its comment cell.** Spare lines print in blank mode only: in a report, findings
  that belong to no row are extra deviations.
- **Orphans:** the section title and column labels are the repeating table head, a section's first
  row keeps with the next and its last with the previous one, and no row is split.
- **Right-aligned text stays 0.5 mm inside the margin:** Chrome's PDFs put the right content edge
  about 0.3 mm further out.
- **Black and white:** light grey fills (`print-color-adjust: exact`, so they print without
  "Background graphics"), thin rules, words for statuses and severities; a critical card's badge
  is the one filled black.
- **Report cards:** "D-03 · 4.c · MAJOR" (an extra deviation: "Not on the checklist"), the section,
  checkpoint or description, comment, Resp ("—" when empty), up to two photos as marked up with
  their captions, and a "Closed · Sign · Date" line. No photo: an empty "Sketch / photo" frame. A
  photo that can't be loaded says so in its place. No deviations: "No deviations recorded."
- **`deviationsPerPage` lives in the address only** (default 2); the toolbar's switch replaces the
  history entry. The inspection's Report menu opens 2 per page.
- **4 per page is four stacked rows,** text in a 74 mm column on the left, photos on the right.
  Measured against a 2 × 2 grid: a pair of photos prints at 50 × 37 mm each instead of 33 × 25 mm,
  where the labels became unreadable; rows also read top to bottom like everything else. The grid
  code is removed.
- **Each page of cards is a sheet of its own**, and its cards share it equally (flex); a card
  whose text needs more takes it from the others. Photos are positioned inside their slot, so
  their pixel size never makes a card taller; a photo is never smaller than 24 mm, and captions
  are a row of their own under the photos (a long caption makes the card taller, never hides the
  photo). One photo takes the full width, two share it on a common caption line.
- **Cards are measured before they are put on pages (`useCardPages`, `packCards`).** They are laid
  out once, hidden, at their natural height in the chosen layout, after the fonts have loaded;
  then each page takes up to 2 or 4 of them while their heights fit (265 mm less the heading and
  the gaps of a full page). Why (integrator): with fixed groups of four, two long comments on one
  page pushed its fourth card onto an extra page of its own, without a heading, and the page's
  "D-01–D-04" was wrong. A flowing table with a repeating heading was tried and rejected: every
  card kept at least a quarter page, so any comment over about 200 characters pushed the next card
  on. A page with fewer cards keeps empty slots, so its cards keep their size.
- **Ready means everything is in:** the page first fetches every image's address, renders the
  document once, and sets `data-print-ready` after the images, the fonts and the card measuring;
  switching the mode or layout waits again. The Print button says "Preparing…" until then.
- **The deviation heading repeats on every page of cards** with its range ("FI-2026-0042 ·
  D-01–D-04"); screen readers hear it once.
- **The "Include reference images" appendix** (brief §6) is left to phase 5, with a marked place
  in `PrintDocument`.
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
