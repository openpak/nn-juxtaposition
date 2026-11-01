#!/usr/bin/env python3
"""Builds the bundle the game-community sync reads: games.json plus icons/<key>.png.

    build.py <titles.json> <out-dir> [site-base]

titles.json is the website's live and beta titles (the `requests` table, kind=title) as one JSON
array of {name, console, title_id, title_ids}. Tiles are copied from the website
(<site-base>/static/art/titles/<slug>.jpg, Switch icons from <site-base>/titles/icon/<id>) into the
bundle, so OpenVerse serves its own copies. A game with no art gets none here and the sync draws
the OpenVerse-style letter icon instead.

The key is the website's titleart.Slug of the name, and the community id derives from it
(see communityIdForKey in game-communities.ts and the Go twin in the website), so the website
can link a game to its community without asking OpenVerse.
"""
import colorsys
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request

from PIL import Image

FOLD = {
    'á': 'a', 'à': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', 'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ñ': 'n', 'ç': 'c',
}
CONSOLE_ORDER = ['Wii U', '3DS', 'Switch', 'Wii', 'DS']
HUBS = {'Wii U': 0, '3DS': 1}
IDS = re.compile(r'^[0-9A-Fa-f]{16}$')


def slug(console, name):
    """Port of titleart.Slug."""
    out, dash = [], False
    for r in (console + ' ' + name).lower():
        r = FOLD.get(r, r)
        if ('a' <= r <= 'z') or ('0' <= r <= '9'):
            if dash and out:
                out.append('-')
            out.append(r)
            dash = False
        elif r in "'’.":
            pass
        else:
            dash = True
    return ''.join(out)


def fetch(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'openverse-game-sync'}), timeout=20) as r:
            if r.status == 200 and r.headers.get('Content-Type', '').startswith('image/'):
                return r.read()
    except (urllib.error.URLError, TimeoutError):
        pass
    return None


def color_of(img, key):
    """A dark enough colour from the art, so the white letter on the banner reads."""
    small = img.convert('RGB').resize((16, 16))
    px = list(small.getdata())
    r, g, b = (sum(p[i] for p in px) / len(px) for i in range(3))
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    s = max(s, 0.35)
    l = min(l, 0.38)
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))


def hash_color(key):
    h = sum(ord(c) * (i + 1) for i, c in enumerate(key)) % 360
    r, g, b = colorsys.hls_to_rgb(h / 360, 0.36, 0.55)
    return '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))


def main():
    titles_file, out, base = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else 'https://openpak.org')
    os.makedirs(os.path.join(out, 'icons'), exist_ok=True)
    groups = {}
    for t in json.load(open(titles_file)):
        groups.setdefault(slug('', t['name']), []).append(t)
    games = []
    for key in sorted(groups):
        rows = groups[key]
        name = rows[0]['name']
        consoles = [c for c in CONSOLE_ORDER if any(r['console'] == c for r in rows)]
        consoles += sorted({r['console'] for r in rows} - set(consoles))
        ids = []
        for r in rows:
            # Only these networks look a community up by title id; the others have none to give.
            if r['console'] not in ('Wii U', '3DS', 'Switch'):
                continue
            for i in (r.get('title_ids') or []) + ([r['title_id']] if r.get('title_id') else []):
                if IDS.match(i):
                    d = str(int(i, 16))
                    if d not in ids:
                        ids.append(d)
        # platform_id: 0 Wii U only, 1 3DS only, 2 everything else
        platform = HUBS.get(consoles[0], 2) if len(consoles) == 1 else 2
        data = None
        for r in sorted(rows, key=lambda r: r['console'] == 'Switch'):
            if r['console'] == 'Switch':
                for i in (r.get('title_ids') or []) + ([r['title_id']] if r.get('title_id') else []):
                    if IDS.match(i) and not data:
                        data = fetch('%s/titles/icon/%s' % (base, i.upper()))
            else:
                data = fetch('%s/static/art/titles/%s.jpg' % (base, slug(r['console'], r['name'])))
            if data:
                break
        icon, color = None, hash_color(key)
        if data:
            img = Image.open(io.BytesIO(data))
            if img.width == img.height and img.width >= 128:
                img.convert('RGBA').save(os.path.join(out, 'icons', key + '.png'), optimize=True)
                icon, color = 'icons/%s.png' % key, color_of(img, key)
        games.append({
            'key': key, 'name': name, 'consoles': consoles, 'platform_id': platform,
            'title_ids': ids, 'icon': icon, 'color': color,
        })
    json.dump({'games': games}, open(os.path.join(out, 'games.json'), 'w'), indent=1, ensure_ascii=False)
    print('games', len(games), 'with art', sum(1 for g in games if g['icon']), 'with title ids', sum(1 for g in games if g['title_ids']))


main()
