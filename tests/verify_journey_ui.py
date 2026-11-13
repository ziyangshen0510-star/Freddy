"""v7 daily wishes, handshake, wearable rewards and save regressions.

Run: python3 tests/verify_journey_ui.py
Focused storage/offscreen checks: python3 tests/verify_journey_ui.py --storage
Uses Python Playwright and /usr/bin/chromium. A local HTTP server keeps the
GitHub Pages /Freddy/ subpath and service-worker behavior intact.
"""
from http.server import ThreadingHTTPServer
import json
import sys
from pathlib import Path
from threading import Thread

from playwright.sync_api import expect, sync_playwright
from verify_room import Handler


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT.parent
PET_KEY = 'kali-little-dog-v1'
JOURNEY_KEY = 'kali-puppy-journey-v1'
FALLBACK = '''const original = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, ...args) {
  return String(type).startsWith('webgl') ? null : original.call(this, type, ...args);
};'''
CLOCK = '''(() => {
  const NativeDate = Date;
  window.testClock = { now: new NativeDate(2026, 10, 12, 14).getTime() };
  class TestDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [window.testClock.now])); }
    static now() { return window.testClock.now; }
  }
  window.Date = TestDate;
})();'''


def saved(page, key=JOURNEY_KEY):
    return page.evaluate('key => JSON.parse(localStorage.getItem(key))', key)


def snapshot(page):
    return page.evaluate('''key => {
      let value = null;
      try { value = JSON.parse(localStorage.getItem(key)); } catch {}
      return window.PuppyJourney.snapshot(value, Date.now());
    }''', JOURNEY_KEY)


def watch(page, errors, allow_webgl_fallback=False):
    page.on('pageerror', lambda error: errors.append(str(error)))

    def console(message):
        if message.type != 'error':
            return
        # These contexts intentionally deny WebGL to exercise the PNG fallback.
        # Keep real WebGL context creation failures visible in the live context.
        if allow_webgl_fallback and message.text == 'THREE.WebGLRenderer: THREE.WebGLRenderer: Error creating WebGL context.':
            return
        errors.append(message.text)

    page.on('console', console)


def ready(page):
    page.wait_for_function('window.PuppyJourney && document.querySelector("#daily-tasks [data-action]")')
    expect(page.locator('#daily-tasks [data-action]')).to_have_count(3)


def training(page, keyboard=False):
    page.locator('#training-start').click()
    expect(page.locator('#training-game')).to_be_visible()
    expect(page.locator('#training-hand')).to_be_enabled()
    if keyboard:
        page.locator('#training-hand').focus()
        page.keyboard.press('Enter')
    else:
        page.locator('#training-hand').click()


def wait_training_count(page, count):
    page.wait_for_function('''args => window.PuppyJourney.snapshot(
      JSON.parse(localStorage.getItem(args.key)), Date.now()).training.completed === args.count''',
      arg={'key': JOURNEY_KEY, 'count': count})


def run():
    assert (ROOT / 'pet/journey-ui.js').is_file(), 'Build the v7 UI before running this acceptance test'
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/Freddy/pet/'
    errors, checks = [], []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path='/usr/bin/chromium', headless=True,
                args=['--no-sandbox', '--enable-unsafe-swiftshader'])
            context = browser.new_context(
                viewport={'width': 390, 'height': 844}, reduced_motion='reduce',
                is_mobile=True, has_touch=True, timezone_id='America/Vancouver')
            context.add_init_script(CLOCK + FALLBACK)
            context.add_init_script('''(() => {
              const key = 'kali-little-dog-v1';
              if (localStorage.getItem(key)) return;
              const now = Date.now();
              localStorage.setItem(key, JSON.stringify({ version:1, name:'原来的小黑',
                hunger:80, mood:85, energy:25, affection:47, sleeping:false,
                bornAt:now-12*86400000, updatedAt:now,
                memories:[{text:'升级前的小回忆。', at:now-86400000}] }));
            })();''')
            page = context.new_page()
            page.set_default_timeout(30000)
            watch(page, errors, allow_webgl_fallback=True)
            page.goto(base, wait_until='networkidle')
            ready(page)
            expect(page.locator('#pet-name')).to_have_text('原来的小黑')
            expect(page.locator('#day-count')).to_have_text('13')
            expect(page.locator('#daily-gift')).to_be_disabled()
            assert snapshot(page)['totalXp'] == 0
            assert snapshot(page)['selectedScarf'] == 'sage'
            before = snapshot(page)
            page.locator('#training-start').click()
            expect(page.locator('#training-game')).to_be_visible()
            page.locator('#training-cancel').click()
            expect(page.locator('#training-game')).not_to_be_visible()
            assert snapshot(page) == before, 'Cancelling timing practice credited progress'
            checks.append('Upgrade preserves the puppy; no startup reward and cancelled timing practice grants nothing')

            for action in ['stroke', 'play']:
                page.locator(f'#daily-tasks [data-action="{action}"]').click()
                expect(page.locator(f'#daily-tasks [data-action="{action}"]')).to_have_attribute('data-done', 'true')
                expect(page.locator('#daily-gift')).to_be_disabled()
            assert snapshot(page)['totalXp'] > 0
            assert saved(page, PET_KEY)['energy'] >= 20, 'Gentle fetch exhausted a returning puppy'
            checks.append('Real care completes wishes; low-energy returning puppies can finish a gentle fetch')

            page.locator('#daily-tasks [data-action="train"]').click()
            expect(page.locator('#training-game')).to_be_visible()
            page.locator('#training-hand').focus()
            page.keyboard.press('Enter')
            wait_training_count(page, 1)
            expect(page.locator('#daily-tasks [data-action="train"]')).to_have_attribute('data-done', 'true')
            expect(page.locator('#daily-gift')).to_be_enabled()
            assert snapshot(page)['completedTasks'] == 3
            assert snapshot(page)['training']['completed'] == 1
            assert len([b for b in snapshot(page)['badges'] if b['unlocked']]) >= 3
            assert page.locator('#journey-level').inner_text().strip()
            assert page.locator('#journey-xp').inner_text().strip()
            checks.append('Keyboard handshake completes actual care, trains the skill, and earns visible growth and badges')

            xp_before_gift = snapshot(page)['totalXp']
            page.locator('#daily-gift').click()
            expect(page.locator('#daily-gift-dialog')).to_be_visible()
            gifted = snapshot(page)
            assert gifted['dailyClaimed'] and gifted['gifts'] == 1
            assert gifted['totalXp'] > xp_before_gift
            assert gifted['selectedScarf'] == 'peach' and 'peach' in gifted['unlockedScarves']
            page.keyboard.press('Escape')
            expect(page.locator('#daily-gift-dialog')).not_to_be_visible()
            page.locator('#daily-gift').evaluate("el => el.dispatchEvent(new MouseEvent('click', {bubbles:true}))")
            assert snapshot(page) == gifted, 'A duplicate gift click rewarded twice'
            page.reload(wait_until='networkidle')
            ready(page)
            assert snapshot(page) == gifted, 'Gift, training or daily completion was lost after reload'
            expect(page.locator('#daily-gift')).to_be_disabled()
            checks.append('Three wishes unlock one gift; reward auto-equips peach and cannot be claimed twice or lost on reload')

            page.locator('#journey-album-open').click()
            expect(page.locator('#journey-album')).to_be_visible()
            expect(page.locator('#journey-album [data-scarf="gold"]')).to_be_disabled()
            page.locator('#journey-album [data-scarf="sage"]').click()
            assert snapshot(page)['selectedScarf'] == 'sage'
            page.locator('#journey-album [data-scarf="peach"]').click()
            page.locator('#journey-album-close').click()
            expect(page.locator('#journey-album')).not_to_be_visible()
            checks.append('Wardrobe allows collected scarves and keeps unearned colors locked')

            old_total = snapshot(page)['totalXp']
            old_badges = snapshot(page)['badges']
            page.evaluate('''() => {
              window.testClock.now += 86400000;
              document.dispatchEvent(new Event('visibilitychange'));
            }''')
            expect(page.locator('#daily-tasks [data-done="false"]')).to_have_count(3)
            expect(page.locator('#daily-gift')).to_be_disabled()
            tomorrow = snapshot(page)
            assert tomorrow['totalXp'] == old_total and tomorrow['selectedScarf'] == 'peach'
            assert tomorrow['badges'] == old_badges
            page.evaluate('''() => {
              window.testClock.now += 9*86400000;
              document.dispatchEvent(new Event('visibilitychange'));
            }''')
            assert snapshot(page)['totalXp'] == old_total
            assert snapshot(page)['gifts'] == 1 and snapshot(page)['selectedScarf'] == 'peach'
            checks.append('New local days refresh wishes; a longer absence keeps earned growth, badges and wardrobe')

            for width in [320, 375, 390, 430, 768, 1024, 1440]:
                page.set_viewport_size({'width': width, 'height': 900})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Page overflows at {width}px'
            page.set_viewport_size({'width': 320, 'height': 640})
            page.locator('#journey-album-open').click()
            assert page.locator('#journey-album').evaluate('el => el.scrollWidth <= el.clientWidth')
            page.locator('#journey-album-close').click()
            page.screenshot(path=str(ARTIFACTS/'journey-qa-mobile.png'), full_page=True)
            checks.append('320–1440px layouts and the narrow wardrobe fit without horizontal overflow')
            earned_save = saved(page)
            original_pet = saved(page, PET_KEY)
            context.close()

            # A real WebGL puppy must lift its paw, then return it when interrupted.
            live = browser.new_context(viewport={'width':390, 'height':844},
                                       reduced_motion='no-preference', timezone_id='America/Vancouver')
            live.add_init_script(CLOCK)
            live.add_init_script('''(() => {
              localStorage.setItem(KEY, JSON.stringify(SAVE));
            })();'''.replace('KEY', json.dumps(JOURNEY_KEY)).replace('SAVE', json.dumps(earned_save)))
            page = live.new_page()
            watch(page, errors)
            page.goto(base, wait_until='networkidle')
            ready(page)
            page.wait_for_function('window.littlePuppy && littlePuppy.inspect().time > .1')
            page.wait_for_function('littlePuppy.inspect().scarf === "peach"')
            peach_color = page.evaluate('littlePuppy.inspect().scarfColor')
            original_count = snapshot(page)['training']['completed']
            resting = page.evaluate('littlePuppy.inspect().pawHeights[1]')
            training(page)
            page.wait_for_function('littlePuppy.inspect().state === "train" && littlePuppy.inspect().trainingLift > .6')
            pose = page.evaluate('littlePuppy.inspect()')
            assert pose['pawHeights'][1] > resting + .18, pose
            page.locator('#pet-room').screenshot(path=str(ARTIFACTS/'journey-qa-handshake.png'))
            wait_training_count(page, original_count + 1)
            assert snapshot(page)['training']['completed'] == original_count + 1
            checks.append('Actual 3D handshake raises a front paw, completes, and credits one practice')

            training(page)
            page.wait_for_function('littlePuppy.inspect().state === "train"')
            page.locator('footer').scroll_into_view_if_needed()
            page.wait_for_function('littlePuppy.inspect().framesPaused === true')
            wait_training_count(page, original_count + 2)
            checks.append('An accepted handshake finishes after the user scrolls away from the room')

            training(page)
            page.wait_for_function('littlePuppy.inspect().state === "train"')
            page.locator('#action-sleep').click()
            expect(page.locator('#action-sleep')).to_have_attribute('aria-pressed', 'true')
            page.locator('#pet-room').scroll_into_view_if_needed()
            page.wait_for_function('littlePuppy.inspect().trainingLift < .05')
            page.wait_for_timeout(2500)
            assert snapshot(page)['training']['completed'] == original_count + 2, 'Interrupted handshake was rewarded'
            checks.append('Sleep interrupts an unfinished handshake, lowers its paw, and grants no practice reward')

            page.locator('#journey-album-open').click()
            page.locator('#journey-album [data-scarf="sage"]').click()
            assert page.evaluate('littlePuppy.inspect().scarf') == 'sage'
            assert page.evaluate('littlePuppy.inspect().scarfColor') != peach_color
            page.locator('#journey-album [data-scarf="peach"]').click()
            page.locator('#journey-album-close').click()
            page.reload(wait_until='networkidle')
            page.wait_for_function('window.littlePuppy && littlePuppy.inspect().scarf === "peach"')
            checks.append('Wardrobe changes the rendered scarf material; saved selection restores on the real dog')
            live.close()

            damaged = browser.new_context(viewport={'width':390,'height':844}, reduced_motion='reduce')
            damaged.add_init_script(FALLBACK)
            damaged.add_init_script('''(() => {
              localStorage.setItem(KEY, '{broken');
              localStorage.setItem(PET, JSON.stringify(SAVE));
            })();'''.replace('KEY',json.dumps(JOURNEY_KEY)).replace('PET',json.dumps(PET_KEY)).replace('SAVE',json.dumps(original_pet)))
            page = damaged.new_page()
            watch(page, errors, allow_webgl_fallback=True)
            page.goto(base, wait_until='networkidle')
            ready(page)
            assert snapshot(page)['totalXp'] == 0
            expect(page.locator('#pet-name')).to_have_text('原来的小黑')
            checks.append('A damaged journey save resets only journey progress and leaves the original puppy intact')
            damaged.close()

            blocked = browser.new_context(viewport={'width':390,'height':844}, reduced_motion='reduce')
            blocked.add_init_script(FALLBACK + '''
Storage.prototype.getItem = function() { throw new Error('Storage unavailable'); };
Storage.prototype.setItem = function() { throw new Error('Storage unavailable'); };''')
            page = blocked.new_page()
            watch(page, errors, allow_webgl_fallback=True)
            page.goto(base, wait_until='networkidle')
            ready(page)
            page.locator('#action-stroke').click()
            page.wait_for_function('Number(document.querySelector("#journey-progress").getAttribute("aria-valuenow")) > 0')
            training(page, keyboard=True)
            expect(page.locator('#training-progress')).to_contain_text('已经握手 1 次')
            checks.append('Unavailable browser storage still allows growth and training in the current visit')
            blocked.close()
            assert errors == [], errors
            browser.close()
        print(json.dumps({'result':'PASS','checks':checks,
                          'artifacts':str(ARTIFACTS/'journey-*.png'),
                          'browser':'Chromium with mobile layouts and SwiftShader WebGL; physical iPhone not tested'},
                         ensure_ascii=False,indent=2), flush=True)
    finally:
        server.shutdown()
        server.server_close()


def run_storage_regressions():
    """Exercise storage failure after earning progress, without replaying 3D care."""
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/Freddy/pet/'
    errors, checks = [], []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path='/usr/bin/chromium', headless=True,
                args=['--no-sandbox', '--enable-unsafe-swiftshader'])
            context = browser.new_context(viewport={'width':390,'height':844},
                                          reduced_motion='reduce', timezone_id='America/Vancouver')
            context.add_init_script(FALLBACK)
            page = context.new_page()
            watch(page, errors, allow_webgl_fallback=True)
            page.goto(base, wait_until='networkidle')
            ready(page)
            for action in ['stroke', 'play']:
                page.locator(f'#daily-tasks [data-action="{action}"]').click()
                expect(page.locator(f'#daily-tasks [data-action="{action}"]')).to_have_attribute('data-done', 'true')
            earned = saved(page)
            assert earned['totalXp'] > 0 and earned['counts']['stroke'] == earned['counts']['play'] == 1
            page.evaluate("""key => {
              window.originalGetItem = Storage.prototype.getItem;
              window.originalSetItem = Storage.prototype.setItem;
              Storage.prototype.getItem = function(name) {
                if (name === key) throw new Error('Transient read denial');
                return window.originalGetItem.call(this, name);
              };
            }""", JOURNEY_KEY)
            training(page, keyboard=True)
            expect(page.locator('#daily-tasks [data-action="train"]')).to_have_attribute('data-done', 'true')
            recovered = page.evaluate("""key => JSON.parse(window.originalGetItem.call(localStorage, key))""", JOURNEY_KEY)
            assert recovered['totalXp'] > earned['totalXp'], 'Read denial reset earned growth'
            assert recovered['counts']['stroke'] == earned['counts']['stroke']
            assert recovered['counts']['play'] == earned['counts']['play']
            assert recovered['counts']['train'] == 1
            assert set(earned['badges']).issubset(recovered['badges'])
            checks.append('A read failure after earned progress keeps original counts and adds the newly completed practice')

            page.evaluate("""key => {
              Storage.prototype.getItem = window.originalGetItem;
              Storage.prototype.setItem = function(name, value) {
                if (name === key) throw new Error('Transient write denial');
                return window.originalSetItem.call(this, name, value);
              };
            }""", JOURNEY_KEY)
            expect(page.locator('#daily-gift')).to_be_enabled()
            page.locator('#daily-gift').click()
            expect(page.locator('#daily-gift-dialog')).to_be_visible()
            expect(page.locator('#journey-feedback')).to_contain_text('无法保存')
            assert page.locator('#pet-room').get_attribute('data-scarf') == 'peach'
            assert saved(page)['gifts'] == 0, 'The write failure did not reach the intended storage path'
            page.locator('#daily-gift-close').click()
            expect(page.locator('#daily-gift')).to_be_disabled()
            expect(page.locator('#journey-feedback')).to_contain_text('无法保存')
            checks.append('An unsaved daily gift works for this visit and leaves a visible saving warning after its dialog closes')

            page.locator('#journey-album-open').click()
            expect(page.locator('#journey-album [data-scarf="peach"]')).to_be_enabled()
            page.locator('#journey-album [data-scarf="sage"]').click()
            assert page.locator('#pet-room').get_attribute('data-scarf') == 'sage'
            expect(page.locator('#journey-feedback')).to_contain_text('无法保存')
            page.locator('#journey-album [data-scarf="peach"]').click()
            assert page.locator('#pet-room').get_attribute('data-scarf') == 'peach'
            page.locator('#journey-album-close').click()
            expect(page.locator('#journey-feedback')).to_contain_text('无法保存')
            checks.append('Wardrobe write failures keep the collected in-memory reward and preserve the saving warning')

            page.evaluate('() => { Storage.prototype.setItem = window.originalSetItem; }')
            page.locator('#action-stroke').click()
            page.wait_for_function("""key => {
              const save = JSON.parse(localStorage.getItem(key));
              return save.gifts === 1 && save.counts.stroke === 2;
            }""", arg=JOURNEY_KEY)
            persisted = saved(page)
            assert persisted['selectedScarf'] == 'peach'
            assert persisted['counts']['play'] == 1 and persisted['counts']['train'] == 1
            assert persisted['totalXp'] > recovered['totalXp']
            page.reload(wait_until='networkidle')
            ready(page)
            assert saved(page) == persisted
            expect(page.locator('#daily-gift')).to_be_disabled()
            checks.append('When writes recover, the next completed care saves all retained growth, gift and wardrobe changes')
            context.close()

            live = browser.new_context(viewport={'width':390,'height':844}, reduced_motion='no-preference')
            page = live.new_page()
            watch(page, errors)
            page.goto(base, wait_until='networkidle')
            page.wait_for_function('window.littlePuppy && littlePuppy.inspect().time > .1')
            page.locator('#action-sleep').click()
            expect(page.locator('#action-sleep')).to_have_attribute('aria-pressed', 'true')
            page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            page.wait_for_function('littlePuppy.inspect().framesPaused === true')
            page.wait_for_function('littlePuppy.inspect().eyes < .08')
            assert page.evaluate('littlePuppy.inspect().framesPaused')
            page.locator('#action-sleep').click()
            page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            page.wait_for_function('littlePuppy.inspect().eyes > .6 && littlePuppy.inspect().state === "idle"')
            assert page.evaluate('littlePuppy.inspect().framesPaused')
            checks.append('Sleep and wake complete their eye/pose transitions while the room stays offscreen')
            live.close()
            assert errors == [], errors
            browser.close()
        print(json.dumps({'result':'PASS','focused_checks':checks}, ensure_ascii=False, indent=2), flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    if '--storage' not in sys.argv:
        run()
    run_storage_regressions()
