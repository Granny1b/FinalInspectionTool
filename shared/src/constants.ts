/** Product-level defaults (brief §2, §5.6). Settings in `config/settings.json` override where relevant. */
export const APP_NAME = 'Modig Final Inspection';
export const DEFAULT_COMPANY_NAME = 'Modig Machine Tool';
export const DEFAULT_LOCATION = 'Kalmar, Sweden';

/** Client-side image resize before upload (brief §3). */
export const IMAGE_MAX_EDGE_PX = 1600;
export const IMAGE_JPEG_QUALITY = 0.8;

/**
 * Who a deviation is for (the "Resp" column: responsible department). Admins edit the list in
 * Settings; these are the defaults for settings created before the list existed.
 */
export const DEFAULT_RESPONSIBLES = [
  'Mechanical',
  'Electrical',
  'Media',
  'Quality',
  'Design',
  'Software',
  'Purchasing',
] as const;

/** What kind of deviation it is. Admins edit the list in Settings; these are the defaults. */
export const DEFAULT_DEVIATION_CATEGORIES = [
  'Markings & labels',
  'Wrong assembly',
  'Missing parts',
  'Damage & scratches',
  'Loose or wrong torque',
  'Leakage',
  'Cleanliness',
  'Cabling & routing',
  'Function & adjustment',
  'Software & parameters',
  'Documentation',
  'Safety',
] as const;
