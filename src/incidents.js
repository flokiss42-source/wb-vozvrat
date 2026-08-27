const ms = value => new Date(value).getTime();

export function selectIncidentSnapshots(snapshots, occurredAt) {
  const target = ms(occurredAt);
  if (!Number.isFinite(target)) throw new Error('Некорректное время инцидента');
  const sorted = snapshots.slice().sort((a, b) => ms(a.capturedAt) - ms(b.capturedAt));
  const before = sorted.filter(item => ms(item.capturedAt) <= target).at(-1) ?? null;
  const after = sorted.find(item => ms(item.capturedAt) > target) ?? null;
  return { before, after };
}

export function assessIncident({ before, after, warehouseIds = [], warehouseNames = [], compensationByNmId = {} }) {
  if (!before?.locations) throw new Error('Нет снимка по складам до инцидента');
  const ids = new Set(warehouseIds.map(String));
  const names = warehouseNames.map(value => String(value).toLocaleLowerCase('ru'));
  const matches = item => ids.has(String(item.warehouseId)) || names.some(name => item.warehouseName.toLocaleLowerCase('ru').includes(name));
  const beforeRows = Object.values(before.locations).filter(matches);
  if (!beforeRows.length) throw new Error('В снимке до инцидента не найден выбранный склад');
  const afterRows = Object.values(after?.locations ?? {}).filter(matches);
  const afterMap = new Map(afterRows.map(item => [String(item.nmId), item]));
  const items = beforeRows.map(item => {
    const current = afterMap.get(String(item.nmId));
    const exposure = item.quantity;
    const observedAfter = after ? (current?.quantity ?? 0) : null;
    const decrease = observedAfter == null ? null : Math.max(0, exposure - observedAfter);
    const compensated = Math.max(0, Number(compensationByNmId[item.nmId] ?? 0));
    return { warehouseId: item.warehouseId, warehouseName: item.warehouseName, nmId: item.nmId,
      exposure, observedAfter, decrease, compensated, unresolved: decrease == null ? null : Math.max(0, decrease - compensated) };
  }).filter(item => item.exposure > 0).sort((a, b) => b.exposure - a.exposure);
  const total = field => items.reduce((sum, item) => sum + (item[field] ?? 0), 0);
  const limitations = [];
  if (!after) limitations.push('нет снимка после инцидента');
  limitations.push('снижение остатка само по себе не доказывает уничтожение: нужны движения и документы WB');
  limitations.push('расчёт компенсации зависит от оферты, страхования и типа логистики на дату события');
  return { warehouseIds: [...new Set(items.map(x => x.warehouseId))], beforeAt: before.capturedAt, afterAt: after?.capturedAt ?? null,
    totals: { exposed: total('exposure'), decreased: after ? total('decrease') : null, compensated: total('compensated'), unresolved: after ? total('unresolved') : null },
    confidence: after ? 'предварительная сверка' : 'оценка экспозиции', limitations, items };
}
