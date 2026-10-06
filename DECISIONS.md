# Decisions

Judgement calls made while building, newest phase last. Each line: the decision, then why.

## Phase 1 – Foundation

### Platform

- **Node 22, not the brief's Node 20.** Node 20 left Azure Functions support on 2026-04-30. SWA
  managed functions accept `node:22`; `node:24` is not offered yet. Move to 24 before 2027-04-30.
- **TypeScript 6.0, not 7.x.** typescript-eslint supports TypeScript < 6.1.
- **Free plan with the pre-configured Entra ID provider.** It lets any Microsoft account sign in, so
  access is gated purely on invited roles (see Auth). No paid plan is needed.
- **Workspaces `shared`, `api`, `app`, `seed`.** `@modig/shared` is TypeScript source consumed by
  the others, so there is no build step and no publishing.

### Data and storage

- **A fourth container, `config`** (`config/settings.json`, `config/inspection-counter.json`). The
  brief needs somewhere to keep the machine models, default location and company info, and names
  no place for it.
- **IDs are 16-character alphanumeric nanoids (no `_` or `-`).** They are safe in blob paths and
  unambiguous inside the Table RowKey `{inspectionId}_{itemId}`.
- **`ExtraDeviation = { id, description, comment?, resp?, severity }`.** The brief's
  `Inspection.extraDeviations` references a `Deviation` type it never defines.
- **Templates get an optional `changeNote`** for the revision history. Published-at/by come from
  `updatedAt`/`updatedBy` of the immutable `rev-{n}.json`, so no extra fields are needed.
- **N/A is stored as `"NA"`** (the brief's `RowResult` type) and displayed as "N/A".
- **`updatedBy` and `finalisedBy` store the email.** It is stable and trustworthy; there is no user
  table to look names up in.

### Auth

- **Access is gated only on the custom roles `inspector` and `admin`, never on `authenticated`.**
  On the Free plan anyone with a Microsoft account can sign in. At most 25 invited users.
- **Login is a static `/login.html`, not an SPA route.** The app bundle itself stays behind the role
  check. After sign-in users land on `/`: SWA's 401 redirect drops the deep link, which is
  acceptable for this tool.
- **`/api/me` derives the display name from the email.** SWA's `x-ms-client-principal` carries no
  claims (no name) on managed functions, and the brief rules out a user table.
- **Role names are lowercased before the API checks them.** SWA matches roles case-insensitively,
  so an invite for "Admin" passes the route gate and must also pass the function's own check.
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
- **`apiFetch` sends a 403 to `/forbidden.html` only when the body is not an `ApiError`.** That is
  SWA's own "no role" 403. A JSON 403 from a function (one refused action) is thrown instead.
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
  1..n, an empty or untitled section, an item before the first section, invalid or duplicate model
  codes, RMMG missing. Warns: a letter out of sequence, missing Rev/Location, a status list that
  differs from `STATUS_LABELS`.
- **The draft is the published revision with `status: draft` and revision N+1, without
  `changeNote`.** The note describes the published revision only. Item ids are shared because they
  are stable across revisions.
- **`changeNote` and `updatedBy` name the actual workbook file** ("Imported from
  Final_Inspection_rev_2.xlsm", "seed (Final_Inspection_rev_2.xlsm)").
- **The template name comes from the RMMG model name:** "Final inspection – RigiMill MG".
- **"Already imported" means a `templates/*/draft.json` with `modelCode: RMMG` exists.**
  `rev-N.json` is written before `draft.json`, so an existing draft means the import completed.
  Both writes refuse to overwrite.
- **Settings are created once; later runs only append missing model codes** (exact match, written
  with `If-Match`), so admin edits are kept. Stored settings that fail the schema stop the seed
  instead of being overwritten.
- **Storage retries are short** (blob 3 tries, table 2 retries, ≤ 2 s delays). A missing Azurite
  fails within seconds with a "start Azurite" hint instead of ~16 s of SDK retries.
- **Plain http is allowed for the Tables client only when the blob endpoint is http** (Azurite).
- **Blobs are written as indented JSON**, so they are readable in Storage Explorer; they are small.
- **A relative workbook path resolves against `INIT_CWD`** (where npm was run), because `npm -w`
  runs the script inside `seed/`.
- **An empty `STORAGE_CONNECTION_STRING` means local Azurite**, like an unset one. Empty variables
  are common in `.env` files.
- **`--dry-run` also builds and validates the documents**, so it proves they pass the shared
  schemas.
- **The seed prints the account and endpoints it writes to, never the key or a SAS token.**
- **Test Azurite runs the azurite package's own bin scripts with `process.execPath`** (no shell, no
  `.bin` shims; works on Windows) on two OS-assigned ports reserved at once. Teardown is SIGTERM,
  then SIGKILL after 3 s.
- **Storage tests start clean:** `beforeEach` deletes all containers and the table.
- **No `test` script in `seed/package.json`.** The root Vitest config runs the seed project.

### Frontend

- **Tailwind's default palette is switched off** (`--color-*: initial`). Every colour comes from
  the tokens in `app/src/index.css`; later phases add tokens there instead of ad-hoc classes.
- **Primary buttons use brand-600 `#0b7db3`, not `#29ABE2`.** White text on `#29ABE2` is 2.6:1 and
  fails WCAG AA; 600 is the same hue at 4.6:1. Brand 500 is kept for focus rings, the logo and
  accents.
- **`apiFetch` returns a promise that never settles when it navigates to the login or forbidden
  page.** The page is unloading; settling would only flash an error state.
- **`apiFetch`'s `schema` is typed structurally (`{ parse }`).** A non-JSON 2xx and a schema
  mismatch both become `ApiRequestError('internal')`, so the UI deals with one error type.
- **`/api/me` is cached forever (`staleTime: Infinity`).** Roles only change at the next sign-in.
  `useCurrentUser()` reads the cached query instead of a React context, because pages render only
  after `/api/me` has loaded.
- **The tablet drawer is a native `<dialog>` opened with `showModal()`.** That gives the focus
  trap, Escape and an inert background for free. It closes itself when the viewport crosses `lg`,
  so an invisible modal can't leave the page inert.
- **The pre-login pages share external `login-assets/auth.js` and `auth.css`, with no inline script
  or style.** The CSP then needs no `'unsafe-inline'`. `auth.css` mirrors a few tokens by hand
  because the Tailwind build sits behind sign-in.
- **There is one `/modig-logo.svg`, made anonymous in the SWA config**, rather than a copy in
  `login-assets`, so replacing the logo means replacing one file (plus `favicon.svg`).
- **The placeholder logo is drawn with stroke paths, no SVG `<text>`**, so it renders the same on
  every machine.
- **The CSP has `style-src 'self'` without `'unsafe-inline'`.** Tailwind ships as an external file
  and React sets style props through the CSSOM, which CSP does not block (verified: zero
  violations).
- **zod runs in `jitless` mode in the browser** (`app/src/lib/zodJitless.ts`, the first import in
  `main.tsx`). zod 4's `new Function` probe is reported as a CSP violation. It can't go through
  `@modig/shared`, because that barrel builds schemas on import. The API keeps zod's JIT.
- **No `ws:` in `connect-src`.** The SWA CLI skips `globalHeaders` when it proxies a dev server, so
  Vite's HMR websocket works without weakening the production CSP.
- **`Permissions-Policy` keeps `camera=(self)`** for future photo capture on tablets; microphone,
  geolocation, payment and USB are off.
- **`navigationFallback` excludes `/api/*`, `/assets/*`, `/login-assets/*` and static file
  extensions**, so a missing asset is a 404, not `index.html`.
- **Planned actions are visible but disabled, labelled with their phase** (New inspection: phase 3,
  New template: phase 2, Export CSV: phase 6). The settings form says "a later phase" because the
  brief schedules no phase for it.
- **Inspectors see Templates without actions.** Insights and Settings are hidden from their
  navigation and guarded by `RequireRole` (UI only; the API checks again).
- **The Settings page carries the brief's invite how-to:** portal steps, the
  `az staticwebapp users invite` command, the 25-user cap, and "role changes apply at the next
  sign-in".
- **Page titles use React 19's `<title>` inside `PageHeader`.**
- **`vite.config.ts` has its own `tsconfig.node.json`**, so Node types never leak into browser
  code. `typecheck` runs both configs.
- **`build` is plain `vite build`, without `tsc`.** Type-checking is a separate script that CI runs.
- **The skip link is moved off-screen with a translate instead of `sr-only`.** Tailwind's
  `focus:not-sr-only` resets its padding to 0.
- **The sidebar's "Admin" label is a `<p>` that labels the list, not a heading**, because the
  sidebar comes before the page's `<h1>`.

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
  excluded) until there is a reason to change it.
- **`local.settings.example.json` sets `AzureWebJobsStorage=UseDevelopmentStorage=true`.** Without
  it the host logs "Process reporting unhealthy" every 30 s.
- **`local.settings.example.json` sets `languageWorkers__node__arguments=--enable-source-maps`**,
  so logged stacks point at `.ts` files. Calling `process.setSourceMapsEnabled()` inside the bundle
  does not work.
- **No `.funcignore`.** Only `func azure functionapp publish` and pack read it; neither `func start`
  nor the SWA deploy does.
- **A `prestart` script creates `local.settings.json` from the example**, so
  `npm start -w @modig/api` works on its own. It never overwrites an existing file.
- **The build and settings scripts are plain `.mjs`** that import `node:console`/`node:process`
  explicitly, because the root ESLint Node-globals block does not cover `api/scripts`.
- **Unknown errors are logged and return a bare 500** (`{ error: 'internal' }`). Nothing from the
  original error reaches the client.
- **`readJsonBody`: unparseable JSON is a 400 without details; a schema failure is a 400 with the
  zod issues as `details`**, so the client can map paths to fields.
- **`requireIfMatch` (a missing `If-Match` is a 400), not an optional reader.** Every save is
  conditional, so a missing header is a client bug, not a licence to overwrite blindly.
- **`requireIfMatch` strips a `W/` prefix.** A compressing proxy may weaken the blob's strong ETag,
  and storage would then reject every save.
- **Storage is one lazy singleton holding both clients.** `allowInsecureConnection` for Tables is
  derived from the blob endpoint's protocol, as in the seed.
- **The Azure SDKs keep their default retry policies.** Fewer knobs; the volume is tiny.
- **`ensureStorage()` runs automatically from `readJson`/`writeJson`/`listBlobNames`**, memoised per
  process and cleared on failure. It is a safety net for a fresh Azurite and costs about 5
  idempotent calls per cold start in Azure. Direct `containerClient()`/`deviationsTable()` users
  must await it themselves.
- **Stored data that fails validation is a logged 500, not a 400.** It is not the caller's fault.
- **`writeJson` maps exactly 412 `ConditionNotMet` → `PreconditionFailedError` and 409
  `BlobAlreadyExists` → `ConflictError`.** Any other storage error is a 500.
- **`ConflictError`'s default message is "This already exists – reload to see the latest
  version."** Callers can pass a better one.
- **The `/api/me` test records `app.http()` registrations in a `vi.hoisted` array instead of
  `vi.fn()`.** Vitest 5 clears mocks between tests, which would wipe import-time calls.
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
- **`devOrigins` defaults to `http://localhost:5173` and `http://localhost:4280`** (the Vite preview
  port 4173 is dropped). This is harmless: the SAS, not CORS, authorises blob access.
- **Outputs are only `swaName`, `swaUrl` and `storageAccountName`.** No secrets in outputs.
- **No `main.bicepparam`.** Every parameter has a sensible default and an override is one
  `--parameters` flag.
- **`allowSharedKeyAccess: true` and public network access stay on.** SWA managed functions support
  neither managed identity nor private endpoints.
- **Blob and container soft delete for 7 days; no versioning.** ETags already protect saves, and
  versioning would multiply storage on every autosave.
- **The connection string uses `key1` only.** Rotation is: renew `key1`, then re-run the deployment.
- **The Bicep file owns all app settings.** `staticSites/config` replaces them all on each
  deployment, so settings added in the portal would vanish.
- **CI builds everything and deploys prebuilt output** (`skip_app_build`, `skip_api_build`). Oryx
  cannot resolve the workspace package `@modig/shared`.
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
- **The cost estimate is ≈ 1 SEK/month, about 9 SEK at ten times the usage.** It uses more generous
  usage assumptions than the research note's "< 5 SEK at 10×", which they don't support.

### Tooling and local development

- **`@playwright/test` is pinned to 1.56.1** to match the Chromium build in the dev container. On
  other machines, run `npx playwright install chromium` once.
- **`npm run dev` is concurrently over one `dev:*` script per process** (`blob`, `table`, `seed`,
  `api-build`, `api`, `app`, `swa`). The prefixes are the script names, and each command is
  readable on its own.
- **`--kill-others-on-fail`, not `--kill-others`.** The seed exits with code 0 and must not stop
  the rest; any failure (a taken port, a failed seed) stops the whole stack loudly instead of
  leaving half of it running.
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
  CLI first probes it through `HTTPS_PROXY` (ignoring `NO_PROXY`) and exits if that fails, which
  happened behind this container's proxy and would behind a corporate one. With 127.0.0.1 the only
  remaining effect is a harmless "Unable to query functions trigger types" warning.
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
