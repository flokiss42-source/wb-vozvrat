const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const keyOf = row => String(row.nmId ?? row.nm_id ?? '');

function add(map, key, amount) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + number(amount));
}

export function aggregateStocks(rows) {
  const result = new Map();
  for (const row of rows) add(result, keyOf(row), row.quantityFull ?? (number(row.quantity) + number(row.inWayToClient) + number(row.inWayFromClient)));
  return Object.fromEntries([...result.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function aggregateMovements(incomes, sales) {
  const accepted = new Map(), sold = new Map(), returned = new Map();
  const incomeSeen = new Set(), saleSeen = new Set();
  for (const row of incomes) {
    if (!/^принято$/i.test(String(row.status ?? '').trim())) continue;
    const fingerprint = `${row.incomeId}|${row.barcode}|${row.date}|${row.quantity}`;
    if (incomeSeen.has(fingerprint)) continue;
    incomeSeen.add(fingerprint); add(accepted, keyOf(row), row.quantity);
  }
  for (const row of sales) {
    const fingerprint = String(row.srid ?? row.saleID ?? `${keyOf(row)}|${row.date}|${row.lastChangeDate}`);
    if (saleSeen.has(fingerprint)) continue;
    saleSeen.add(fingerprint);
    const isReturn = /^R/i.test(String(row.saleID ?? '')) || number(row.forPay) < 0;
    add(isReturn ? returned : sold, keyOf(row), 1);
  }
  return { accepted: Object.fromEntries(accepted), sold: Object.fromEntries(sold), returned: Object.fromEntries(returned) };
}

export function reconcileInventory(previous, current, movements, { minMissing = 1 } = {}) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current), ...Object.keys(movements.accepted), ...Object.keys(movements.sold), ...Object.keys(movements.returned)]);
  const findings = [];
  for (const nmId of keys) {
    const before = number(previous[nmId]), accepted = number(movements.accepted[nmId]);
    const sold = number(movements.sold[nmId]), returned = number(movements.returned[nmId]);
    const actual = number(current[nmId]);
    const expected = before + accepted - sold + returned;
    const difference = actual - expected;
    if (difference <= -minMissing) findings.push({ nmId, before, accepted, sold, returned, expected, actual, missing: Math.abs(difference) });
  }
  return findings.sort((a, b) => b.missing - a.missing);
}
