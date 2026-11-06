(() => {
  'use strict';

  const room = document.querySelector('#pet-room');
  const companion = document.querySelector('.companionship');
  const memories = document.querySelector('.pet-memory');
  if (!room || (!companion && !memories) || document.querySelector('#room-decor-dialog')) return;

  const STORAGE_KEY = 'kali-little-room-v1';
  const options = {
    roomTheme: ['mint', 'peach', 'night'],
    roomRug: ['oval', 'gingham', 'cloud'],
    roomItem: ['plant', 'lamp', 'stars'],
  };
  const defaults = { roomTheme: 'mint', roomRug: 'oval', roomItem: 'plant' };

  function normalize(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.entries(options).map(([key, values]) => [
      key, values.includes(source[key]) ? source[key] : defaults[key],
    ]));
  }

  function readSaved() {
    try { return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
    catch { return { ...defaults }; }
  }

  function apply(value) {
    const style = normalize(value);
    for (const key of Object.keys(options)) room.dataset[key] = style[key];
  }

  let saved = readSaved();
  apply(saved);

  // These decorations sit in the existing wall, behind the live puppy canvas.
  const wall = room.querySelector('.room-wall');
  if (wall) {
    const decorations = document.createElement('div');
    decorations.className = 'room-decor-objects';
    decorations.setAttribute('aria-hidden', 'true');
    decorations.innerHTML = '<div class="room-decor-lamp"><span class="room-decor-lamp-glow"></span><span class="room-decor-lamp-base"></span></div><div class="room-decor-stars"><span>✦</span><span>✧</span><span>✦</span></div>';
    wall.append(decorations);
  }

  const entry = document.createElement('div');
  entry.className = 'room-decor-entry';
  entry.innerHTML = '<button type="button" class="room-decor-launch" aria-haspopup="dialog" aria-controls="room-decor-dialog"><span class="room-decor-launch-icon" aria-hidden="true">⌂</span><span><strong>布置小窝</strong><small>换个地毯，添一点喜欢的小物</small></span><span class="room-decor-launch-arrow" aria-hidden="true">↗</span></button>';
  if (companion) companion.after(entry);
  else memories.before(entry);
  const launch = entry.querySelector('button');

  const dialog = document.createElement('dialog');
  dialog.id = 'room-decor-dialog';
  dialog.className = 'room-decor-dialog';
  dialog.setAttribute('aria-labelledby', 'room-decor-title');
  dialog.setAttribute('aria-describedby', 'room-decor-description');
  // All HTML here is constant. Stored values only select validated radio values.
  dialog.innerHTML = `
    <button type="button" class="room-decor-close" aria-label="取消布置并关闭">×</button>
    <p class="room-decor-eyebrow">MAKE OURSELVES AT HOME</p>
    <h2 id="room-decor-title">布置小窝</h2>
    <p class="room-decor-description" id="room-decor-description">挑几样喜欢的，给小窝换个心情。选好后记得保存哦。</p>
    <form class="room-decor-form">
      <fieldset><legend>房间的颜色</legend><div class="room-decor-choices">
        <label class="room-decor-choice"><input type="radio" name="roomTheme" value="mint"><span class="room-decor-swatch room-decor-swatch-mint" aria-hidden="true"></span><span>薄荷</span></label>
        <label class="room-decor-choice"><input type="radio" name="roomTheme" value="peach"><span class="room-decor-swatch room-decor-swatch-peach" aria-hidden="true"></span><span>奶油落日</span></label>
        <label class="room-decor-choice"><input type="radio" name="roomTheme" value="night"><span class="room-decor-swatch room-decor-swatch-night" aria-hidden="true"></span><span>星星夜</span></label>
      </div></fieldset>
      <fieldset><legend>软软的地毯</legend><div class="room-decor-choices">
        <label class="room-decor-choice"><input type="radio" name="roomRug" value="oval"><span class="room-decor-swatch room-decor-swatch-oval" aria-hidden="true"></span><span>编织</span></label>
        <label class="room-decor-choice"><input type="radio" name="roomRug" value="gingham"><span class="room-decor-swatch room-decor-swatch-gingham" aria-hidden="true"></span><span>格纹</span></label>
        <label class="room-decor-choice"><input type="radio" name="roomRug" value="cloud"><span class="room-decor-swatch room-decor-swatch-cloud" aria-hidden="true"></span><span>云朵</span></label>
      </div></fieldset>
      <fieldset><legend>添一件小摆设</legend><div class="room-decor-choices">
        <label class="room-decor-choice"><input type="radio" name="roomItem" value="plant"><span class="room-decor-swatch room-decor-swatch-item" aria-hidden="true">❧</span><span>绿植</span></label>
        <label class="room-decor-choice"><input type="radio" name="roomItem" value="lamp"><span class="room-decor-swatch room-decor-swatch-item room-decor-swatch-lamp" aria-hidden="true">☼</span><span>小夜灯</span></label>
        <label class="room-decor-choice"><input type="radio" name="roomItem" value="stars"><span class="room-decor-swatch room-decor-swatch-item room-decor-swatch-stars" aria-hidden="true">✦</span><span>星星挂饰</span></label>
      </div></fieldset>
      <div class="room-decor-actions"><button type="button" class="room-decor-cancel">取消</button><button type="submit" class="room-decor-save">保存布置</button></div>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');

  function selection() {
    return normalize(Object.fromEntries(new FormData(form)));
  }

  function restore() {
    apply(saved);
    launch.focus({ preventScroll: true });
  }

  launch.addEventListener('click', () => {
    if (dialog.open) return;
    for (const input of form.querySelectorAll('input[type="radio"]')) {
      input.checked = saved[input.name] === input.value;
    }
    apply(saved);
    dialog.returnValue = '';
    dialog.showModal();
  });
  form.addEventListener('input', () => { apply(selection()); });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saved = selection();
    let persisted = true;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); }
    catch { persisted = false; }
    apply(saved);
    dialog.close('saved');
    room.dispatchEvent(new CustomEvent('room:style-saved', { detail: { ...saved, persisted }, bubbles: true }));
  });
  dialog.querySelector('.room-decor-cancel').addEventListener('click', () => { dialog.close('cancelled'); });
  dialog.querySelector('.room-decor-close').addEventListener('click', () => { dialog.close('cancelled'); });
  // Escape uses the native cancel/close flow; every close restores the saved style.
  dialog.addEventListener('close', restore);
  let backdropPress = false;
  function outside(event) {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  }
  dialog.addEventListener('pointerdown', (event) => { backdropPress = event.target === dialog && outside(event); });
  dialog.addEventListener('click', (event) => {
    if (backdropPress && event.target === dialog && outside(event)) dialog.close('cancelled');
    backdropPress = false;
  });
})();
