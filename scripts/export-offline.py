"""Export the pet app alone, with all images and the 3D engine inline."""
from pathlib import Path
import base64
import mimetypes
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / 'Freddy-deliverables' / 'Little-Black-Offline.html'
source = (ROOT / 'pet/index.html').read_text(encoding='utf-8')
body = re.search(r'<body[^>]*>(.*)</body>', source, re.S)[1]

def image(match):
    path = (ROOT / 'pet' / match[1]).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError('Image path escaped the checkout')
    mime = mimetypes.guess_type(path)[0]
    if not mime or not mime.startswith('image/'):
        raise ValueError(f'Unsupported image: {path}')
    return 'src="data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode('ascii') + '"'

body = re.sub(r'src="(\.?\.?/[^"?#]+)"', image, body)
body = body.replace('href="./"', 'href="#"')
body = body.replace('放到手机桌面 <span aria-hidden="true">↗</span>', '使用说明 <span aria-hidden="true">↗</span>')
body = re.sub(r'<div class="install-help">.*?</div>', '<div class="install-help"><h3>小黑陪你 · 独立文件版</h3><p>在电脑浏览器中打开即可。名字和状态保存在当前浏览器，请用同一个浏览器继续玩。</p><p>iPhone 添加到主屏幕，请使用正式的 HTTPS 网站。</p></div>', body, flags=re.S)
css = (ROOT / 'styles.css').read_text() + '\n' + (ROOT / 'pet/pet.css').read_text() + '\n' + (ROOT / 'pet/room-style.css').read_text()
script = (ROOT / 'pet/pet.js').read_text()
script = re.sub(r"  if \('serviceWorker' in navigator && window\.isSecureContext\) \{.*?\n  \}\n", '', script, flags=re.S)
bundle = (ROOT / 'pet/puppy-world.bundle.js').read_text().replace('</script', '<\\/script')
decor_script = (ROOT / 'pet/room-style.js').read_text()
license_text = (ROOT / 'pet/vendor/THREE-LICENSE.txt').read_text()
output = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小黑陪你 · 独立版</title><style>' + css + '</style></head><body class="pet-page">' + body + '<script>' + script + '</script><script>' + decor_script + '</script><script>' + bundle + '</script><!-- Third-party license: ' + license_text + ' --></body></html>'
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(output, encoding='utf-8')
print(f'Created {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)')
