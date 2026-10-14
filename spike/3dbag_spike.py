"""
Fase 1 spike: wat weet 3DBAG over de demo-adressen?

Per adres: PDOK-locatie -> 3DBAG-pand (footprint bevat het adrespunt) -> dakvlakken uit LoD2.2
(helling, azimut, oppervlak berekend uit de geometrie) -> PVGIS-opbrengst per kWp voor het
beste vlak -> luchtfoto (PDOK) met de 3DBAG-dakvlakken erover, voor visuele controle.

Draai:  python3 spike/3dbag_spike.py
Uitvoer: docs/spike-3dbag/resultaten.json en docs/spike-3dbag/<slug>.jpg
Alle HTTP gaat via curl (gebruikt de proxy van de omgeving).
"""
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.parse
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UIT = os.path.join(ROOT, 'docs', 'spike-3dbag')
os.makedirs(UIT, exist_ok=True)

PANEEL = (1.134, 1.722)  # m, zoals config/pricing.json
WP = 430


def get(url, binair=False, pogingen=4):
    for poging in range(pogingen):
        r = subprocess.run(['curl', '-sS', '-m', '60', '-A', 'ICN-configurator-spike', url], capture_output=True)
        if r.returncode == 0:
            return r.stdout if binair else json.loads(r.stdout)
        time.sleep(2 ** poging)
    raise RuntimeError(r.stderr.decode()[:200])


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:50]


# ---------- PDOK ----------

def pdok(label):
    q = urllib.parse.quote(label)
    d = get(f'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q={q}&fq=type:adres&rows=10'
            '&fl=weergavenaam,provincienaam,adresseerbaarobject_id,centroide_rd,centroide_ll')
    docs = d['response']['docs']
    # Exacte straat + huisnummer(+toevoeging) heeft voorrang boven de beste tekstscore (bv. 20 boven 20A).
    straat_nr = label.split(',')[0].strip().lower()
    doc = next((x for x in docs if x['weergavenaam'].split(',')[0].strip().lower() == straat_nr), docs[0])
    x, y = map(float, re.findall(r'[\d.]+', doc['centroide_rd']))
    return doc, x, y


# ---------- 3DBAG ----------

def punt_in_polygoon(px, py, ring):
    binnen = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][:2]
        xj, yj = ring[j][:2]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi + 1e-12) + xi:
            binnen = not binnen
        j = i
    return binnen


def panden_rond(x, y, r):
    """Alle 3DBAG-panden in een bbox rond (x, y); geeft lijst (feature, transform)."""
    url = f'https://api.3dbag.nl/collections/pand/items?bbox={x-r},{y-r},{x+r},{y+r}&limit=50'
    d = get(url)
    tr = d['metadata']['transform']
    uit = [(f, tr) for f in d['features']]
    while True:
        nxt = next((l['href'] for l in d.get('links', []) if l['rel'] == 'next'), None)
        if not nxt or len(uit) > 400:
            break
        d = get(nxt)
        uit += [(f, tr) for f in d['features']]
    return uit


def verts(f, tr):
    s, t = tr['scale'], tr['translate']
    return [(v[0] * s[0] + t[0], v[1] * s[1] + t[1], v[2] * s[2] + t[2]) for v in f['vertices']]


def footprint(f, tr):
    V = verts(f, tr)
    pid = f['id']
    g = f['CityObjects'][pid]['geometry'][0]  # LoD0 MultiSurface
    return [[V[i] for i in surf[0]] for surf in g['boundaries']]


def newell(poly):
    nx = ny = nz = 0.0
    for i in range(len(poly)):
        x1, y1, z1 = poly[i]
        x2, y2, z2 = poly[(i + 1) % len(poly)]
        nx += (y1 - y2) * (z1 + z2)
        ny += (z1 - z2) * (x1 + x2)
        nz += (x1 - x2) * (y1 + y2)
    opp = 0.5 * math.sqrt(nx * nx + ny * ny + nz * nz)
    return (nx, ny, nz), opp


def dakvlakken(f, tr):
    """Alle RoofSurface-polygonen uit LoD2.2 met helling, azimut (0 = noord, 180 = zuid) en oppervlak."""
    V = verts(f, tr)
    vlakken = []
    for oid, o in f['CityObjects'].items():
        if o['type'] != 'BuildingPart':
            continue
        g = next((g for g in o.get('geometry', []) if g.get('lod') == '2.2'), None)
        if not g:
            continue
        srf = g['semantics']['surfaces']
        for shell_i, shell in enumerate(g['boundaries']):
            for face_i, face in enumerate(shell):
                sv = g['semantics']['values'][shell_i][face_i]
                if sv is None or srf[sv]['type'] != 'RoofSurface':
                    continue
                poly = [V[i] for i in face[0]]
                (nx, ny, nz), opp = newell(poly)
                if opp < 0.5:
                    continue
                n = math.sqrt(nx * nx + ny * ny + nz * nz)
                if nz < 0:
                    nx, ny, nz = -nx, -ny, -nz
                helling = math.degrees(math.acos(max(-1, min(1, nz / n))))
                azimut = (math.degrees(math.atan2(nx, ny)) + 360) % 360
                vlakken.append({'helling': helling, 'azimut': azimut, 'opp': opp, 'poly': poly})
    return vlakken


def groepeer(vlakken):
    """Voeg polygonen met (bijna) dezelfde oriëntatie samen tot dakvlakken."""
    groepen = []
    for v in sorted(vlakken, key=lambda v: -v['opp']):
        plat = v['helling'] < 8
        for g in groepen:
            if plat and g['plat']:
                break
            if not plat and not g['plat'] and abs(g['helling'] - v['helling']) < 6 and \
                    min(abs(g['azimut'] - v['azimut']), 360 - abs(g['azimut'] - v['azimut'])) < 15:
                break
        else:
            g = {'plat': plat, 'helling': v['helling'], 'azimut': v['azimut'], 'opp': 0.0, 'polys': []}
            groepen.append(g)
        g['opp'] += v['opp']
        g['polys'].append(v['poly'])
    return groepen


def windrichting(az):
    namen = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW']
    return namen[int(((az + 22.5) % 360) // 45)]


def geschikt(g):
    """Grof: plat dak, of schuin vlak tussen OZO en WNW met helling < 60 graden."""
    if g['plat']:
        return True
    return g['helling'] < 60 and 100 <= g['azimut'] <= 260


def panelen_schatting(g):
    # Indicatie: 70% van een schuin vlak bruikbaar (randen, nok, obstakels); plat dak oost-west op 55%.
    factor = 0.55 if g['plat'] else 0.70
    return int(g['opp'] * factor / (PANEEL[0] * PANEEL[1]))


# ---------- PVGIS ----------

def pvgis(lat, lon, helling, azimut):
    aspect = round(azimut - 180)  # PVGIS: 0 = zuid, -90 = oost, 90 = west
    u = (f'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat={lat}&lon={lon}&peakpower=1&loss=14'
         f'&angle={round(helling)}&aspect={aspect}&outputformat=json')
    d = get(u)
    return d['outputs']['totals']['fixed']['E_y']


# ---------- Luchtfoto met overlay ----------

def luchtfoto(x, y, half, groepen, buren, bestand, titel):
    px = 900
    bbox = f'{x-half},{y-half},{x+half},{y+half}'
    u = ('https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0?service=WMS&version=1.3.0&request=GetMap'
         f'&layers=Actueel_orthoHR&styles=&crs=EPSG:28992&bbox={bbox}&width={px}&height={px}&format=image/jpeg')
    img = Image.open(BytesIO(get(u, binair=True))).convert('RGB')
    over = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    s = px / (2 * half)
    P = lambda p: ((p[0] - (x - half)) * s, ((y + half) - p[1]) * s)
    for ring in buren:
        d.line([P(p) for p in ring] + [P(ring[0])], fill=(255, 255, 255, 140), width=1)
    for g in groepen:
        kleur = (57, 181, 74, 110) if geschikt(g) else (71, 149, 202, 90)
        for poly in g['polys']:
            d.polygon([P(p) for p in poly], fill=kleur, outline=(255, 255, 255, 230))
    d.ellipse([P((x, y))[0] - 5, P((x, y))[1] - 5, P((x, y))[0] + 5, P((x, y))[1] + 5], fill=(255, 60, 60, 255))
    img = Image.alpha_composite(img.convert('RGBA'), over).convert('RGB')
    dd = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
    except OSError:
        font = None
    dd.rectangle([0, 0, px, 30], fill=(11, 27, 105))
    dd.text((10, 5), titel, fill='white', font=font)
    dd.text((10, px - 26), 'Luchtfoto PDOK (CC BY 4.0) · dakvlakken 3DBAG (CC BY 4.0) · groen = geschikt, blauw = minder geschikt',
            fill='white', font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13) if font else None)
    img.save(bestand, quality=85)


# ---------- Hoofdroutine ----------

def onderzoek(adres):
    doc, x, y = pdok(adres['label'])
    lon, lat = map(float, re.findall(r'[\d.]+', doc['centroide_ll']))
    rond = panden_rond(x, y, 40)
    pand = None
    buren = []
    for f, tr in rond:
        rings = footprint(f, tr)
        if pand is None and any(punt_in_polygoon(x, y, r) for r in rings):
            pand = (f, tr)
        else:
            buren += rings
    res = {'adres': adres['label'], 'bag_weergave': doc['weergavenaam'], 'provincie': doc['provincienaam'],
           'verblijfsobject': doc['adresseerbaarobject_id'], 'rd': [x, y], 'lat': lat, 'lon': lon}
    if not pand:
        # Adrespunt ligt soms net buiten de footprint: neem het pand met de dichtstbijzijnde rand.
        def afstand(item):
            return min(math.hypot(p[0] - x, p[1] - y) for r in footprint(*item) for p in r)
        if rond:
            pand = min(rond, key=afstand)
            res['let_op'] = f'adrespunt ligt buiten de footprint; dichtstbijzijnde pand gekozen ({afstand(pand):.1f} m)'
            buren = [r for item in rond if item is not pand for r in footprint(*item)]
        else:
            res['fout'] = 'geen 3DBAG-pand gevonden binnen 40 m'
            return res
    f, tr = pand
    a = f['CityObjects'][f['id']]['attributes']
    groepen = groepeer(dakvlakken(f, tr))
    res.update({
        'pand': f['id'],
        'bouwjaar': a.get('oorspronkelijkbouwjaar'),
        'dak_type': a.get('b3_dak_type'),
        'kwaliteit': a.get('b3_kwaliteitsindicator'),
        'puntenwolk_datum': a.get('b3_pw_datum'),
        'puntenwolk_bron': a.get('b3_pw_bron'),
        'pw_selectie_reden': a.get('b3_pw_selectie_reden'),
        'mutatie_ahn4_ahn5': a.get('b3_mutatie_ahn4_ahn5'),
        'opp_dak_plat': a.get('b3_opp_dak_plat'),
        'opp_dak_schuin': a.get('b3_opp_dak_schuin'),
        'opp_grond': a.get('b3_opp_grond'),
        'h_nok': a.get('b3_h_nok'),
        'h_maaiveld': a.get('b3_h_maaiveld'),
        'n_buren_binnen_40m': len(rond) - 1,
        'dakvlakken': [],
    })
    for g in sorted(groepen, key=lambda g: -g['opp']):
        if g['opp'] < 3:
            continue
        res['dakvlakken'].append({
            'plat': g['plat'], 'helling': round(g['helling'], 1), 'azimut': round(g['azimut']),
            'richting': 'plat' if g['plat'] else windrichting(g['azimut']), 'opp': round(g['opp'], 1),
            'geschikt': geschikt(g), 'panelen_indicatie': panelen_schatting(g) if geschikt(g) else 0,
        })
    beste = [g for g in groepen if geschikt(g) and g['opp'] >= 3]
    if beste:
        b = max(beste, key=lambda g: g['opp'])
        hell = 13 if b['plat'] else b['helling']  # plat: aangenomen oost-west of zuid op 13 graden
        az = 180 if b['plat'] else b['azimut']
        res['pvgis_kwh_per_kwp_beste_vlak'] = round(pvgis(lat, lon, hell, az))
        n = sum(panelen_schatting(g) for g in beste)
        res['panelen_indicatie_totaal'] = n
        res['kwp_indicatie'] = round(n * WP / 1000, 1)
    titel = f"{adres['label']} · {res.get('dak_type')} · bouwjaar {res.get('bouwjaar')}"
    res['afbeelding'] = f"{slug(adres['label'])}.jpg"
    luchtfoto(x, y, 32, groepen, buren, os.path.join(UIT, res['afbeelding']), titel)
    return res


def main():
    adressen = json.load(open(os.path.join(ROOT, 'prototype', 'config', 'showcase.json')))['adressen']
    alles = []
    for a in adressen:
        try:
            r = onderzoek(a)
        except Exception as e:  # noqa: BLE001 - spike: per adres doorgaan
            r = {'adres': a['label'], 'fout': str(e)[:300]}
        alles.append(r)
        print(json.dumps({k: r.get(k) for k in ('adres', 'pand', 'dak_type', 'bouwjaar', 'kwaliteit', 'puntenwolk_datum',
                                                 'panelen_indicatie_totaal', 'pvgis_kwh_per_kwp_beste_vlak', 'fout')},
                         ensure_ascii=False), flush=True)
    json.dump(alles, open(os.path.join(UIT, 'resultaten.json'), 'w'), indent=2, ensure_ascii=False)


if __name__ == '__main__':
    sys.exit(main())
