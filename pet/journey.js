/* Browser-local progress. The caller records only successfully completed actions. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PuppyJourney = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const ACTIONS = ['stroke', 'feed', 'play', 'train'];
  const XP = { stroke: 8, feed: 10, play: 12, train: 12 };
  const MAX_COUNT = 1000000;
  const MAX_XP = 10000000;
  const DAY_HISTORY = 366;
  const LEVEL_LABELS = ['小小的默契', '愿意靠近你', '喜欢你的摸摸', '默契小搭档', '最安心的身边', '心有小默契', '专属的陪伴', '一起慢慢长大'];
  const TRAINING = [
    { at: 0, label: '第一次学握手' },
    { at: 1, label: '愿意抬起小爪' },
    { at: 3, label: '听懂你的邀请' },
    { at: 7, label: '熟练握握手' },
    { at: 14, label: '默契满满' },
    { at: 25, label: '小小握手大师' },
  ];
  const SCARVES = [
    { id: 'sage', label: '薄荷绿', color: '#a2b797', requiredGifts: 0 },
    { id: 'peach', label: '蜜桃粉', color: '#e4ad96', requiredGifts: 1 },
    { id: 'sky', label: '晴空蓝', color: '#96bbcf', requiredGifts: 3 },
    { id: 'gold', label: '暖阳金', color: '#dfc278', requiredGifts: 7 },
  ];
  const BADGES = [
    { id: 'first-care', label: '把喜欢给你', description: '完成第一次摸摸或喂食', test: s => s.counts.stroke + s.counts.feed >= 1 },
    { id: 'first-fetch', label: '球球叼回来啦', description: '完成第一次玩球', test: s => s.counts.play >= 1 },
    { id: 'first-training', label: '第一次握手', description: '完成第一次握手练习', test: s => s.counts.train >= 1 },
    { id: 'three-days', label: '熟悉的脚步声', description: '在 3 个不同的日子和小狗互动', test: s => s.activeDayCount >= 3 },
    { id: 'handshake-master', label: '握手小能手', description: '累计完成 7 次握手练习', test: s => s.counts.train >= 7 },
    { id: 'first-gift', label: '一份小惊喜', description: '领取第一份每日心愿礼物', test: s => s.gifts >= 1 },
    { id: 'seven-gifts', label: '小窝收藏家', description: '累计领取 7 份每日心愿礼物', test: s => s.gifts >= 7 },
    { id: 'hundred-xp', label: '越来越默契', description: '累计获得 100 点默契', test: s => s.totalXp >= 100 },
  ];
  const WISH_LABELS = {
    stroke: ['醒来想要一个摸摸', '把脑袋凑过来贴贴', '今天也想蹭蹭你的手', '最喜欢你温柔的摸摸'],
    play: ['把球球叼回来给你', '一起跑一小圈', '今天也想玩球球', '接住一颗小快乐'],
    train: ['把小爪子交给你', '再学一次握握手', '听见你说“握手”啦', '练习我们的小默契'],
  };

  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const number = (value, max = MAX_COUNT) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : 0;
  function timestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const d = new Date(value);
      if (Number.isFinite(d.getTime()) && d.getFullYear() > 0 && d.getFullYear() <= 9999) return value;
    }
    return Date.now();
  }
  function dayKey(value) {
    const d = new Date(timestamp(value));
    return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1) return false;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
  function unique(values, filter, limit) {
    return [...new Set(Array.isArray(values) ? values.filter(filter) : [])].slice(-limit);
  }
  const emptyCounts = () => Object.fromEntries(ACTIONS.map(action => [action, 0]));
  function counts(value) {
    const source = object(value);
    return Object.fromEntries(ACTIONS.map(action => [action, number(source[action])]));
  }
  function create(value) {
    return {
      version: 1, totalXp: 0, counts: emptyCounts(), activeDayCount: 0,
      activeDays: [], giftDays: [], gifts: 0, badges: [], recentIds: [],
      unlockedScarves: ['sage'], selectedScarf: 'sage',
      daily: { date: dayKey(value), counts: emptyCounts(), claimed: false },
    };
  }
  function normalize(value, now) {
    const source = object(value);
    const date = dayKey(now);
    const total = counts(source.counts);
    const activeDays = unique(source.activeDays, validDay, DAY_HISTORY);
    const giftDays = unique(source.giftDays, validDay, DAY_HISTORY);
    const gifts = Math.max(number(source.gifts), giftDays.length);
    const unlockedScarves = SCARVES.filter(scarf => gifts >= scarf.requiredGifts).map(scarf => scarf.id);
    const previous = object(source.daily);
    const sameDay = previous.date === date;
    const dailyCounts = sameDay ? counts(previous.counts) : emptyCounts();
    // A damaged daily record cannot invent interactions absent from the totals.
    for (const action of ACTIONS) dailyCounts[action] = Math.min(dailyCounts[action], total[action]);
    return {
      version: 1, totalXp: number(source.totalXp, MAX_XP), counts: total,
      activeDayCount: Math.max(number(source.activeDayCount), activeDays.length),
      activeDays, giftDays, gifts,
      badges: unique(source.badges, id => BADGES.some(badge => badge.id === id), BADGES.length),
      recentIds: unique(source.recentIds, id => typeof id === 'string' && id.length > 0 && id.length <= 120, 64),
      unlockedScarves,
      selectedScarf: unlockedScarves.includes(source.selectedScarf) ? source.selectedScarf : 'sage',
      daily: { date, counts: dailyCounts, claimed: giftDays.includes(date) || (sameDay && previous.claimed === true) },
    };
  }
  function levelFor(xp) {
    return Math.floor((Math.sqrt(9 + .4 * xp) - 1) / 2);
  }
  function threshold(level) { return 10 * (level - 1) * (level + 2); }
  function rewardBadges(state) {
    const earned = BADGES.filter(badge => !state.badges.includes(badge.id) && badge.test(state));
    state.badges.push(...earned.map(badge => badge.id));
    return earned.map(({ id, label, description }) => ({ id, label, description }));
  }
  function record(value, event, now) {
    const state = normalize(value, now);
    const beforeLevel = levelFor(state.totalXp);
    const input = object(event);
    const result = { state, xpGained: 0, newBadges: [], levelUp: false };
    if (!ACTIONS.includes(input.type) || typeof input.id !== 'string' || !input.id.trim() || input.id.length > 120) return result;
    const id = input.id.trim();
    if (state.recentIds.includes(id)) return result;
    state.recentIds = [...state.recentIds, id].slice(-64);
    const type = input.type;
    state.counts[type] = Math.min(MAX_COUNT, state.counts[type] + 1);
    state.daily.counts[type] = Math.min(MAX_COUNT, state.daily.counts[type] + 1);
    const date = state.daily.date;
    if (!state.activeDays.includes(date)) {
      state.activeDays = [...state.activeDays, date].slice(-DAY_HISTORY);
      state.activeDayCount = Math.min(MAX_COUNT, state.activeDayCount + 1);
    }
    const qualityBonus = ['perfect', 'gentle'].includes(input.quality) ? 2 : 0;
    // Longer visits are welcome; the first few varied actions carry most growth.
    const award = state.daily.counts[type] <= 5 ? XP[type] + qualityBonus : 2;
    const beforeXp = state.totalXp;
    state.totalXp = Math.min(MAX_XP, state.totalXp + award);
    result.xpGained = state.totalXp - beforeXp;
    result.newBadges = rewardBadges(state);
    result.levelUp = levelFor(state.totalXp) > beforeLevel;
    return result;
  }
  function complete(state) {
    return state.daily.counts.stroke >= 1 && state.daily.counts.play >= 1 && state.daily.counts.train >= 1;
  }
  function claimDaily(value, now) {
    const state = normalize(value, now);
    const result = { state, claimed: false, xpGained: 0, newBadges: [], levelUp: false };
    if (state.daily.claimed || !complete(state)) return result;
    const beforeLevel = levelFor(state.totalXp);
    const beforeXp = state.totalXp;
    const previousScarves = [...state.unlockedScarves];
    state.daily.claimed = true;
    state.gifts = Math.min(MAX_COUNT, state.gifts + 1);
    state.giftDays = [...state.giftDays, state.daily.date].slice(-DAY_HISTORY);
    state.totalXp = Math.min(MAX_XP, state.totalXp + 20);
    state.unlockedScarves = SCARVES.filter(scarf => state.gifts >= scarf.requiredGifts).map(scarf => scarf.id);
    const newScarf = state.unlockedScarves.find(id => !previousScarves.includes(id));
    if (newScarf) state.selectedScarf = newScarf;
    result.claimed = true;
    result.xpGained = state.totalXp - beforeXp;
    result.newBadges = rewardBadges(state);
    result.levelUp = levelFor(state.totalXp) > beforeLevel;
    return result;
  }
  function selectScarf(value, id, now) {
    const state = normalize(value, now);
    if (state.unlockedScarves.includes(id)) state.selectedScarf = id;
    return state;
  }
  function snapshot(value, now) {
    const state = normalize(value, now);
    const level = levelFor(state.totalXp);
    const seed = Number(state.daily.date.replaceAll('-', ''));
    const tasks = ['stroke', 'play', 'train'].map((action, i) => ({
      id: action, action, label: WISH_LABELS[action][(seed + i) % WISH_LABELS[action].length],
      current: Math.min(1, state.daily.counts[action]), target: 1, done: state.daily.counts[action] >= 1,
    }));
    const completed = state.counts.train;
    let trainingLevel = 0;
    for (let i = 1; i < TRAINING.length; i += 1) if (completed >= TRAINING[i].at) trainingLevel = i;
    const previousAt = TRAINING[trainingLevel].at;
    const nextAt = TRAINING[trainingLevel + 1]?.at ?? null;
    return {
      level, levelLabel: LEVEL_LABELS[Math.min(level - 1, LEVEL_LABELS.length - 1)],
      xpInLevel: state.totalXp - threshold(level), xpToNext: threshold(level + 1) - threshold(level), totalXp: state.totalXp,
      training: { level: trainingLevel, label: TRAINING[trainingLevel].label, completed, nextAt, previousAt },
      tasks, completedTasks: tasks.filter(task => task.done).length, dailyClaimed: state.daily.claimed,
      badges: BADGES.map(({ id, label, description }) => ({ id, label, description, unlocked: state.badges.includes(id) })),
      gifts: state.gifts, selectedScarf: state.selectedScarf, unlockedScarves: [...state.unlockedScarves],
      scarves: SCARVES.map(scarf => ({ ...scarf, unlocked: state.unlockedScarves.includes(scarf.id), selected: state.selectedScarf === scarf.id })),
      nextScarf: (() => { const scarf = SCARVES.find(item => !state.unlockedScarves.includes(item.id)); return scarf ? { ...scarf } : null; })(),
      activeDays: state.activeDayCount, date: state.daily.date,
    };
  }

  return Object.freeze({ create, normalize, dayKey, record, claimDaily, selectScarf, snapshot });
});
