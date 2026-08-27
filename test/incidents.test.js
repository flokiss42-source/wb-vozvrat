import assert from 'node:assert/strict';
import test from 'node:test';
import { assessIncident, selectIncidentSnapshots } from '../src/incidents.js';

const snapshot = (capturedAt, quantities) => ({ capturedAt, locations: Object.fromEntries(Object.entries(quantities).map(([nmId, quantity]) => [
  `77:${nmId}`, { warehouseId: '77', warehouseName: 'Электросталь', nmId, quantity }
])) });

test('выбирает ближайшие снимки до и после инцидента', () => {
  const one = snapshot('2026-08-01T00:00:00Z', { 1: 4 }), two = snapshot('2026-08-03T00:00:00Z', { 1: 2 });
  assert.deepEqual(selectIncidentSnapshots([two, one], '2026-08-02T00:00:00Z'), { before: one, after: two });
});

test('считает складскую экспозицию, снижение и компенсацию отдельно', () => {
  const result = assessIncident({ before: snapshot('2026-08-01T00:00:00Z', { 1: 10, 2: 5 }), after: snapshot('2026-08-03T00:00:00Z', { 1: 3, 2: 5 }),
    warehouseNames: ['электро'], compensationByNmId: { 1: 2 } });
  assert.deepEqual(result.totals, { exposed: 15, decreased: 7, compensated: 2, unresolved: 5 });
  assert.equal(result.confidence, 'предварительная сверка');
});

test('не называет экспозицию уничтоженным товаром без снимка после', () => {
  const result = assessIncident({ before: snapshot('2026-08-01T00:00:00Z', { 1: 10 }), warehouseIds: ['77'] });
  assert.deepEqual(result.totals, { exposed: 10, decreased: null, compensated: 0, unresolved: null });
  assert.equal(result.confidence, 'оценка экспозиции'); assert.ok(result.limitations.length);
});
