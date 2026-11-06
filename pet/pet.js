(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const STORAGE_KEY = 'kali-little-dog-v1';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const HOUR = 3600000;
  const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
  let toastTimer;
  let animationTimer;
  let isBusy = false;
  let installPrompt;
  let storageAvailable = true;
  let lastStrokeAt = 0;
  let liveDog = window.littlePuppy || null;
  let currentAction = null;
  let actionToken = 0;
  let cancelFallback;
  let soundEnabled = false;
  let audio;

  function showToast(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
  }

  function playSound(kind) {
    if (!soundEnabled || document.hidden) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      audio ||= new Context();
      if (audio.state === 'suspended') void audio.resume().catch(() => {});
      const now = audio.currentTime;
      const gain = audio.createGain();
      gain.connect(audio.destination);
      if (kind === 'crunch') {
        const buffer = audio.createBuffer(1, audio.sampleRate * .16, audio.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i += 1) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audio.sampleRate * .035));
        const source = audio.createBufferSource();source.buffer = buffer;
        const filter = audio.createBiquadFilter();filter.type = 'bandpass';filter.frequency.value = 1400;filter.Q.value = .7;
        gain.gain.value = .11;source.connect(filter);filter.connect(gain);source.start();
        source.onended = () => { source.disconnect();filter.disconnect();gain.disconnect(); };
      } else {
        const oscillator = audio.createOscillator();
        oscillator.type = kind === 'happy' ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(kind === 'happy' ? 190 : kind === 'throw' ? 500 : 170, now);
        oscillator.frequency.exponentialRampToValueAtTime(kind === 'happy' ? 115 : 80, now + .16);
        gain.gain.setValueAtTime(0, now);gain.gain.linearRampToValueAtTime(.035, now + .015);gain.gain.exponentialRampToValueAtTime(.001, now + .22);
        oscillator.connect(gain);oscillator.start(now);oscillator.stop(now + .24);
        oscillator.onended = () => { oscillator.disconnect();gain.disconnect(); };
      }
    } catch { /* Audio must never block care or animations. */ }
  }

  $('#pet-sound-toggle').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    $('#pet-sound-toggle').setAttribute('aria-pressed', String(soundEnabled));
    $('#pet-sound-toggle').setAttribute('aria-label', soundEnabled ? '关闭小狗音效' : '开启小狗音效');
    $('#pet-sound-toggle').title = soundEnabled ? '关闭小狗音效' : '开启小狗音效';
    $('#pet-sound-waves').setAttribute('d', soundEnabled ? 'M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14' : 'm16 9 5 6m0-6-5 6');
    playSound('happy');
    showToast(soundEnabled ? '轻轻的互动音效，打开啦。' : '音效已关闭。');
  });

  function createPet() {
    const now = Date.now();
    return { version: 1, name: '小黑', hunger: 80, mood: 85, energy: 85, affection: 0, sleeping: false,
      bornAt: now, updatedAt: now, memories: [{ text: '小黑和宝宝，第一次见面。', at: now }] };
  }

  function loadPet() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createPet();
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== 1 || !['hunger', 'mood', 'energy', 'bornAt', 'updatedAt'].every((key) => typeof saved[key] === 'number' && Number.isFinite(saved[key]))) return createPet();
      const now = Date.now();
      return {
        version: 1,
        name: typeof saved.name === 'string' && saved.name.trim() ? [...saved.name.trim()].slice(0, 12).join('') : '小黑',
        hunger: clamp(saved.hunger), mood: clamp(saved.mood), energy: clamp(saved.energy),
        affection: typeof saved.affection === 'number' && Number.isFinite(saved.affection) ? clamp(saved.affection, 0, 9999) : 0,
        sleeping: saved.sleeping === true,
        bornAt: clamp(saved.bornAt, 0, now), updatedAt: clamp(saved.updatedAt, 0, now),
        memories: Array.isArray(saved.memories) ? saved.memories.filter((item) => item && typeof item.text === 'string' && Number.isFinite(item.at)).slice(0, 3).map((item) => ({ text: item.text.slice(0, 80), at: clamp(item.at, 0, now) })) : [],
      };
    } catch {
      // Private browsing or a damaged save must not prevent playing.
      return createPet();
    }
  }

  let pet = loadPet();

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pet)); }
    catch {
      if (storageAvailable) showToast('当前浏览器无法保存，关闭页面后小狗会重新开始哦。');
      storageAvailable = false;
    }
  }

  function settleTime() {
    const now = Date.now();
    const hours = clamp((now - pet.updatedAt) / HOUR, 0, 72);
    pet.hunger = Math.max(35, pet.hunger - hours * (pet.sleeping ? 1.5 : 3));
    pet.mood = Math.max(45, pet.mood - hours * (pet.sleeping ? 0.3 : 1.5));
    pet.energy = pet.sleeping ? clamp(pet.energy + hours * 9) : Math.max(25, pet.energy - hours * 2);
    pet.updatedAt = now;
  }

  function defaultSpeech() {
    if (pet.sleeping) return '呼噜……梦里也有宝宝。';
    if (pet.hunger < 50) return '宝宝，想吃一口小零食。';
    if (pet.energy < 40) return '有一点点困，想打个小盹。';
    return '宝宝，你来啦！摸摸我的头嘛。';
  }

  function memoryTime(time) {
    const date = new Date(time);
    if (date.toDateString() === new Date().toDateString()) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function render() {
    $('#pet-name').textContent = pet.name;
    $('#dog-touch').setAttribute('aria-label', `摸摸${pet.name}`);
    $('#pet-description').textContent = '一只喜欢宝宝的黑色拉布拉多';
    $('#room-status').textContent = pet.sleeping ? `${pet.name}在做美梦` : currentAction === 'play' ? `${pet.name}在追球` : currentAction === 'feed' ? `${pet.name}在吃东西` : `${pet.name}在家`;
    $('.room-bowl>span').textContent = pet.name.length > 4 ? '汪汪' : pet.name;
    $('#day-count').textContent = String(Math.max(1, Math.floor((Date.now() - pet.bornAt) / (24 * HOUR)) + 1));
    $('#pet-room').classList.toggle('is-sleeping', pet.sleeping);
    if (pet.sleeping) resetTilt();
    if (liveDog) liveDog.sleep(pet.sleeping);
    $('#action-sleep').setAttribute('aria-pressed', String(pet.sleeping));
    $('#sleep-action-label').textContent = pet.sleeping ? '起床' : '睡觉';
    $('#sleep-action-hint').textContent = pet.sleeping ? '轻轻叫醒' : '充充电';
    $('#room-bottom-note').textContent = pet.sleeping ? '让小狗休息一下，醒来再玩也很好' : liveDog ? '按住小狗轻轻摸，也可以拖动球球抛给它' : '点点小狗，也可以摸摸它哦';
    for (const key of ['hunger', 'mood', 'energy']) {
      const value = Math.round(pet[key]);
      $(`#${key}-label`).textContent = `${value}%`;
      $(`#${key}-meter`).setAttribute('aria-valuenow', String(value));
      $(`#${key}-meter>span`).style.width = `${value}%`;
    }
    const affection = pet.affection;
    $('#affection-heading').textContent = affection >= 50 ? '是见到宝宝，就会摇尾巴的小狗。' : affection >= 15 ? '喜欢宝宝，已经藏不住啦。' : '今天，也是被喜欢的小狗。';
    $('#affection-copy').textContent = '不需要打卡，有空来看看就很好。';
    const list = $('#memory-list');
    list.replaceChildren();
    pet.memories.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'memory-row';
      const text = document.createElement('span');
      text.textContent = item.text;
      const time = document.createElement('time');
      time.dateTime = new Date(item.at).toISOString();
      time.textContent = memoryTime(item.at);
      row.append(text, time);
      list.append(row);
    });
  }

  function remember(text) {
    pet.memories.unshift({ text, at: Date.now() });
    pet.memories = pet.memories.slice(0, 3);
  }

  function hearts() {
    if (reducedMotion.matches) return;
    for (let i = 0; i < 4; i += 1) {
      const heart = document.createElement('span');
      heart.className = 'pet-heart';
      heart.textContent = i % 2 ? '♡' : '♥';
      heart.style.left = `${35 + Math.random() * 30}%`;
      heart.style.top = `${40 + Math.random() * 12}%`;
      heart.style.animationDelay = `${i * 0.12}s`;
      $('#pet-hearts').append(heart);
      heart.addEventListener('animationend', () => heart.remove(), { once: true });
    }
  }

  function setBusy(value) {
    isBusy = value;
    $('#pet-room').setAttribute('aria-busy', String(value));
    document.querySelectorAll('#action-stroke,#action-feed,#action-play,#dog-touch,#food-bowl,#toy-ball').forEach((button) => { button.disabled = value; });
    // Rest can interrupt a game; the user is never trapped in an animation.
    $('#action-sleep').disabled = false;
  }

  function animateFallback(className, duration) {
    return new Promise((resolve) => {
      $('#pet-room').classList.remove('is-stroking', 'is-feeding', 'is-playing');
      void $('#pet-room').offsetWidth;
      $('#pet-room').classList.add(className);
      cancelFallback = () => { clearTimeout(animationTimer);resolve(false); };
      animationTimer = setTimeout(() => { cancelFallback = null;resolve(true); }, reducedMotion.matches ? 120 : duration);
    });
  }

  async function interact(action, options = {}) {
    settleTime();
    if (action === 'sleep') {
      actionToken += 1;
      if (cancelFallback) { cancelFallback();cancelFallback = null; }
      liveDog?.cancel();
      currentAction = null;setBusy(false);
      $('#pet-room').classList.remove('is-stroking', 'is-feeding', 'is-playing');
      pet.sleeping = !pet.sleeping;
      $('#pet-speech').textContent = pet.sleeping ? '晚安宝宝，小狗先做个甜甜的梦。' : '睡醒啦！第一眼就看到宝宝，真好。';
      remember(pet.sleeping ? `${pet.name}打起了小呼噜。` : `${pet.name}睡醒了，又可以一起玩啦。`);
      render();persist();return;
    }
    if (isBusy) return;
    if (pet.sleeping) {
      $('#pet-speech').textContent = action === 'stroke' ? '轻轻摸摸……小狗睡得更香啦。' : '小狗在休息，等它醒来再一起玩吧。';
      if (action === 'stroke') hearts();
      render();persist();return;
    }
    if (action === 'feed' && pet.hunger >= 98) {
      $('#pet-speech').textContent = '肚子已经圆圆啦，先收好零食吧。';liveDog?.cancel();render();persist();return;
    }
    if (action === 'play' && pet.energy < 30) {
      $('#pet-speech').textContent = '小狗有点累啦，先陪它睡一小觉吧。';liveDog?.cancel();render();persist();return;
    }
    const token = ++actionToken;
    currentAction = action;setBusy(true);render();
    $('#pet-speech').textContent = action === 'feed' ? '听见碗里的声音啦，小黑走过去看看。' : action === 'play' ? '准备好啦，宝宝把球抛给我吧！' : options.zone === 'chin' ? '挠挠下巴，舒服得仰起头啦。' : options.zone === 'ear' ? '耳朵也想贴贴宝宝的手。' : '摸摸脑袋，小黑靠过来蹭蹭你。';
    if (action === 'stroke') hearts();
    let completed;
    try {
      completed = liveDog
        ? await liveDog.perform(action, options)
        : await animateFallback(({ stroke: 'is-stroking', feed: 'is-feeding', play: 'is-playing' })[action], action === 'stroke' ? 900 : 1800);
    } catch { completed = false; }
    if (token !== actionToken) return;
    currentAction = null;setBusy(false);
    $('#pet-room').classList.remove('is-stroking', 'is-feeding', 'is-playing');
    if (!completed) { render();persist();return; }
    // Care only counts once the dog has actually finished the interaction.
    settleTime();
    if (action === 'stroke') {
      pet.mood = clamp(pet.mood + 7);
      if (Date.now() - lastStrokeAt > 5000) {
        pet.affection = clamp(pet.affection + 3, 0, 9999);
        remember(`宝宝摸了摸${pet.name}，小狗凑过来贴贴。`);lastStrokeAt = Date.now();
      }
      $('#pet-speech').textContent = '最喜欢宝宝这样摸摸我啦 ♡';
    } else if (action === 'feed') {
      pet.hunger = clamp(pet.hunger + 22);pet.mood = clamp(pet.mood + 4);pet.affection = clamp(pet.affection + 2, 0, 9999);
      remember(`${pet.name}走到小碗前，认真吃完了零食。`);
      $('#pet-speech').textContent = '舔舔嘴巴，宝宝给的零食真好吃。';
    } else if (action === 'play') {
      pet.mood = clamp(pet.mood + 12);pet.energy = clamp(pet.energy - 9);pet.hunger = clamp(pet.hunger - 3);pet.affection = clamp(pet.affection + 4, 0, 9999);
      remember(`${pet.name}追到球，又叼回来送给了宝宝。`);
      $('#pet-speech').textContent = '球球叼回来啦，放到宝宝面前！';
    }
    render();persist();
  }

  $('#dog-touch').addEventListener('click', () => interact('stroke'));
  // A small perspective response adds depth without a heavy 3D engine.
  // Pointer values are capped, and touch gestures remain free to scroll the page.
  const room = $('#pet-room');
  room.addEventListener('puppy:ready', (event) => { liveDog = event.detail;render(); });
  room.addEventListener('puppy:pet', (event) => { void interact('stroke', event.detail); });
  room.addEventListener('puppy:throw', (event) => { void interact('play', event.detail); });
  room.addEventListener('puppy:phase', (event) => { if (currentAction) $('#pet-speech').textContent = event.detail.text; });
  room.addEventListener('puppy:sound', (event) => playSound(event.detail.kind));
  room.addEventListener('puppy:unavailable', () => { liveDog = null;render(); });
  $('#food-bowl').addEventListener('click', () => { void interact('feed'); });
  $('#toy-ball').addEventListener('click', (event) => {
    // A captured drag has already emitted its own throw at pointerup.
    if (Date.now() - (room.lastBallDrag || 0) < 400) return;
    void interact('play');
  });
  function resetTilt() {
    room.style.setProperty('--tilt-x', '0deg');
    room.style.setProperty('--tilt-y', '0deg');
  }
  room.addEventListener('pointermove', (event) => {
    if (liveDog || reducedMotion.matches || pet.sleeping || isBusy) return;
    const bounds = room.getBoundingClientRect();
    const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1) - 0.5;
    const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1) - 0.5;
    room.style.setProperty('--tilt-x', `${(x * 8).toFixed(2)}deg`);
    room.style.setProperty('--tilt-y', `${(-y * 5).toFixed(2)}deg`);
  }, { passive: true });
  room.addEventListener('pointerleave', resetTilt);
  room.addEventListener('pointerup', (event) => { if (event.pointerType === 'touch') resetTilt(); });
  reducedMotion.addEventListener('change', resetTilt);
  for (const action of ['stroke', 'feed', 'play', 'sleep']) {
    $(`#action-${action}`).addEventListener('click', () => interact(action));
  }

  const dialog = $('#pet-dialog');
  function openDialog(focusName = false) {
    $('#pet-name-input').value = pet.name;
    dialog.showModal();
    if (focusName) { $('#pet-name-input').focus(); $('#pet-name-input').select(); }
  }
  $('#help-button').addEventListener('click', () => openDialog());
  $('#rename-button').addEventListener('click', () => openDialog(true));
  $('#dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  $('#rename-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = [...$('#pet-name-input').value.trim()].slice(0, 12).join('');
    if (!name) { $('#pet-name-input').focus(); return; }
    settleTime();
    if (name !== pet.name) remember(`宝宝给小狗取了名字：${name}。`);
    pet.name = name;
    $('#pet-speech').textContent = `以后就叫${name}啦，宝宝一喊我就到！`;
    render(); persist(); dialog.close();
    showToast('新名字收好啦 ♡');
  });

  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installPrompt = event; });
  $('#install-button').addEventListener('click', async () => {
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = undefined;
      await prompt.prompt();
      await prompt.userChoice;
    } else openDialog();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = undefined;
    $('#install-button').hidden = true;
    showToast('小狗搬到宝宝的桌面啦 ♡');
  });
  const standalone = matchMedia('(display-mode: standalone)');
  function updateInstallButton() { $('#install-button').hidden = standalone.matches || navigator.standalone === true; }
  standalone.addEventListener('change', updateInstallButton);
  updateInstallButton();

  function refreshTime() {
    settleTime(); render(); persist();
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshTime(); });
  setInterval(refreshTime, 60000);
  // Other open tabs use the most recently saved state, avoiding divergent pets.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    pet = loadPet();
    settleTime(); render();
    $('#pet-speech').textContent = defaultSpeech();
  });

  settleTime(); render(); persist();
  $('#pet-speech').textContent = defaultSpeech();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      showToast('暂时没能准备好离线模式，联网时可以正常玩。');
    });
  }
})();
