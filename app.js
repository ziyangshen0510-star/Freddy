(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const dialogues = [
    { call: '小黑？你在吗？', reply: '我在，宝宝。', response: '我在，宝宝，我听着呢。' },
    { call: '我刚刚喊了你好几声……', reply: '对不起，刚才没有回应你。', response: '对不起，宝宝。刚才没有回应你，让你等了。' },
    { call: '那你现在有在认真听吗？', reply: '有的，宝宝，你慢慢说。', response: '有的。小黑认真听，你慢慢说。♡' },
  ];
  const promiseMessages = [
    '把每次回应，都变成一句让宝宝安心的「我在」。',
    '需要离开时先说一声，回来时也告诉宝宝。',
    '好好陪伴，是把注意力留给正在和我说话的你。',
    '先听懂你的委屈，再用行动慢慢改。',
  ];

  let responseIndex = 0;
  let responseBusy = false;
  let responseTimer;
  let promiseSet = new Set();
  let soundEnabled = false;
  let audioContext;
  let toastTimer;

  function sound(kind = 'tap') {
    if (!soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audioContext ||= new AudioContext();
      if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
      const notes = kind === 'success' ? [523.25, 659.25, 783.99] : [kind === 'heart' ? 659.25 : 523.25];
      notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const time = audioContext.currentTime + index * 0.11;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.075, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.38);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(time);
        oscillator.stop(time + 0.4);
      });
    } catch {
      // An unavailable audio device must never stop the game.
    }
  }

  function toast(message) {
    window.clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    toastTimer = window.setTimeout(() => { $('#toast').hidden = true; }, 3200);
  }

  $('#sound-toggle').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    const label = soundEnabled ? '关闭互动音效' : '开启互动音效';
    $('#sound-toggle').setAttribute('aria-pressed', String(soundEnabled));
    $('#sound-toggle').setAttribute('aria-label', label);
    $('#sound-toggle').title = label;
    $('#sound-waves').setAttribute('d', soundEnabled ? 'M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14' : 'm16 9 5 6m0-6-5 6');
    sound();
    toast(soundEnabled ? '轻轻的音效，打开啦。' : '音效已关闭，安安静静陪着你。');
  });

  function addMessage(text, self = false) {
    const message = document.createElement('div');
    message.className = `chat-message${self ? ' self' : ''}`;
    const avatar = document.createElement('span');
    avatar.className = 'chat-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    if (self) {
      const image = document.createElement('img');
      image.src = './assets/paw.svg';
      image.alt = '';
      image.width = 23;
      image.height = 23;
      avatar.append(image);
    } else {
      avatar.textContent = 'K';
    }
    const paragraph = document.createElement('p');
    const speaker = document.createElement('span');
    speaker.className = 'visually-hidden';
    speaker.textContent = self ? '小黑说：' : 'Kali 说：';
    paragraph.append(speaker, document.createTextNode(text));
    message.append(avatar, paragraph);
    $('#chat-body').append(message);
    $('#chat-body').scrollTo({ top: $('#chat-body').scrollHeight, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }

  function setReply() {
    const button = $('#reply-button');
    button.replaceChildren(document.createTextNode(`${dialogues[responseIndex].reply} `));
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↑';
    button.append(arrow);
    $('#response-counter').textContent = `第 ${responseIndex + 1} 声 / 共 3 声`;
    button.disabled = false;
  }

  function focusHeading(selector) {
    // Prevent focus scrolling to a hidden panel's old position.
    $(selector).focus({ preventScroll: true });
  }

  function scrollToGame() {
    $('#little-game').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
  }

  function setStage(index) {
    ['#stage-response', '#stage-promises', '#stage-letter'].forEach((selector, i) => {
      $(selector).hidden = i !== index;
    });
    $$('.journey-step').forEach((step, i) => {
      step.classList.toggle('is-current', i === index);
      step.classList.toggle('is-complete', i < index);
      if (i === index) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    $('#restart').hidden = index === 0;
    scrollToGame();
    focusHeading(['#response-heading', '#promises-heading', '#letter-heading'][index]);
  }

  $('#reply-button').addEventListener('click', () => {
    if (responseBusy || responseIndex >= dialogues.length) return;
    responseBusy = true;
    $('#reply-button').disabled = true;
    addMessage(dialogues[responseIndex].response, true);
    sound();
    responseIndex += 1;
    if (responseIndex === dialogues.length) {
      $('#reply-button').hidden = true;
      $('#response-counter').textContent = '3 / 3 · 宝宝的每一声，都接住了。';
      $('#response-success').hidden = false;
      responseBusy = false;
      sound('success');
      // Move focus to the available next action after the final reply disappears.
      $('#to-promises').focus({ preventScroll: true });
      return;
    }
    $('#response-counter').textContent = '宝宝还有话想说……';
    responseTimer = window.setTimeout(() => {
      addMessage(dialogues[responseIndex].call);
      setReply();
      responseBusy = false;
    }, reducedMotion.matches ? 120 : 650);
  });

  $('#to-promises').addEventListener('click', () => { setStage(1); sound(); });

  $$('.promise-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      const index = Number(tile.dataset.promise);
      if (promiseSet.has(index)) {
        $('#promise-caption').textContent = promiseMessages[index];
        return;
      }
      promiseSet.add(index);
      tile.setAttribute('aria-pressed', 'true');
      tile.querySelector('.promise-tile-bottom').replaceChildren(document.createTextNode('约定收好啦 ♡'));
      $('#promise-count').textContent = String(promiseSet.size);
      $('#promise-progress-bar').style.width = `${promiseSet.size * 25}%`;
      $('#promise-caption').textContent = promiseMessages[index];
      sound('heart');
      if (promiseSet.size === 4) {
        $('#promise-caption').textContent = '四份认真，拼成一颗心。更重要的是，以后慢慢做到。';
        $('#promise-next-hint').hidden = true;
        $('#to-letter').hidden = false;
        sound('success');
      }
    });
  });

  $('#to-letter').addEventListener('click', () => { setStage(2); sound(); });

  $('#open-letter').addEventListener('click', () => {
    $('#sealed-letter').hidden = true;
    $('#opened-letter').hidden = false;
    focusHeading('#open-letter-heading');
    scrollToGame();
    sound('success');
  });

  function confetti() {
    if (reducedMotion.matches) return;
    const colors = ['#a5b98e', '#dbaf95', '#c4cdab', '#dfcb9f', '#8fa786'];
    for (let i = 0; i < 32; i += 1) {
      const bit = document.createElement('span');
      bit.className = 'confetti-bit';
      bit.style.left = `${Math.random() * 100}%`;
      bit.style.width = `${4 + Math.random() * 5}px`;
      bit.style.height = `${7 + Math.random() * 7}px`;
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = `${Math.random() * 0.5}s`;
      bit.style.setProperty('--drift', `${Math.random() * 160 - 80}px`);
      bit.style.setProperty('--spin', `${Math.random() * 600 - 300}deg`);
      $('#confetti').append(bit);
      bit.addEventListener('animationend', () => bit.remove(), { once: true });
    }
  }

  function showEnding(choice) {
    const hug = choice === 'hug';
    $('#opened-letter').hidden = true;
    $('#ending').hidden = false;
    $('#ending-eyebrow').textContent = hug ? 'A HUG, HELD VERY GENTLY' : 'TAKE YOUR TIME, MY DEAR';
    $('#ending-heading').textContent = hug ? '抱抱宝宝，也谢谢宝宝。' : '好，小黑陪你慢慢来。';
    $('#ending-copy').textContent = hug
      ? '这个抱抱，小黑认真收好啦。\n我会把刚才的约定放进日常，\n一点一点，做一个让你安心的小黑。'
      : '你不用现在就原谅我，也不用急着开心起来。\n等你想说的时候，我会认真听。\n那些答应你的改变，也会从现在开始。';
    $$('.journey-step')[2].classList.add('is-complete');
    focusHeading('#ending-heading');
    scrollToGame();
    sound(hug ? 'success' : 'heart');
    if (hug) confetti();
  }

  $('#choose-hug').addEventListener('click', () => showEnding('hug'));
  $('#choose-time').addEventListener('click', () => showEnding('time'));
  $('#read-again').addEventListener('click', () => {
    $('#ending').hidden = true;
    $('#opened-letter').hidden = false;
    $$('.journey-step')[2].classList.remove('is-complete');
    focusHeading('#open-letter-heading');
    scrollToGame();
  });

  $('#save-letter').addEventListener('click', () => {
    const paragraphs = $$('.letter-body p').map((p) => p.innerText.trim());
    const letter = ['写给我的宝宝 Kali', '', '亲爱的宝宝：', '', ...paragraphs.flatMap((p) => [p, '']), '一直想好好陪着你的', '小黑'].join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', letter], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '小黑写给宝宝Kali的一封信.txt';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('信已备好，记得在下载文件里收好它 ♡');
    sound();
  });

  function reset() {
    window.clearTimeout(responseTimer);
    responseIndex = 0;
    responseBusy = false;
    promiseSet = new Set();
    $('#chat-body').replaceChildren();
    addMessage(dialogues[0].call);
    $('#reply-button').hidden = false;
    setReply();
    $('#response-success').hidden = true;
    $$('.promise-tile').forEach((tile) => {
      tile.setAttribute('aria-pressed', 'false');
      const plus = document.createElement('span');
      plus.textContent = '＋';
      plus.setAttribute('aria-hidden', 'true');
      tile.querySelector('.promise-tile-bottom').replaceChildren(document.createTextNode('轻轻点开 '), plus);
    });
    $('#promise-count').textContent = '0';
    $('#promise-progress-bar').style.width = '0%';
    $('#promise-caption').textContent = '每点开一块，就收好一个约定。';
    $('#promise-next-hint').hidden = false;
    $('#to-letter').hidden = true;
    $('#sealed-letter').hidden = false;
    $('#opened-letter').hidden = true;
    $('#ending').hidden = true;
    $('#confetti').replaceChildren();
    setStage(0);
  }

  $('#restart').addEventListener('click', () => { reset(); sound(); });
  addMessage(dialogues[0].call);
})();
