"""Build the offline HTML prototype using existing local Three.js and font assets."""
from pathlib import Path
import base64
import re

here = Path(__file__).resolve().parent
root = here.parent.parent
three = root / 'ui/node_modules/three/build/three.min.js'
font = root / 'ui/node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2'
style = (here / 'ocean.css').read_text(encoding='utf-8')
style += '\n' + (here / 'liquid-glass.css').read_text(encoding='utf-8')
style = style.replace('__FONT__', 'data:font/woff2;base64,' + base64.b64encode(font.read_bytes()).decode())

def script(source):
    # Keep script-tag-like strings inside JS strings from terminating the HTML parser.
    source = re.sub(r'</script', r'<\/script', source, flags=re.I)
    return '<script>\n' + source + '\n</script>'

app = '\n'.join((here / name).read_text(encoding='utf-8') for name in ['prototype.js', 'views.js', 'interactions.js'])
html = (here / 'shell.html').read_text(encoding='utf-8')
notices = []
for label, license_path in [
    ('Three.js / MIT', root / 'ui/node_modules/three/LICENSE'),
    ('Instrument Sans / SIL Open Font License', root / 'ui/node_modules/@fontsource-variable/instrument-sans/LICENSE'),
]:
    notices.append(label + '\n' + license_path.read_text(encoding='utf-8'))
notices_text = '\n\n'.join(notices)
(here / 'THIRD_PARTY_NOTICES.txt').write_text(notices_text, encoding='utf-8')
html = html.replace('<head>', '<head>\n<!-- Third-party licenses\n' + notices_text.replace('--', '—') + '\n-->')
html = html.replace('<!-- STYLE -->', '<style>\n' + style + '\n</style>')
html = html.replace('<!-- THREE -->', script(three.read_text(encoding='utf-8')))
html = html.replace('<!-- OCEAN -->', script((here / 'ocean.js').read_text(encoding='utf-8')))
html = html.replace('<!-- APP -->', script(app))
(here / 'index.html').write_text(html, encoding='utf-8')
(here / '.prototype-check.js').write_text(app, encoding='utf-8')
print(f'Built {here / "index.html"} ({len(html.encode("utf-8")):,} bytes)')
