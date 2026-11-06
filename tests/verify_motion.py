"""Focused motion and care regression checks using the rendered browser frames.

Run: python3 tests/verify_motion.py
Requires Playwright Python and /usr/bin/chromium. No running server is needed.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import mimetypes
from pathlib import Path
from threading import Thread
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
STORAGE_KEY = "kali-little-dog-v1"


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


def saved_pet(page):
    return page.evaluate("key => JSON.parse(localStorage.getItem(key))", STORAGE_KEY)


def advance(page, seconds):
    """Wait for real animation frames, measured by the renderer's simulation time."""
    target = page.evaluate("littlePuppy.inspect().time") + seconds
    page.wait_for_function("target => littlePuppy.inspect().time >= target", arg=target)


def start_capture(page):
    page.evaluate("""() => {
        const recorder = { active: true, samples: [littlePuppy.inspect()] };
        window.motionRecorder = recorder;
        function sample() {
            if (!recorder.active) return;
            const pose = littlePuppy.inspect();
            if (pose.time > recorder.samples.at(-1).time) recorder.samples.push(pose);
            requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
    }""")


def stop_capture(page):
    return page.evaluate("""() => {
        const recorder = window.motionRecorder;
        recorder.active = false;
        const pose = littlePuppy.inspect();
        if (pose.time > recorder.samples.at(-1).time) recorder.samples.push(pose);
        return recorder.samples;
    }""")


def wait_for_completion(page, action):
    try:
        expect(page.locator(f"#action-{action}")).to_be_enabled(timeout=30000)
    except AssertionError:
        diagnostic = page.evaluate("""() => ({
            pose: littlePuppy.inspect(),
            samples: window.motionRecorder?.samples.length,
            room: document.querySelector('#pet-room').getBoundingClientRect().toJSON(),
            viewport: [innerWidth, innerHeight],
            scrollY
        })""")
        print(json.dumps({"action_timeout": action, **diagnostic}, ensure_ascii=False), flush=True)
        raise


def angle_distance(a, b):
    return abs(math.atan2(math.sin(b - a), math.cos(b - a)))


def check_continuity(samples, label):
    """Broad speed envelopes catch snaps without prescribing a particular pose.

    Bounds use simulated seconds because software rendering can skip wall-clock
    frames. The small per-frame allowance covers sampling/rounding at transitions.
    """
    assert len(samples) >= 12, f"{label}: too few rendered motion samples"
    limits = {"position": (3.5, .015), "head": (5, .035), "yaw": (7, .035),
              "tail": (8, .04), "leg": (12, .04)}
    maxima = {key: 0 for key in limits}
    for sample in samples:
        values = (sample["position"] + sample["head"]
                  + [sample[key] for key in ["time", "yaw", "tail", "leg", "eyes"]])
        assert all(math.isfinite(value) for value in values), f"{label}: invalid pose {sample}"
        assert not sample["framesPaused"], f"{label}: puppy unexpectedly paused"
    for previous, current in zip(samples, samples[1:]):
        dt = current["time"] - previous["time"]
        assert dt > 0, f"{label}: simulation clock stopped"
        changes = {
            "position": math.dist(previous["position"], current["position"]),
            "head": max(angle_distance(a, b) for a, b in zip(previous["head"], current["head"])),
            "yaw": angle_distance(previous["yaw"], current["yaw"]),
            "tail": angle_distance(previous["tail"], current["tail"]),
            "leg": angle_distance(previous["leg"], current["leg"]),
        }
        for key, change in changes.items():
            rate, allowance = limits[key]
            maxima[key] = max(maxima[key], change / dt)
            transition = f"{previous['state']}@{previous['phase']:.2f} → {current['state']}@{current['phase']:.2f}"
            assert change <= rate * dt + allowance, (
                f"{label}: {key} jumped {change:.3f} in {dt:.3f}s ({transition})"
            )
    return {key: round(value, 2) for key, value in maxima.items()}


def check_active_motion(samples, state):
    active = [sample for sample in samples if sample["state"] == state]
    assert active, f"No rendered {state} action"
    origin = active[0]["position"]
    assert max(math.hypot(s["position"][0] - origin[0], s["position"][2] - origin[2])
               for s in active) > .15, f"{state}: dog did not travel"
    for key in ["tail", "leg", "yaw"]:
        values = [sample[key] for sample in active]
        assert max(values) - min(values) > .06, f"{state}: {key} stayed static"


def run():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/Freddy/pet/"
    errors = []
    checks = []
    speeds = {}
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path="/usr/bin/chromium", headless=True,
                args=["--no-sandbox", "--enable-unsafe-swiftshader"],
            )
            context = browser.new_context(
                viewport={"width": 390, "height": 1000}, is_mobile=True,
                has_touch=True, reduced_motion="no-preference",
            )
            page = context.new_page()
            page.set_default_timeout(30000)
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("console", lambda message: errors.append(message.text)
                    if message.type == "error" else None)
            page.goto(base, wait_until="networkidle")
            page.wait_for_function("window.littlePuppy !== undefined")
            expect(page.locator("#pet-room")).to_have_class("pet-room has-live-dog")

            before_feed = saved_pet(page)
            start_capture(page)
            advance(page, .3)
            page.locator("#action-feed").click()
            page.wait_for_function("littlePuppy.inspect().state === 'feed' && littlePuppy.inspect().phase > 1.8")
            # An interaction in progress has not yet credited its care reward.
            assert abs(saved_pet(page)["hunger"] - before_feed["hunger"]) < .2
            expect(page.locator("#pet-room")).to_have_attribute("aria-busy", "true")
            wait_for_completion(page, "feed")
            advance(page, .6)
            feeding = stop_capture(page)
            speeds["feeding"] = check_continuity(feeding, "feeding")
            check_active_motion(feeding, "feed")
            after_feed = saved_pet(page)
            assert after_feed["hunger"] > before_feed["hunger"] + 19
            assert after_feed["affection"] == before_feed["affection"] + 2
            assert math.hypot(*[feeding[-1]["position"][axis] for axis in [0, 2]]) < .08
            checks.append("Feeding moves, turns, lowers and returns continuously; care is credited on completion")

            start_capture(page)
            advance(page, .2)
            page.locator("#action-play").click()
            page.wait_for_function("littlePuppy.inspect().state === 'play' && littlePuppy.inspect().phase > 2.9")
            carrying = page.evaluate("littlePuppy.inspect()")
            assert math.dist(carrying["ball"], carrying["mouth"]) < .05, "Fetched ball left the mouth"
            wait_for_completion(page, "play")
            advance(page, .6)
            playing = stop_capture(page)
            speeds["fetch"] = check_continuity(playing, "fetch")
            check_active_motion(playing, "play")
            after_play = saved_pet(page)
            assert abs(after_play["energy"] - (after_feed["energy"] - 9)) < .2
            assert after_play["affection"] == after_feed["affection"] + 4
            assert math.dist(playing[-1]["ball"], [1.12, .115, .62]) < .08
            checks.append("Fetch gait and turns remain continuous; mouth carry, return and play reward complete")

            start_capture(page)
            page.locator("#action-play").click()
            page.wait_for_function("littlePuppy.inspect().state === 'play' && littlePuppy.inspect().phase > 2.22")
            page.locator("#action-sleep").click()
            expect(page.locator("#action-sleep")).to_have_attribute("aria-pressed", "true")
            expect(page.locator("#pet-room")).to_have_attribute("aria-busy", "false")
            page.wait_for_function("littlePuppy.inspect().eyes < .08")
            advance(page, .5)
            sleeping = stop_capture(page)
            speeds["sleep interruption"] = check_continuity(sleeping, "sleep interruption")
            after_interrupt = saved_pet(page)
            assert after_interrupt["sleeping"]
            assert after_interrupt["affection"] == after_play["affection"]
            assert abs(after_interrupt["energy"] - after_play["energy"]) < .2
            assert abs(after_interrupt["hunger"] - after_play["hunger"]) < .2
            assert any(sample["state"] == "play" for sample in sleeping)
            assert sleeping[-1]["state"] == "sleeping"
            checks.append("Sleep smoothly interrupts a crouching fetch without granting unfinished care")

            page.reload(wait_until="networkidle")
            page.wait_for_function("window.littlePuppy !== undefined && littlePuppy.inspect().eyes < .08")
            expect(page.locator("#action-sleep")).to_have_attribute("aria-pressed", "true")
            restored = saved_pet(page)
            assert restored["sleeping"] and restored["affection"] == after_interrupt["affection"]
            assert abs(restored["hunger"] - after_interrupt["hunger"]) < .2
            assert abs(restored["energy"] - after_interrupt["energy"]) < .2
            start_capture(page)
            page.locator("#action-sleep").click()
            page.wait_for_function("littlePuppy.inspect().eyes > .7 && littlePuppy.inspect().state !== 'sleeping'")
            advance(page, .8)
            waking = stop_capture(page)
            speeds["waking"] = check_continuity(waking, "waking")
            assert not saved_pet(page)["sleeping"]
            assert max(s["tail"] for s in waking) - min(s["tail"] for s in waking) > .06
            checks.append("Sleeping and earned care survive reload; waking blends into live idle motion")

            assert errors == [], errors
            print(json.dumps({"result": "PASS", "checks": checks,
                              "observed_max_rates": speeds,
                              "browser": "Headless Chromium with SwiftShader; real frame sampling"},
                             ensure_ascii=False, indent=2), flush=True)
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    run()
