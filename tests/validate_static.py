"""Offline packaging checks when Node is unavailable in the Lab workspace."""
from pathlib import Path
from html.parser import HTMLParser
import re
import json

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.assets = []
        self.actions = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a: self.ids.append(a["id"])
        if "data-loop-action" in a: self.actions.append((a["data-loop-action"], a["data-track"]))
        for key in ("src", "href"):
            if a.get(key, "").startswith("./"): self.assets.append(a[key][2:])

page = Page()
page.feed((PUBLIC / "index.html").read_text())
assert len(page.ids) == len(set(page.ids)), "Duplicate DOM ids"
for i in range(5):
    assert "track-" + str(i) in page.ids
    for action in ("record", "mute", "clear"):
        assert (action, str(i)) in page.actions
server = (ROOT / "server.mjs").read_text()
allowlist = set(re.findall(r"'([^']+)'", re.search(r"const allowed=new Set\(\[(.*?)\]\)", server).group(1)))
assets = set(page.assets)
for path in PUBLIC.glob("*.js"):
    code = path.read_text()
    assets.update(re.findall(r"from ['\"]\./([^'\"]+)['\"]", code))
    assets.update(re.findall(r"new URL\(['\"]\./([^'\"]+)['\"]", code))
for name in assets:
    assert (PUBLIC / name).is_file(), "Missing asset: " + name
    assert name in allowlist, "Not served: " + name
app = (PUBLIC / "app.js").read_text()
for element_id in re.findall(r"\$\(['\"]#([a-zA-Z0-9_-]+)['\"]\)", app):
    assert element_id in page.ids, "Missing UI element: " + element_id
synth = (PUBLIC / "synth.js").read_text()
assert "amp.connect(this.input)" in synth
assert "this.input.connect(this.compressor)" in synth
assert "source.connect(this.node);this.node.connect(destination)" in (PUBLIC / "looper.js").read_text()
assert json.loads((ROOT / "package.json").read_text())["version"] == "0.2.0"
assert "version:'0.2.0'" in server
print("PASS: 5 tracks, unique DOM ids, control bindings, all module/worklet assets served, capture routing, version 0.2.0")
