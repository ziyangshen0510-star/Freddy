"""Browser acceptance checks. Requires Playwright Python and Chromium.

Run: python3 tests/verify_pet.py
Serves only public assets locally, including the GitHub Pages /Freddy/ prefix.
"""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from urllib.parse import urlsplit, unquote
import json
import math
import mimetypes
import time
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=Path('/tmp/kali-preview')
ARTIFACTS.mkdir(exist_ok=True)
class Handler(BaseHTTPRequestHandler):
    old_worker=False
    def log_message(self,*args): pass
    def do_GET(self):
        request_path=unquote(urlsplit(self.path).path)
        if not request_path.startswith('/Freddy/'):
            self.send_error(404);return
        relative=request_path[len('/Freddy/'):]
        if not relative or relative.endswith('/'): relative+='index.html'
        path=(ROOT/relative).resolve()
        if not path.is_relative_to(ROOT) or any(p.startswith('.') for p in path.relative_to(ROOT).parts):
            self.send_error(404);return
        if relative=='pet/sw.js' and Handler.old_worker:
            content=b"const C='kali-little-dog-v2';self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./index.html'])).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));"
        elif path.is_file(): content=path.read_bytes()
        else:self.send_error(404);return
        mime=mimetypes.guess_type(path)[0] or 'application/octet-stream'
        self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-cache');self.end_headers();self.wfile.write(content)

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}/Freddy/'
key='kali-little-dog-v1'
errors=[]
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
    ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='no-preference')
    page=ctx.new_page();page.set_default_timeout(30000)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.goto(base,wait_until='networkidle')
    expect(page).to_have_url(base+'pet/')
    page.wait_for_function('window.littlePuppy !== undefined')
    expect(page.locator('#pet-room')).to_have_class('pet-room has-live-dog')
    assert not any(word in page.locator('body').inner_text() for word in ['道歉','原谅','悄悄话','写给宝宝的信'])
    assert not page.locator('a[href="../"]').count()
    manifest=page.request.get(base+'pet/manifest.webmanifest').json()
    assert manifest['display']=='standalone' and manifest['name']=='小黑陪你'
    assert page.locator('meta[name="apple-mobile-web-app-capable"]').get_attribute('content')=='yes'
    checks.append('Root opens independent pet app; no letter/game links; iPhone standalone metadata')

    a=page.evaluate('littlePuppy.inspect()');page.wait_for_timeout(700);b=page.evaluate('littlePuppy.inspect()')
    assert a['tail']!=b['tail'] and a['head']!=b['head']
    image1=page.locator('#pet-world canvas').screenshot()
    page.wait_for_timeout(500)
    image2=page.locator('#pet-world canvas').screenshot()
    assert image1!=image2,'Rendered puppy remained static'
    page.wait_for_function('littlePuppy.inspect().state === "wander"')
    page.wait_for_function('Math.hypot(...littlePuppy.inspect().position) > .04')
    a=page.evaluate('littlePuppy.inspect()');page.wait_for_timeout(600);b=page.evaluate('littlePuppy.inspect()')
    assert a['position']!=b['position'] and a['leg']!=b['leg']
    checks.append('Actual rendered frames, tail, head, walking position and leg joints move')

    # Touch the rendered head, rather than triggering the care button.
    spot=page.evaluate('littlePuppy.inspect().headScreen')
    rect=page.locator('#pet-room').bounding_box()
    page.touchscreen.tap(rect['x']+(spot[0]+1)*rect['width']/2,rect['y']+(1-spot[1])*rect['height']/2)
    page.wait_for_function('littlePuppy.inspect().state === "stroke"')
    expect(page.locator('#action-feed')).to_be_enabled()
    expect(page.locator('#mood-label')).to_have_text('92%')
    checks.append('Touch hit-testing pets the actual dog and completes a nuzzle')

    page.locator('#action-feed').click()
    page.wait_for_function('littlePuppy.inspect().state === "feed" && littlePuppy.inspect().phase > 1.8')
    expect(page.locator('#hunger-label')).to_have_text('80%')
    page.locator('#pet-room').screenshot(path=str(ARTIFACTS/'live-eating.png'))
    expect(page.locator('#action-feed')).to_be_enabled()
    expect(page.locator('#hunger-label')).to_have_text('100%')
    page.locator('#action-feed').click()
    expect(page.locator('#pet-speech')).to_contain_text('肚子已经圆圆')
    checks.append('Dog walks to bowl, eats, returns; care is credited on completion; fullness guard')

    page.locator('#action-play').click()
    page.wait_for_function('littlePuppy.inspect().state === "play" && littlePuppy.inspect().phase > 2.75')
    carrying=page.evaluate('littlePuppy.inspect()')
    assert math.dist(carrying['mouth'],carrying['ball'])<.04,'Ball is not carried in the mouth'
    page.locator('#pet-room').screenshot(path=str(ARTIFACTS/'live-fetching.png'))
    expect(page.locator('#action-play')).to_be_enabled()
    expect(page.locator('#energy-label')).to_have_text('76%')
    checks.append('Ball arcs, dog runs, picks it up in mouth, returns and drops it')

    # Dragging the visible ball launches a game. Rest interrupts without a reward.
    ball=page.locator('#toy-ball').bounding_box()
    rect=page.locator('#pet-room').bounding_box()
    page.mouse.move(ball['x']+22,ball['y']+22);page.mouse.down()
    page.mouse.move(rect['x']+rect['width']*.75,rect['y']+rect['height']*.56,steps=6);page.mouse.up()
    page.wait_for_function('littlePuppy.inspect().state === "play"')
    page.locator('#action-sleep').click()
    expect(page.locator('#action-sleep')).to_have_attribute('aria-pressed','true')
    page.wait_for_function('littlePuppy.inspect().eyes < .08')
    expect(page.locator('#energy-label')).to_have_text('76%')
    page.locator('#pet-room').screenshot(path=str(ARTIFACTS/'live-sleeping.png'))
    checks.append('Drag-to-throw works; sleeping cancels an unfinished game without granting care')

    page.locator('#rename-button').click();page.locator('#pet-name-input').fill('宝宝的小黑')
    page.get_by_role('button',name='就叫这个').click()
    saved=page.evaluate(f'JSON.parse(localStorage.getItem("{key}"))')
    assert saved['name']=='宝宝的小黑' and saved['sleeping']
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    ctx.set_offline(True);page.reload(wait_until='networkidle')
    page.wait_for_function('window.littlePuppy !== undefined')
    expect(page.locator('#pet-name')).to_have_text('宝宝的小黑')
    expect(page.locator('#action-sleep')).to_have_attribute('aria-pressed','true')
    assert page.evaluate('caches.keys()')==['kali-little-dog-v3']
    page.locator('#action-sleep').click()
    page.wait_for_function('littlePuppy.inspect().state !== "sleeping"')
    ctx.set_offline(False)
    checks.append('3D engine works after offline reload; name and sleeping state retained')

    page.locator('#pet-sound-toggle').click()
    expect(page.locator('#pet-sound-toggle')).to_have_attribute('aria-pressed','true')
    page.locator('#pet-sound-toggle').click()
    expect(page.locator('#pet-sound-toggle')).to_have_attribute('aria-pressed','false')
    page.screenshot(path=str(ARTIFACTS/'standalone-live-iphone.png'),full_page=True)
    checks.append('Sound is opt-in and mute works')

    ctx.close()

    # Upgrading an installed old version removes only caches, not pet records.
    Handler.old_worker=True
    old=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
    birth=int(time.time()*1000)-10*86400000
    seed={'version':1,'name':'原来的小黑','hunger':80,'mood':90,'energy':80,'affection':40,'sleeping':False,'bornAt':birth,'updatedAt':int(time.time()*1000),'memories':[{'text':'和宝宝相处的记录。','at':birth}]}
    old.add_init_script('if(!localStorage.getItem("'+key+'"))localStorage.setItem("'+key+'",'+json.dumps(json.dumps(seed,ensure_ascii=False))+');')
    o=old.new_page();o.on('pageerror',lambda e:errors.append(str(e)))
    o.goto(base+'pet/',wait_until='networkidle');o.evaluate('navigator.serviceWorker.ready')
    o.wait_for_function('navigator.serviceWorker.controller !== null')
    Handler.old_worker=False
    o.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.update())')
    o.wait_for_function('caches.keys().then(k=>k.includes("kali-little-dog-v3")&&!k.includes("kali-little-dog-v2"))')
    o.reload(wait_until='networkidle')
    expect(o.locator('#pet-name')).to_have_text('原来的小黑')
    preserved=o.evaluate(f'JSON.parse(localStorage.getItem("{key}"))')
    assert preserved['bornAt']==birth and preserved['affection']==40 and preserved['memories'][0]['text']=='和宝宝相处的记录。'
    checks.append('v2 to v3 upgrade preserves name, birthday, affection and memories')

    old.close()

    # Reduced motion stops autonomous animation, and a saved installed iPhone
    # app hides the install prompt instead of presenting a browser-like launcher.
    installed=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
    installed.add_init_script('Object.defineProperty(navigator,"standalone",{value:true})')
    d=installed.new_page();d.on('pageerror',lambda e:errors.append(str(e)))
    d.goto(base+'pet/',wait_until='networkidle');d.wait_for_function('window.littlePuppy !== undefined')
    expect(d.locator('#install-button')).to_be_hidden()
    first=d.evaluate('littlePuppy.inspect()');d.wait_for_timeout(600);second=d.evaluate('littlePuppy.inspect()')
    assert first['tail']==second['tail']==0 and second['reducedMotion']
    for width in [320,375,390,768,1024,1440]:
        d.set_viewport_size({'width':width,'height':900})
        assert d.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'Overflow at {width}'
    d.set_viewport_size({'width':1440,'height':1000})
    d.screenshot(path=str(ARTIFACTS/'standalone-live-desktop.png'),full_page=True)
    checks.append('Reduced motion, standalone installed UI and 320–1440px layouts')

    installed.close()

    fallback=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
    fallback.add_init_script('const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return String(t).startsWith("webgl")?null:original.call(this,t,...a)};')
    f=fallback.new_page();f.on('pageerror',lambda e:errors.append(str(e)))
    f.goto(base+'pet/',wait_until='networkidle')
    expect(f.locator('#pet-room')).not_to_have_class('has-live-dog')
    expect(f.locator('.dog-awake')).to_be_visible()
    f.locator('#action-stroke').click();expect(f.locator('#mood-label')).to_have_text('92%')
    f.locator('#action-sleep').click();expect(f.locator('.dog-asleep')).to_be_visible()
    checks.append('Without WebGL, lightweight dog and care actions remain usable')
    assert errors==[],errors
    print(json.dumps({'result':'PASS','checks':checks,'screenshots':str(ARTIFACTS),'browser':'Chromium with iPhone touch viewport; physical iPhone not tested'},ensure_ascii=False,indent=2),flush=True)
    browser.close()
server.shutdown();server.server_close()
