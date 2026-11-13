/* Daily wishes, small celebrations, and a playable handshake lesson. */
(() => {
  'use strict';
  const J = window.PuppyJourney;
  const room = document.querySelector('#pet-room');
  if (!J || !room) return;
  const $ = selector => document.querySelector(selector);
  const KEY = 'kali-puppy-journey-v1';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const icons = { stroke: '♡', play: '◌', train: '♧' };
  const actionLabels = { stroke: '摸摸它', play: '陪它玩球', train: '练习握手' };
  const badgeIcons = ['♡', '◌', '♧', '⌂', '✧', '❀', '✦', '∞'];
  let storageWorks = true;
  let pet = { name: '小黑', sleeping: false, busy: false };
  let active = false;
  let frame = 0;
  let startedAt = 0;
  let marker = .5;
  let trainingOpener;
  let rewardTimer;

  function load(fallback = null) {
    let raw;
    try { raw = localStorage.getItem(KEY); }
    catch { storageWorks = false; return J.normalize(fallback, Date.now()); }
    try { return J.normalize(JSON.parse(raw), Date.now()); }
    catch { return J.normalize(fallback, Date.now()); }
  }
  let state = load();
  function saveWarning(visible) {
    for (const id of ['#journey-album-warning', '#daily-gift-save-warning']) $(id).hidden = !visible;
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageWorks = true; saveWarning(false); return true; }
    catch {
      storageWorks = false;
      $('#journey-feedback').textContent = '这次的默契先记在这里；当前浏览器无法保存，关闭后可能重新开始。';
      saveWarning(true);
      return false;
    }
  }
  function latest() { return storageWorks ? load(state) : state; }
  function emit(name, detail) { room.dispatchEvent(new CustomEvent(`journey:${name}`, { detail })); }
  function feedback(text) { $('#journey-feedback').textContent = text; }
  function showReward(text) {
    clearTimeout(rewardTimer);
    const reward = $('#interaction-reward');
    reward.textContent = text;
    reward.hidden = false;
    reward.classList.remove('is-celebrating');
    void reward.offsetWidth;
    reward.classList.add('is-celebrating');
    rewardTimer = setTimeout(() => { reward.hidden = true; }, reduce.matches ? 2200 : 2800);
  }
  function applyScarf(view) {
    const scarf = view.scarves.find(item => item.selected);
    room.dataset.scarf = view.selectedScarf;
    room.style.setProperty('--scarf-color', scarf.color);
    window.littlePuppy?.setScarf?.(view.selectedScarf);
  }

  for (const action of ['stroke', 'play', 'train']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.innerHTML = `<span class="daily-task-icon" aria-hidden="true">${icons[action]}</span><span class="daily-task-copy"><strong></strong><small></small></span><span class="daily-task-check" aria-hidden="true"></span>`;
    button.addEventListener('click', () => {
      if (pet.sleeping || pet.busy || active) return;
      if (action === 'train') startTraining(button);
      else {
        room.scrollIntoView({ behavior: reduce.matches ? 'instant' : 'smooth', block: 'center' });
        emit('request', { action });
      }
    });
    $('#daily-tasks').append(button);
  }

  function renderAlbum(view) {
    const focusedScarf = document.activeElement?.closest('[data-scarf]')?.dataset.scarf;
    $('#journey-album-summary').textContent = `已经在 ${view.activeDays} 个日子里认真相处，攒下 ${view.totalXp} 点默契、${view.gifts} 份心愿礼物。`;
    $('#badge-count').textContent = `${view.badges.filter(badge => badge.unlocked).length} / ${view.badges.length}`;
    const badges = $('#journey-badges');
    badges.replaceChildren();
    view.badges.forEach((badge, index) => {
      const node = document.createElement('div');
      node.className = 'journey-badge';
      node.dataset.unlocked = String(badge.unlocked);
      const icon = document.createElement('span');
      icon.className = 'journey-badge-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = badgeIcons[index % badgeIcons.length];
      const title = document.createElement('strong');
      title.textContent = badge.label;
      const description = document.createElement('small');
      description.textContent = badge.description;
      const status = document.createElement('span');
      status.className = 'journey-badge-status';
      status.textContent = badge.unlocked ? '已经拥有' : '慢慢解锁';
      node.append(icon, title, description, status);
      badges.append(node);
    });
    $('#wardrobe-note').textContent = view.nextScarf ? `再收下 ${view.nextScarf.requiredGifts - view.gifts} 份心愿礼物，就能得到「${view.nextScarf.label}」领巾。` : '四种颜色都收好啦，今天想穿哪一种？';
    const wardrobe = $('#journey-wardrobe');
    wardrobe.replaceChildren();
    view.scarves.forEach(scarf => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.scarf = scarf.id;
      button.disabled = !scarf.unlocked;
      button.setAttribute('aria-pressed', String(scarf.selected));
      button.style.setProperty('--swatch-color', scarf.color);
      const swatch = document.createElement('span');
      swatch.className = 'scarf-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      const label = document.createElement('strong');
      label.textContent = scarf.label;
      const hint = document.createElement('small');
      hint.textContent = scarf.selected ? '今天的选择' : scarf.unlocked ? '给它戴上' : `${scarf.requiredGifts} 份心愿礼物`;
      button.append(swatch, label, hint);
      button.addEventListener('click', () => {
        state = J.selectScarf(latest(), scarf.id, Date.now());
        render();
        feedback(`${pet.name}戴上了「${scarf.label}」领巾，是和你一起攒下的小喜欢。`);
        persist();
      });
      wardrobe.append(button);
    });
    if (focusedScarf && $('#journey-album').open) wardrobe.querySelector(`[data-scarf="${focusedScarf}"]`)?.focus({ preventScroll: true });
  }

  function render() {
    const previousDate = state.daily.date;
    state = J.normalize(state, Date.now());
    const view = J.snapshot(state, Date.now());
    if (previousDate !== view.date) persist();
    $('#journey-level').textContent = String(view.level);
    $('#journey-level-label').textContent = view.levelLabel;
    $('#journey-xp').textContent = `${view.xpInLevel} / ${view.xpToNext}`;
    const progress = $('#journey-progress');
    progress.setAttribute('aria-valuenow', String(view.xpInLevel));
    progress.setAttribute('aria-valuemax', String(view.xpToNext));
    progress.setAttribute('aria-valuetext', `第 ${view.level} 级，本级 ${view.xpInLevel} / ${view.xpToNext} 点默契`);
    progress.firstElementChild.style.width = `${view.xpInLevel / view.xpToNext * 100}%`;
    $('#daily-count').textContent = `${view.completedTasks} / 3`;
    for (const task of view.tasks) {
      const button = $(`#daily-tasks [data-action="${task.action}"]`);
      button.dataset.done = String(task.done);
      button.disabled = pet.busy || pet.sleeping || active;
      button.querySelector('strong').textContent = task.label;
      button.querySelector('small').textContent = task.done ? '小心愿实现啦' : pet.sleeping ? '睡醒再一起玩' : actionLabels[task.action];
      button.querySelector('.daily-task-check').textContent = task.done ? '✓' : '↗';
      button.setAttribute('aria-label', `${task.label}，${task.done ? '已完成，也可以再玩一次' : actionLabels[task.action]}`);
    }
    $('#daily-gift').disabled = view.dailyClaimed || view.completedTasks < 3;
    $('#daily-gift').dataset.ready = String(!view.dailyClaimed && view.completedTasks === 3);
    $('#daily-gift-label').textContent = view.dailyClaimed ? '今天的小惊喜，已经收好啦' : view.completedTasks === 3 ? '拆开今天的小礼物' : `实现 3 个小心愿，拆一份小惊喜（${view.completedTasks}/3）`;
    $('#daily-note').textContent = view.dailyClaimed ? '明天还有新的小心愿。今天也可以继续陪它玩。' : '小心愿每天换新，攒下的默契一直都在。';
    $('#training-start').disabled = pet.busy || pet.sleeping || active;
    $('#training-label').textContent = view.training.label;
    $('#training-progress').textContent = view.training.nextAt === null ? `已经一起练了 ${view.training.completed} 次，每次都很珍贵` : `已经握手 ${view.training.completed} 次 · 再练 ${view.training.nextAt - view.training.completed} 次，更有默契`;
    applyScarf(view);
    renderAlbum(view);
  }

  function stopTraining(restoreFocus = false) {
    if (!active) return;
    active = false;
    cancelAnimationFrame(frame);
    $('#training-game').hidden = true;
    room.removeAttribute('data-training');
    render();
    if (restoreFocus && trainingOpener?.isConnected && !trainingOpener.disabled) trainingOpener.focus({ preventScroll: true });
  }
  function animateMarker(time) {
    if (!active) return;
    marker = reduce.matches ? .55 : (1 - Math.cos((time - startedAt) / 850)) / 2;
    $('#training-marker').style.left = `${marker * 100}%`;
    if (!reduce.matches) frame = requestAnimationFrame(animateMarker);
  }
  function startTraining(opener) {
    if (pet.busy || pet.sleeping || active || document.querySelector('dialog[open]')) return;
    trainingOpener = opener;
    active = true;
    startedAt = performance.now();
    marker = reduce.matches ? .55 : 0;
    $('#training-game').hidden = false;
    room.dataset.training = 'true';
    $('#training-instruction').textContent = reduce.matches ? '把手伸过去，让小爪爪安心落进手心。' : '光点走进绿色时，伸出你的手。慢一点也没关系。';
    $('#training-hand').textContent = reduce.matches ? '把手伸过去，握一握' : '伸出手，握一握';
    room.scrollIntoView({ behavior: 'instant', block: 'center' });
    render();
    animateMarker(startedAt);
    $('#training-hand').focus({ preventScroll: true });
  }
  $('#training-start').addEventListener('click', event => startTraining(event.currentTarget));
  $('#training-cancel').addEventListener('click', () => { stopTraining(true); feedback('小爪爪先收好，想练的时候再来。'); });
  $('#training-hand').addEventListener('click', () => {
    if (!active) return;
    const quality = marker >= .40 && marker <= .70 ? 'perfect' : 'normal';
    stopTraining();
    room.focus({ preventScroll: true });
    emit('request', { action: 'train', quality });
  });
  $('#training-game').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); stopTraining(true); }
  });
  reduce.addEventListener('change', () => {
    if (!active) return;
    cancelAnimationFrame(frame);
    startedAt = performance.now();
    animateMarker(startedAt);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTraining();
    else render();
  });
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); clearTimeout(rewardTimer); });
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('toggle', event => { if (event.newState === 'open') stopTraining(); });
  }
  room.addEventListener('pet:state', event => {
    pet = { ...pet, ...event.detail };
    if (pet.sleeping || pet.busy) stopTraining();
    render();
  });
  room.addEventListener('puppy:ready', () => { applyScarf(J.snapshot(state, Date.now())); });
  room.addEventListener('pet:completed', event => {
    const result = J.record(latest(), { id: event.detail.id, type: event.detail.action, quality: event.detail.quality }, Date.now());
    state = result.state;
    render();
    if (result.xpGained <= 0) return;
    const view = J.snapshot(state, Date.now());
    const perfect = event.detail.quality === 'perfect';
    const prefix = result.levelUp ? `升到 Lv.${view.level}，${view.levelLabel}！` : perfect ? '刚刚好的握手，小狗记住啦！' : '认真相处的小事，小狗都记得。';
    const badgeCopy = result.newBadges.length ? ` · 新纪念章「${result.newBadges[0].label}」` : '';
    feedback(`${prefix} +${result.xpGained} 点默契${badgeCopy}`);
    showReward(result.levelUp ? `Lv.${view.level} · 我们更熟啦` : perfect ? `默契握手 +${result.xpGained} ✧` : `小默契 +${result.xpGained} ♡`);
    persist();
  });
  $('#daily-gift').addEventListener('click', () => {
    const before = J.snapshot(latest(), Date.now());
    const result = J.claimDaily(latest(), Date.now());
    state = result.state;
    render();
    if (!result.claimed) return;
    const view = J.snapshot(state, Date.now());
    const newScarf = view.scarves.find(scarf => !before.unlockedScarves.includes(scarf.id) && scarf.unlocked);
    $('#daily-gift-heading').textContent = newScarf ? `一条「${newScarf.label}」小领巾` : '今天的喜欢，好好收下啦';
    $('#daily-gift-description').textContent = newScarf ? `是和${pet.name}一起实现小心愿的礼物。这份新颜色收进衣橱啦，还收下了 ${result.xpGained} 点新默契。` : `和${pet.name}一起完成了今天的 3 个小心愿，收下 ${result.xpGained} 点默契和一份温柔的回忆。`;
    $('#gift-illustration').style.setProperty('--gift-color', view.scarves.find(scarf => scarf.selected).color);
    $('#gift-next').textContent = view.nextScarf ? `再收下 ${view.nextScarf.requiredGifts - view.gifts} 份心愿礼物，会遇见「${view.nextScarf.label}」。` : '所有领巾都收集齐啦，默契还在慢慢长大。';
    $('#daily-gift-dialog').showModal();
    feedback(`今天的小心愿都实现啦，收下了第 ${view.gifts} 份小礼物。`);
    persist();
    emit('gift', { name: newScarf?.label, gifts: view.gifts });
  });
  $('#daily-gift-close').addEventListener('click', () => $('#daily-gift-dialog').close());
  $('#daily-gift-dialog').addEventListener('close', () => { $('#journey-album-open').focus({ preventScroll: true }); });
  $('#journey-album-open').addEventListener('click', () => {
    stopTraining(); render(); $('#journey-album').showModal();
  });
  $('#journey-album-close').addEventListener('click', () => $('#journey-album').close());
  for (const dialog of [$('#journey-album'), $('#daily-gift-dialog')]) {
    let backdropDown = false;
    const outside = event => { const rect = dialog.getBoundingClientRect(); return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom; };
    dialog.addEventListener('pointerdown', event => { backdropDown = event.target === dialog && outside(event); });
    dialog.addEventListener('click', event => { if (backdropDown && event.target === dialog && outside(event)) dialog.close(); backdropDown = false; });
  }
  window.addEventListener('storage', event => {
    if (event.key === KEY || event.key === null) { state = load(state); render(); }
  });
  render();
})();
