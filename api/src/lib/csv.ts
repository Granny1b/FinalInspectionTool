/**
 * CSV files for Excel and Power BI (brief §5.5: "so I can take it into Excel/Power BI"): the
 * Insights export and the deviation log's. Semicolons, because Excel with Swedish regional
 * settings expects them when it opens a CSV (Power BI detects either); a UTF-8 byte order mark,
 * so Excel reads å, ä and ö; CRLF line ends.
 */
const SEPARATOR = ';';
const BOM = '\uFEFF';

/** A header line, then one line per row. */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number | boolean)[])[],
): string {
  const lines = [header, ...rows].map((cells) => cells.map(csvField).join(SEPARATOR));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

function csvField(value: string | number | boolean): string {
  let text = String(value);
  // A cell starting like a formula would run as one in Excel: keep it text (OWASP's advice).
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]|^\s|\s$/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * An attachment named `fileName`. A name may hold any character ("–", å), which a header can't
 * carry as it is: the name then goes in `filename*` (RFC 6266), percent-encoded UTF-8, after a
 * plain ASCII copy for any client that reads only `filename`.
 */
export function contentDisposition(fileName: string): string {
  const ascii = fileName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7e]|["\\]/g, '_');
  if (ascii === fileName) return `attachment; filename="${fileName}"`;
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** A CSV file as the answer to a GET: never cached, saved under `fileName`. */
export function csvResponse(body: string, fileName: string) {
  return {
    status: 200,
    body,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition(fileName),
      'Cache-Control': 'no-store',
    },
  };
}
