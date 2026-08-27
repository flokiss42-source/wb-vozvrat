const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const keyOf = row => String(row.nmId ?? row.nmID ?? row.nm_id ?? '');

function add(map, key, amount) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + number(amount));
}

export function aggregateStocks(rows) {
  const result = new Map();
  for (const row of rows) add(result, keyOf(row), row.quantityFull ?? (number(row.quantity) + number(row.inWayToClient) + number(row.inWayFromClient)));
  return Object.fromEntries([...result.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function aggregateStockLocations(rows) {
  const result = {};
  for (const row of rows) {
    const nmId = keyOf(row); if (!nmId) continue;
    const warehouseId = String(row.warehouseId ?? row.warehouseID ?? row.warehouseName ?? 'unknown');
    const warehouseName = String(row.warehouseName ?? warehouseId);
    const quantity = number(row.quantity) + number(row.inWayToClient) + number(row.inWayFromClient);
    const key = `${warehouseId}:${nmId}`;
    if (!result[key]) result[key] = { warehouseId, warehouseName, nmId, quantity: 0, available: 0, inWayToClient: 0, inWayFromClient: 0 };
    result[key].quantity += quantity;
    result[key].available += number(row.quantity);
    result[key].inWayToClient += number(row.inWayToClient);
    result[key].inWayFromClient += number(row.inWayFromClient);
  }
  return result;
}

export function aggregateMovements(incomes, sales, goodsReturns = []) {
  const accepted = new Map(), sold = new Map(), returned = new Map(), sellerReturned = new Map(), returnInProgress = new Map();
  const incomeSeen = new Set(), saleSeen = new Set();
  for (const row of incomes) {
    if (!/^принято$/i.test(String(row.status ?? '').trim())) continue;
    const fingerprint = `${row.incomeId}|${row.barcode}|${row.date}|${row.quantity}`;
    if (incomeSeen.has(fingerprint)) continue;
    incomeSeen.add(fingerprint); add(accepted, keyOf(row), row.quantity);
  }
  for (const row of sales) {
    // A sale and its later return share srid, but have different saleID values.
    // Prefer saleID so both sides of the lifecycle remain in the ledger.
    const fingerprint = String(row.saleID ?? `${row.srid}|${keyOf(row)}|${row.date}|${row.lastChangeDate}`);
    if (saleSeen.has(fingerprint)) continue;
    saleSeen.add(fingerprint);
    const isReturn = /^R/i.test(String(row.saleID ?? '')) || number(row.forPay) < 0;
    add(isReturn ? returned : sold, keyOf(row), 1);
  }
  const returnSeen = new Set();
  for (const row of goodsReturns) {
    const fingerprint = String(row.shkId ?? row.srid ?? row.orderId);
    if (!fingerprint || returnSeen.has(fingerprint)) continue;
    returnSeen.add(fingerprint);
    const completed = Boolean(row.completedDt) && !number(row.isStatusActive);
    add(completed ? sellerReturned : returnInProgress, keyOf(row), 1);
  }
  return { accepted: Object.fromEntries(accepted), sold: Object.fromEntries(sold), returned: Object.fromEntries(returned),
    sellerReturned: Object.fromEntries(sellerReturned), returnInProgress: Object.fromEntries(returnInProgress) };
}

export function aggregateDetailedSupplies(supplies) {
  const accepted = new Map(), evidence = new Map(), pending = [];
  for (const supply of supplies) {
    if (supply.statusID !== 5) { pending.push({ supplyID: supply.supplyID, statusID: supply.statusID, goods: supply.goods ?? [] }); continue; }
    for (const row of supply.goods ?? []) {
      const nmId = keyOf(row), quantity = number(row.acceptedQuantity);
      add(accepted, nmId, quantity);
      if (!evidence.has(nmId)) evidence.set(nmId, []);
      evidence.get(nmId).push({ supplyID: supply.supplyID, acceptedQuantity: quantity, barcode: row.barcode });
    }
  }
  return { accepted: Object.fromEntries(accepted), evidence: Object.fromEntries(evidence), pending };
}

export function applyCompensations(findings, financeRows) {
  const units = new Map(), evidence = new Map();
  for (const row of financeRows) {
    const operation = String(row.supplier_oper_name ?? '');
    if (!/компенсац|утрат|подмен|брак|недокомплект/i.test(operation)) continue;
    const nmId = String(row.nm_id ?? ''); if (!nmId) continue;
    const quantity = Math.max(1, Math.abs(number(row.quantity)));
    add(units, nmId, quantity);
    if (!evidence.has(nmId)) evidence.set(nmId, []);
    evidence.get(nmId).push({ rrdId: row.rrd_id, operation, quantity, amount: number(row.additional_payment) || number(row.ppvz_for_pay) });
  }
  return findings.map(finding => {
    const compensatedUnits = Math.min(finding.missing, units.get(finding.nmId) ?? 0);
    return { ...finding, compensatedUnits, unresolvedMissing: Math.max(0, finding.missing - compensatedUnits), compensationEvidence: evidence.get(finding.nmId) ?? [] };
  }).filter(finding => finding.unresolvedMissing > 0);
}

export function reconcileInventory(previous, current, movements, { minMissing = 1 } = {}) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current), ...Object.keys(movements.accepted), ...Object.keys(movements.sold), ...Object.keys(movements.returned)]);
  const findings = [];
  for (const nmId of keys) {
    const before = number(previous[nmId]), accepted = number(movements.accepted[nmId]);
    const sold = number(movements.sold[nmId]), returned = number(movements.returned[nmId]), sellerReturned = number(movements.sellerReturned?.[nmId]);
    const actual = number(current[nmId]);
    const expected = before + accepted - sold + returned - sellerReturned;
    const difference = actual - expected;
    if (difference <= -minMissing) findings.push({ nmId, before, accepted, sold, returned, sellerReturned, returnInProgress: number(movements.returnInProgress?.[nmId]), expected, actual, missing: Math.abs(difference) });
  }
  return findings.sort((a, b) => b.missing - a.missing);
}

export function classifyFindings(findings, previousCandidates = {}, now = new Date(), coverage = {}) {
  const nowIso = now.toISOString(), active = {}, classified = [];
  for (const finding of findings) {
    const prior = previousCandidates[finding.nmId];
    const firstSeen = prior?.firstSeen ?? nowIso;
    const ageDays = Math.floor((now - new Date(firstSeen)) / 86400000);
    const blockers = [];
    for (const source of ['stocks', 'incomes', 'sales', 'sellerReturns', 'finance']) if (!coverage[source]) blockers.push(`нет данных: ${source}`);
    if (!coverage.detailedSupplies) blockers.push('нет детализации поставок');
    if (finding.pendingSupply) blockers.push('поставка ещё не завершена');
    if (finding.returnInProgress) blockers.push(`возврат в пути: ${finding.returnInProgress} шт.`);
    if (finding.compensatedUnits) blockers.push(`компенсировано: ${finding.compensatedUnits} шт.`);
    let status = 'Наблюдение';
    if (ageDays >= 7 && !finding.returnInProgress) status = 'Вероятная потеря';
    if (ageDays >= 14 && blockers.length === 0) status = 'Готово к претензии';
    const candidate = { ...finding, firstSeen, lastSeen: nowIso, ageDays, status, blockers };
    active[finding.nmId] = candidate; classified.push(candidate);
  }
  return { active, classified };
}
