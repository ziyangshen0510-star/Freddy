"""Package both experiences into one private, double-clickable HTML file.

No server, installation, hosting, or third-party requests are needed. This is
an additional delivery format; the hosted application and its saves stay intact.
"""

from pathlib import Path
import base64
import mimetypes
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "Freddy-deliverables" / "Kali-and-Little-Black-Offline.html"


def embed_images(markup: str, directory: Path) -> str:
    def replace(match: re.Match) -> str:
        path = (directory / match[2]).resolve()
        if not path.is_relative_to(ROOT):
            raise ValueError("An image path escaped the project")
        mime = mimetypes.guess_type(path)[0]
        if not mime or not mime.startswith("image/"):
            raise ValueError(f"Not an image: {path}")
        data = base64.b64encode(path.read_bytes()).decode("ascii")
        return f'{match[1]}="data:{mime};base64,{data}"'

    return re.sub(r'(src)="(\.?\.?/[^"?#]+)"', replace, markup)


def body(path: Path) -> str:
    source = path.read_text(encoding="utf-8")
    content = re.search(r"<body[^>]*>(.*)</body>", source, re.S)[1]
    return embed_images(content, path.parent)


letter = body(ROOT / "index.html").replace('href="./pet/"', 'href="#pet"')
pet = body(ROOT / "pet/index.html")
pet = pet.replace('id="toast"', 'id="pet-toast"')
pet = pet.replace('href="./"', 'href="#pet"').replace('href="../"', 'href="#letter"')
pet = pet.replace('放到手机桌面 <span aria-hidden="true">↗</span>', '小狗使用说明 <span aria-hidden="true">↗</span>')
pet = re.sub(
    r'<div class="install-help">.*?</div>',
    '<div class="install-help"><h3>这是可以直接打开的独立版</h3><p>双击这个 HTML 文件，用 Chrome、Edge 或 Safari 打开即可，不需要联网，也不用安装。</p><p>用底部的「道歉小游戏 / 小狗陪伴」切换。小狗的记录会保存在当前电脑的浏览器中，继续玩时请用同一个文件和浏览器打开。</p></div>',
    pet,
    flags=re.S,
)

letter_js = (ROOT / "app.js").read_text(encoding="utf-8")
# The one image created dynamically by the dialogue needs embedding too.
paw_uri = "data:image/svg+xml;base64," + base64.b64encode((ROOT / "assets/paw.svg").read_bytes()).decode("ascii")
letter_js = letter_js.replace("'./assets/paw.svg'", repr(paw_uri))
pet_js = (ROOT / "pet/pet.js").read_text(encoding="utf-8").replace("$('#toast')", "$('#pet-toast')")
# File URLs cannot install a Service Worker or an installable PWA. All assets
# are already inline, so this version needs neither feature to work offline.
pet_js = re.sub(r"  if \('serviceWorker' in navigator && window\.isSecureContext\) \{.*?\n  \}\n", "", pet_js, flags=re.S)

navigation_js = """
(() => {
  const letter = document.getElementById('offline-letter');
  const pet = document.getElementById('offline-pet');
  function showView() {
    const showPet = location.hash === '#pet';
    letter.hidden = showPet;
    pet.hidden = !showPet;
    document.body.classList.toggle('pet-page', showPet);
    document.querySelectorAll('.offline-navigation a').forEach(link => {
      if ((link.hash === '#pet') === showPet) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.title = showPet ? 'Kali 的小小狗窝 · 独立版' : '宝宝，小黑在。 · 独立版';
    if (location.hash === '#pet' || location.hash === '#letter') window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', showView);
  showView();
})();
"""

css = (ROOT / "styles.css").read_text(encoding="utf-8") + "\n" + (ROOT / "pet/pet.css").read_text(encoding="utf-8")
css += """
body { padding-bottom: 82px; }
.offline-navigation { position: fixed; bottom: max(16px,env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); display: flex; gap: 6px; padding: 6px; background: #fffef7f5; border: 1px solid #d6dfcb; border-radius: 30px; box-shadow: 0 5px 25px #34453b1f; z-index: 30; width: max-content; max-width: calc(100% - 24px); }
.offline-navigation a { padding: 10px 19px; color: #70875f; font-size: 12px; border-radius: 24px; white-space: nowrap; }
.offline-navigation a[aria-current] { background: #55765b; color: #fffef5; }
"""
output = f'''<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f8f8ef"><title>宝宝，小黑在。 · 独立版</title><style>{css}</style></head>
<body><div id="offline-letter">{letter}</div><div id="offline-pet" hidden>{pet}</div>
<nav class="offline-navigation" aria-label="切换小礼物"><a href="#letter" aria-current="page">♡ 道歉小游戏</a><a href="#pet">✧ 小狗陪伴</a></nav>
<script>{letter_js}</script><script>{pet_js}</script><script>{navigation_js}</script>
</body></html>'''

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(output, encoding="utf-8")
print(f"Created standalone webpage: {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")
