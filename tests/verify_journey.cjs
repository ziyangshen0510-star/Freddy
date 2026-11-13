'use strict';
process.env.TZ = 'America/Vancouver';
const assert = require('node:assert/strict');
const J = require('../pet/journey.js');
const at = (day, hour = 12, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();
const checks = [];
let serial = 0;
const action = (state, type, time = at(12), quality) => J.record(state, { id: `action-${++serial}`, type, quality }, time);

{
  const state = J.create(at(12));
  const before = JSON.stringify(state);
  const view = J.snapshot(state, at(12));
  assert.equal(view.level, 1);
  assert.equal(view.totalXp, 0);
  assert.equal(view.completedTasks, 0);
  assert.equal(view.activeDays, 0);
  assert.equal(view.badges.some(badge => badge.unlocked), false);
  assert.deepEqual(view.tasks.map(task => task.action), ['stroke', 'play', 'train']);
  assert.deepEqual(view.tasks.map(task => task.target), [1, 1, 1]);
  assert.equal(view.unlockedScarves.join(','), 'sage');
  assert.equal(JSON.stringify(state), before, 'Rendering must not grant or mutate progress');
  view.nextScarf.requiredGifts = 0;
  assert.equal(J.snapshot(state, at(12)).nextScarf.requiredGifts, 1, 'View data must not mutate reward definitions');
  checks.push('New and repeatedly rendered saves have no visit-only rewards or implicit gifts');
}
{
  const original = J.create(at(12));
  const event = { id: 'completed-stroke', type: 'stroke', quality: 'gentle' };
  const first = J.record(original, event, at(12));
  assert.equal(original.totalXp, 0, 'Recording must not mutate the input save');
  assert.equal(first.xpGained, 10);
  assert.equal(first.state.counts.stroke, 1);
  assert.equal(first.state.daily.counts.stroke, 1);
  assert.equal(first.state.activeDayCount, 1);
  assert.deepEqual(first.newBadges.map(b => b.id), ['first-care']);
  const second = J.record(first.state, event, at(12));
  assert.equal(second.xpGained, 0);
  assert.deepEqual(second.newBadges, []);
  assert.deepEqual(second.state, first.state);
  for (const event of [{ id:'bad',type:'sleep' }, { id:'',type:'train' }, { type:'feed' }, null]) {
    const failed = J.record(first.state, event, at(12));
    assert.equal(failed.xpGained, 0);
    assert.equal(failed.state.totalXp, first.state.totalXp);
  }
  let state = first.state;
  for (let i = 0; i < 4; i += 1) state = action(state, 'stroke').state;
  const later = action(state, 'stroke', at(12), 'perfect');
  assert.equal(later.xpGained, 2, 'Repeated same-action farming should have a small reward');
  checks.push('Completed action IDs are idempotent, invalid/cancelled inputs grant nothing, and repetitive actions taper');
}
{
  let state = J.create(at(12));
  state = action(state, 'stroke').state;
  state = action(state, 'play').state;
  for (let i = 0; i < 3; i += 1) state = action(state, 'feed').state;
  assert.equal(J.claimDaily(state, at(12)).claimed, false, 'Food and total counts cannot substitute for learning');
  state = action(state, 'train').state;
  const eligible = J.snapshot(state, at(12));
  assert.equal(eligible.completedTasks, 3);
  const reward = J.claimDaily(state, at(12));
  assert.equal(reward.claimed, true);
  assert.equal(reward.xpGained, 20);
  assert.equal(state.daily.claimed, false, 'Claim must not mutate its input');
  state = reward.state;
  assert.equal(state.gifts, 1);
  assert.equal(state.selectedScarf, 'peach');
  assert.deepEqual(state.unlockedScarves, ['sage', 'peach']);
  assert(reward.newBadges.some(b => b.id === 'first-gift'));
  const again = J.claimDaily(state, at(12));
  assert.equal(again.claimed, false);
  assert.equal(again.xpGained, 0);
  assert.deepEqual(again.state, state);
  assert.equal(J.selectScarf(state, 'gold', at(12)).selectedScarf, 'peach');
  assert.equal(J.selectScarf(state, 'sage', at(12)).selectedScarf, 'sage');
  checks.push('All three distinct wishes are necessary; daily gift claims are once-only and unlock/equip a real scarf');
}
{
  const end = new Date(2026, 10, 12, 23, 59, 59).getTime();
  const next = new Date(2026, 10, 13, 0, 0, 1).getTime();
  assert.equal(J.dayKey(end), '2026-11-12');
  assert.equal(J.dayKey(next), '2026-11-13');
  let state = J.create(end);
  for (const type of ['stroke', 'play', 'train']) state = action(state, type, end).state;
  state = J.claimDaily(state, end).state;
  const nextDay = J.normalize(state, next);
  assert.equal(nextDay.totalXp, state.totalXp);
  assert.deepEqual(nextDay.counts, state.counts);
  assert.equal(nextDay.gifts, 1);
  assert.equal(J.snapshot(nextDay, next).completedTasks, 0);
  assert.equal(nextDay.daily.claimed, false);
  assert.equal(nextDay.activeDayCount, 1, 'Opening on another day alone does not add an active day');
  state = action(nextDay, 'stroke', next).state;
  const rolledBack = J.normalize(state, end);
  assert.equal(rolledBack.daily.claimed, true, 'Returning the clock to a claimed day must not unlock another gift');
  assert.equal(J.claimDaily(rolledBack, end).claimed, false);
  const skippedWeek = J.snapshot(state, at(22));
  assert.equal(skippedWeek.totalXp, state.totalXp);
  assert.equal(skippedWeek.activeDays, 2);
  assert.equal(skippedWeek.selectedScarf, 'peach');
  checks.push('Local midnight refreshes wishes, not growth; opening and missing days add no penalties; claimed dates resist replay');
}
{
  let state = J.create(at(12));
  let masteryAwards = 0;
  for (let day = 12; day < 19; day += 1) {
    const time = at(day);
    for (const type of ['stroke', 'play', 'train']) {
      const result = action(state, type, time);
      masteryAwards += result.newBadges.filter(b => b.id === 'handshake-master').length;
      state = result.state;
    }
    const reward = J.claimDaily(state, time);
    assert.equal(reward.claimed, true);
    state = reward.state;
    if (day === 14) {
      assert.equal(state.selectedScarf, 'sky');
      assert(state.badges.includes('three-days'));
    }
  }
  const view = J.snapshot(state, at(18));
  assert.equal(view.gifts, 7);
  assert.equal(view.activeDays, 7);
  assert.equal(view.selectedScarf, 'gold');
  assert.deepEqual(view.unlockedScarves, ['sage', 'peach', 'sky', 'gold']);
  assert.equal(view.nextScarf, null);
  assert.equal(view.training.completed, 7);
  assert.equal(view.training.level, 3);
  assert.equal(view.training.nextAt, 14);
  assert.equal(masteryAwards, 1);
  assert.equal(view.badges.every(b => b.unlocked), true);
  assert(view.level > 1 && view.xpInLevel >= 0 && view.xpInLevel < view.xpToNext);
  checks.push('Distinct active days, gradual training mastery, growth and 1/3/7-gift scarf goals persist together');
}
{
  const valid = action(J.create(at(12)), 'train').state;
  valid.totalXp = 180;
  valid.daily.date = 'broken-date';
  valid.selectedScarf = '<script>';
  valid.badges = ['first-training', 'not-real', 'first-training'];
  valid.recentIds = Array.from({length:100}, (_, i) => `past-${i}`);
  valid.activeDays = ['2026-02-30', '2026-11-12', '2026-11-12', null];
  const normalized = J.normalize(valid, at(12));
  assert.equal(normalized.totalXp, 180);
  assert.equal(normalized.counts.train, 1);
  assert.equal(normalized.daily.counts.train, 0);
  assert.equal(normalized.selectedScarf, 'sage');
  assert.deepEqual(normalized.badges, ['first-training']);
  assert.equal(normalized.recentIds.length, 64);
  assert.deepEqual(normalized.activeDays, ['2026-11-12']);
  const snapshot = J.snapshot(normalized, at(12));
  assert.equal(snapshot.level, 4);
  assert.equal(snapshot.xpInLevel, 0);
  assert.equal(snapshot.xpToNext, 100);
  for (const bad of [null, undefined, [], 'broken', { totalXp:Infinity, counts:{train:-30}, gifts:NaN }]) {
    const fixed = J.normalize(bad, NaN);
    assert(Number.isFinite(fixed.totalXp));
    assert.equal(fixed.counts.train, 0);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(fixed.daily.date));
    assert.equal(fixed.selectedScarf, 'sage');
  }
  for (const badTime of [Infinity, NaN, 'yesterday', 1e100]) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(J.dayKey(badTime)));
  }
  const capped = J.normalize({totalXp:1e30,counts:{stroke:1e30},gifts:1e30}, at(12));
  assert.equal(capped.totalXp, 10000000);
  assert.equal(capped.counts.stroke, 1000000);
  assert.equal(capped.gifts, 1000000);
  const max = J.snapshot(capped, at(12));
  assert(max.xpInLevel >= 0 && max.xpInLevel < max.xpToNext);
  checks.push('Malformed values, invalid dates, huge counters and histories normalize without erasing valid lifetime progress');
}
console.log(JSON.stringify({ result:'PASS', checks }, null, 2));
