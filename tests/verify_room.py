"""Room decoration, varied companion copy and offline browser regressions.

Run: python3 tests/verify_room.py
Requires Playwright Python and /usr/bin/chromium. Serves public assets locally
under the GitHub Pages /Freddy/ prefix; no existing server is needed.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import re
from threading import Thread
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PET_KEY = "kali-little-dog-v1"
ROOM_KEY = "kali-little-room-v1"
DEFAULT_STYLE = {"roomTheme": "mint", "roomRug": "oval", "roomItem": "plant"}
SAVED_STYLE = {"roomTheme": "peach", "roomRug": "gingham", "roomItem": "lamp"}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        request_path = unquote(urlsplit(self.path).path)
        if not request_path.startswith("/Freddy/"):
            self.send_error(404)
            return
        relative = request_path[len("/Freddy/"):]
        if not relative or relative.endswith("/"):
            relative += "index.html"
        path = (ROOT / relative).resolve()
        if (not path.is_relative_to(ROOT)
                or any(part.startswith(".") for part in path.relative_to(ROOT).parts)
                or not path.is_file()):
            self.send_error(404)
            return
        content = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(path)[0] or "application/octet-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(content)


def style(page):
    return page.evaluate("""() => {
        const { roomTheme, roomRug, roomItem } = document.querySelector('#pet-room').dataset;
        return { roomTheme, roomRug, roomItem };
    }""")


def stored(page, key):
    return page.evaluate("key => JSON.parse(localStorage.getItem(key))", key)


def room_visuals(page):
    return page.evaluate("""() => ({
        wall: getComputedStyle(document.querySelector('.room-wall')).backgroundImage,
        rug: getComputedStyle(document.querySelector('.room-rug')).backgroundImage,
        lamp: getComputedStyle(document.querySelector('.room-decor-lamp')).display
    })""")


def select_style(page, values):
    for name, value in values.items():
        page.locator(f'#room-decor-dialog input[name="{name}"][value="{value}"]').check()


def open_decor(page):
    page.locator(".room-decor-launch").click()
    expect(page.locator("#room-decor-dialog")).to_be_visible()


def wait_ready(page):
    page.wait_for_function("window.littlePuppy !== undefined && document.querySelector('.room-decor-launch')")


def copy_snapshot(page):
    return page.evaluate("""() => Object.fromEntries(
        ['pet-greeting', 'greeting-eyebrow', 'affection-copy'].map(id => [id, document.getElementById(id).textContent])
    )""")


def set_time(page, milliseconds):
    page.evaluate("""value => {
        window.testClock.now = value;
        document.dispatchEvent(new Event('visibilitychange'));
    }""", milliseconds)


def refresh_after(page, milliseconds):
    """Use the app's existing refresh event; performance/animation time is untouched."""
    return page.evaluate("""amount => {
        const before = document.querySelector('#pet-speech').textContent;
        window.testClock.now += amount;
        document.dispatchEvent(new Event('visibilitychange'));
        return { before, after: document.querySelector('#pet-speech').textContent,
            busy: document.querySelector('#pet-room').getAttribute('aria-busy') === 'true' };
    }""", milliseconds)


def run():
    cache_match = re.search(r"const\s+CACHE\s*=\s*['\"]([^'\"]+)['\"]", (ROOT / "pet/sw.js").read_text())
    assert cache_match, "Service worker cache version was not found"
    expected_cache = cache_match.group(1)
    seed = {"version": 1, "name": "原来的小黑", "hunger": 74, "mood": 82,
            "energy": 83, "affection": 47, "sleeping": False,
            "bornAt": 0, "updatedAt": 0,
            "memories": [{"text": "已经一起长大了十二天。", "at": 0}]}
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/Freddy/pet/"
    errors = []
    checks = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path="/usr/bin/chromium", headless=True,
                args=["--no-sandbox", "--enable-unsafe-swiftshader"],
            )
            context = browser.new_context(
                viewport={"width": 390, "height": 844}, is_mobile=True,
                has_touch=True, reduced_motion="reduce", timezone_id="America/Vancouver",
            )
            context.add_init_script("""(() => {
                const NativeDate = Date;
                window.testClock = { now: new NativeDate(2026, 10, 6, 8).getTime() };
                class TestDate extends NativeDate {
                    constructor(...args) { super(...(args.length ? args : [window.testClock.now])); }
                    static now() { return window.testClock.now; }
                }
                window.Date = TestDate;
                const seed = SEED_VALUE;
                seed.updatedAt = Date.now();
                seed.bornAt = seed.updatedAt - 12 * 86400000;
                seed.memories[0].at = seed.updatedAt - 86400000;
                if (!localStorage.getItem(PET_KEY_VALUE)) {
                    localStorage.setItem(PET_KEY_VALUE, JSON.stringify(seed));
                }
            })();""".replace("SEED_VALUE", json.dumps(seed, ensure_ascii=False))
               .replace("PET_KEY_VALUE", json.dumps(PET_KEY)))
            page = context.new_page()
            page.set_default_timeout(30000)
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("console", lambda message: errors.append(message.text)
                    if message.type == "error" else None)
            page.goto(base, wait_until="networkidle")
            wait_ready(page)
            clock = page.evaluate("""() => ({ hour: new Date().getHours(),
                date: new Date().toString(), now: Date.now(), test: window.testClock,
                zone: Intl.DateTimeFormat().resolvedOptions().timeZone })""")
            assert clock["hour"] == 8, clock
            anchor = clock["now"]
            seed["updatedAt"] = anchor
            seed["bornAt"] = anchor - 12 * 86400000
            seed["memories"][0]["at"] = anchor - 86400000
            original_pet = stored(page, PET_KEY)
            assert original_pet == seed
            assert style(page) == DEFAULT_STYLE and stored(page, ROOM_KEY) is None
            original_visuals = room_visuals(page)

            open_decor(page)
            select_style(page, SAVED_STYLE)
            assert style(page) == SAVED_STYLE, "Room choices did not preview immediately"
            preview = room_visuals(page)
            assert preview["wall"] != original_visuals["wall"]
            assert preview["rug"] != original_visuals["rug"] and preview["lamp"] == "block"
            assert stored(page, ROOM_KEY) is None, "Preview persisted before Save"
            page.locator(".room-decor-cancel").click()
            expect(page.locator("#room-decor-dialog")).not_to_be_visible()
            assert style(page) == DEFAULT_STYLE and room_visuals(page) == original_visuals
            expect(page.locator(".room-decor-launch")).to_be_focused()

            open_decor(page)
            select_style(page, {"roomTheme": "night", "roomRug": "cloud", "roomItem": "stars"})
            page.keyboard.press("Escape")
            expect(page.locator("#room-decor-dialog")).not_to_be_visible()
            assert style(page) == DEFAULT_STYLE and stored(page, ROOM_KEY) is None
            checks.append("Room choices preview visually; Cancel and Escape restore the saved room")

            open_decor(page)
            select_style(page, SAVED_STYLE)
            page.locator(".room-decor-save").click()
            expect(page.locator("#room-decor-dialog")).not_to_be_visible()
            assert stored(page, ROOM_KEY) == SAVED_STYLE
            assert stored(page, PET_KEY) == original_pet, "Decorating changed the puppy record"
            page.reload(wait_until="networkidle")
            wait_ready(page)
            assert style(page) == SAVED_STYLE and stored(page, PET_KEY) == original_pet
            expect(page.locator("#pet-name")).to_have_text(seed["name"])
            expect(page.locator("#day-count")).to_have_text("13")
            checks.append("Save uses its own room key; reload preserves decor, name, birthday, affection and memories")

            page.set_viewport_size({"width": 320, "height": 640})
            open_decor(page)
            layout = page.evaluate("""() => {
                const dialog = document.querySelector('#room-decor-dialog');
                const rect = dialog.getBoundingClientRect();
                return { left: rect.left, right: rect.right, height: rect.height,
                    innerOverflow: dialog.scrollWidth > dialog.clientWidth,
                    pageOverflow: document.documentElement.scrollWidth > innerWidth };
            }""")
            assert layout["left"] >= 0 and layout["right"] <= 320, layout
            assert layout["height"] <= 640 * .9, layout
            assert not layout["innerOverflow"] and not layout["pageOverflow"], layout
            assert page.locator("#room-decor-dialog input[type=radio]").count() == 9
            page.locator(".room-decor-save").scroll_into_view_if_needed()
            expect(page.locator(".room-decor-save")).to_be_in_viewport()
            page.locator(".room-decor-cancel").click()
            page.set_viewport_size({"width": 390, "height": 844})
            checks.append("At 320px the dialog fits without horizontal overflow and its Save action remains reachable")

            for invalid in [json.dumps({"roomTheme": "unknown", "roomRug": 42, "roomItem": ["lamp"]}), "{broken"]:
                page.evaluate("args => localStorage.setItem(args.key, args.value)", {"key": ROOM_KEY, "value": invalid})
                page.reload(wait_until="networkidle")
                wait_ready(page)
                assert style(page) == DEFAULT_STYLE
                assert stored(page, PET_KEY) == original_pet
            open_decor(page)
            select_style(page, SAVED_STYLE)
            page.locator(".room-decor-save").click()
            expect(page.locator("#room-decor-dialog")).not_to_be_visible()
            checks.append("Unknown option values and malformed room JSON safely use defaults without touching puppy growth")

            page.evaluate("navigator.serviceWorker.ready")
            page.wait_for_function("navigator.serviceWorker.controller !== null")
            page.wait_for_function("name => caches.keys().then(keys => keys.includes(name))", arg=expected_cache)
            context.set_offline(True)
            page.reload(wait_until="networkidle")
            wait_ready(page)
            assert style(page) == SAVED_STYLE and stored(page, PET_KEY) == original_pet
            assert room_visuals(page)["lamp"] == "block"
            page.emulate_media(reduced_motion="no-preference")
            page.locator("#pet-room").scroll_into_view_if_needed()
            first = page.evaluate("littlePuppy.inspect()")
            page.wait_for_function("previous => littlePuppy.inspect().time > previous.time + .2 && Math.abs(littlePuppy.inspect().tail - previous.tail) > .03", arg=first)
            assert not page.evaluate("littlePuppy.inspect().reducedMotion")
            context.set_offline(False)
            checks.append("Offline reload restores the chosen room and the locally bundled puppy still animates")

            morning = copy_snapshot(page)
            set_time(page, anchor + 15 * 60000)
            next_quarter = copy_snapshot(page)
            assert all(next_quarter.values()) and morning != next_quarter
            evening_time = page.evaluate("new Date(2026, 10, 6, 19).getTime()")
            set_time(page, evening_time)
            evening = copy_snapshot(page)
            assert page.evaluate("new Date().getHours()") == 19
            assert morning["pet-greeting"] != evening["pet-greeting"]
            early = refresh_after(page, 90000)
            assert early["before"] == early["after"], "Idle speech rotated before two minutes"
            later = refresh_after(page, 31000)
            assert later["before"] != later["after"], "Quiet idle speech did not rotate after two minutes"
            checks.append("Companion copy varies by local time and quarter hour; idle speech respects its two-minute interval")

            page.locator("#action-feed").click()
            page.wait_for_function("littlePuppy.inspect().state === 'feed'")
            busy = refresh_after(page, 180000)
            assert busy["busy"] and busy["before"] == busy["after"], "Refresh replaced an interaction's speech"
            page.locator("#action-sleep").click()
            expect(page.locator("#pet-room")).to_have_attribute("aria-busy", "false")
            open_decor(page)
            modal = refresh_after(page, 180000)
            assert modal["before"] == modal["after"], "Idle speech changed behind an open dialog"
            page.locator(".room-decor-cancel").click()
            expect(page.locator("#room-decor-dialog")).not_to_be_visible()
            resumed = refresh_after(page, 0)
            assert resumed["before"] != resumed["after"], "Speech did not resume after closing the dialog"
            assert stored(page, PET_KEY)["affection"] == seed["affection"]
            checks.append("Busy care and open dialogs protect their speech; quiet rotation resumes after closing")

            assert errors == [], errors
            print(json.dumps({"result": "PASS", "checks": checks, "cache": expected_cache,
                              "browser": "Headless Chromium, America/Vancouver; reduced motion except offline engine/care checks"},
                             ensure_ascii=False, indent=2), flush=True)
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    run()
