/**
 * Bundle entry point (package.json "main" → dist/index.cjs). Each function module registers
 * itself with `app.http()` when imported, so every function must be imported here.
 * SWA has an open issue with ≥ 40 registrations on Node 22 — keep the count well below that.
 */
import './functions/images';
import './functions/inspection-state';
import './functions/inspections';
import './functions/me';
import './functions/resp-suggestions';
import './functions/settings';
import './functions/template-revisions';
import './functions/templates';
