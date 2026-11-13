"""v6 interaction, saved preferences, memory history and responsive regressions.

Run: python3 tests/verify_refinement.py
"""
import json
import time
from http.server import ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright, expect
from verify_room import Handler

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/Freddy/pet/'
key = 'kali-little-dog-v1'
now = int(time.time() * 1000)
seed = dict(version=1, name='熟悉的小黑', hunger=80, mood=85, energy=85,
            affection=65, sleeping=False, bornAt=now - 7 * 86400000, updatedAt=now,
            memories=[dict(text=f'第 {i + 1} 件一起做过的小事。', at=now - i * 60000) for i in range(12)])
checks, errors = [], []
# Use the real lightweight fallback for deterministic action timing; the full 3D
# behaviors and WebGL fallback itself are separately covered by verify_pet.py.
fallback = '''const original = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(t,...args) {
  return String(t).startsWith('webgl') ? null : original.call(this,t,...args);
};'''
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                   args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        ctx = browser.new_context(viewport={'width':390,'height':844}, timezone_id='America/Vancouver')
        ctx.add_init_script(fallback)
        page = ctx.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base, wait_until='networkidle')
        page.evaluate('(args) => localStorage.setItem(args.key, JSON.stringify(args.value))', {'key':key,'value':seed})
        page.reload(wait_until='networkidle')
        expect(page.locator('#pet-name')).to_have_text(seed['name'])
        expect(page.locator('#bond-label')).to_have_text('最熟悉的你')
        expect(page.locator('#memory-list .memory-row')).to_have_count(3)
        page.locator('#memory-toggle').click()
        expect(page.locator('#memory-list .memory-row')).to_have_count(12)
        expect(page.locator('#memory-toggle')).to_have_attribute('aria-expanded','true')
        page.locator('#memory-toggle').click()
        expect(page.locator('#memory-list .memory-row')).to_have_count(3)
        assert page.evaluate('JSON.parse(localStorage.getItem("'+key+'")).memories.length') == 12
        checks.append('Twelve saved memories survive reload; expansion is accessible and never removes history')

        page.locator('#pet-sound-toggle').click()
        page.reload(wait_until='networkidle')
        expect(page.locator('#pet-sound-toggle')).to_have_attribute('aria-pressed','true')
        expect(page.locator('#pet-sound-toggle')).to_have_attribute('aria-label','关闭小狗音效')
        page.locator('#pet-sound-toggle').click()
        page.reload(wait_until='networkidle')
        expect(page.locator('#pet-sound-toggle')).to_have_attribute('aria-pressed','false')
        checks.append('Sound preference survives reload, including muting')

        page.locator('#room-style-shortcut').click()
        page.locator('input[name=roomTheme][value=night]').check()
        expect(page.locator('#room-style-caption')).to_contain_text('星星夜')
        page.keyboard.press('Escape')
        expect(page.locator('#room-style-caption')).to_have_text('薄荷小窝 · 编织地毯')
        expect(page.locator('#room-style-shortcut')).to_be_focused()
        checks.append('Room shortcut previews the theme caption and returns focus after cancellation')

        page.locator('#action-feed').click()
        expect(page.locator('#action-feed')).to_have_attribute('data-active','true')
        expect(page.locator('#action-feed small')).to_have_text('吃饭中…')
        expect(page.locator('#care-hint')).to_have_text('认真吃饭的小狗')
        page.locator('#action-sleep').click()
        expect(page.locator('#care-hint')).to_have_text('嘘，正在做个好梦')
        expect(page.locator('#action-feed')).to_have_attribute('data-active','false')
        expect(page.locator('#hunger-label')).to_have_text('80%')
        page.locator('#action-sleep').click()
        page.locator('#action-stroke').click()
        expect(page.locator('#mood-label')).to_have_text('92%')
        expect(page.locator('#memory-list .memory-row').first).to_contain_text('宝宝摸了摸熟悉的小黑')
        assert page.evaluate('JSON.parse(localStorage.getItem("'+key+'")).memories.length') == 12
        checks.append('Busy button and care hint match the action; sleep cancels without reward; completed care adds a memory')

        for width in [320, 375, 390, 430, 768, 1024, 1440]:
            page.set_viewport_size({'width':width,'height':900})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
            assert page.evaluate('''() => {
              const a = document.querySelector('h1').getBoundingClientRect();
              const b = document.querySelector('.day-badge').getBoundingClientRect();
              return a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom;
            }'''), f'Greeting overlaps badge at {width}px'
            assert page.locator('#greeting-date').inner_text().strip()
        page.set_viewport_size({'width':320,'height':640})
        page.locator('#rename-button').click()
        assert page.locator('#pet-name-input').evaluate("el => getComputedStyle(el).fontSize") == '16px'
        page.locator('#pet-name-input').fill('<小黑 & 宝宝>')
        page.get_by_role('button',name='就叫这个').click()
        expect(page.locator('#pet-name')).to_have_text('<小黑 & 宝宝>')
        assert page.locator('#pet-name > *').count() == 0
        checks.append('320–1440px layouts have no overflow or greeting collision; rename uses safe text and a readable input')
        ctx.close()

        blocked = browser.new_context(viewport={'width':390,'height':844}, reduced_motion='reduce')
        blocked.add_init_script(fallback + '''
Storage.prototype.getItem = function(){ throw new Error('Storage unavailable'); };
Storage.prototype.setItem = function(){ throw new Error('Storage unavailable'); };''')
        page = blocked.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base, wait_until='networkidle')
        page.locator('#action-stroke').click()
        expect(page.locator('#mood-label')).to_have_text('92%')
        expect(page.locator('#toast')).to_be_visible()
        assert page.locator('#toast').evaluate("el => getComputedStyle(el).position") == 'fixed'
        page.locator('#pet-sound-toggle').click()
        expect(page.locator('#pet-sound-toggle')).to_have_attribute('aria-pressed','true')
        checks.append('Blocked storage still allows care and sound; saving feedback is visible and styled')
        assert errors == [], errors
        print(json.dumps({'result':'PASS','checks':checks}, ensure_ascii=False, indent=2))
        browser.close()
finally:
    server.shutdown()
    server.server_close()
