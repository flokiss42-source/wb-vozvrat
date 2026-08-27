export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  const firstLine = input.split(/\r?\n/, 1)[0];
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field.trim()); field = ''; }
    else if (char === '\n') { row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (quoted) throw new Error('Незакрытая кавычка в CSV');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error('CSV не содержит строк данных');
  const headers = rows[0];
  if (new Set(headers).size !== headers.length) throw new Error('В CSV повторяются названия колонок');
  return rows.slice(1).map((values, rowIndex) => ({
    ...Object.fromEntries(headers.map((key, i) => [key, values[i] ?? ''])),
    __row: rowIndex + 2
  }));
}

export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null || value === '') return 0;
  const normalized = String(value).replace(/\s/g, '').replace(',', '.');
  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
}
