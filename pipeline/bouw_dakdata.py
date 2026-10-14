"""
VERVANGEN (14-10-2026) door prototype/scripts/bouw-voorbeelden.ts, dat dezelfde code gebruikt als het live opzoeken.
Deze Python-versie blijft staan als referentie. Bekende fout hierin: bij grote, licht scheve platte daken lag
het rekenpunt soms onder de eigen dakdriehoek, waardoor schaduw veel te hoog uitviel (Heerestraat 92: 0,42 i.p.v. ~0,9).

Tier B-dakdata voor de demo-adressen: PDOK + BAG + 3DBAG + AHN + PVGIS -> statische bestanden.

Per adres in prototype/config/showcase.json:
  prototype/public/data/<slug>/model.json   genormaliseerd dakmodel (zie src/core/dak-model.ts)
  prototype/public/data/<slug>/lucht-dichtbij.jpg   PDOK-luchtfoto 160 x 160 m
  prototype/public/data/<slug>/lucht-wijd.jpg       PDOK-luchtfoto 1600 x 1600 m (fly-in)
en prototype/public/data/index.json met de lijst.

Lokaal assenstelsel in model.json: x = oost (m), y = omhoog (m boven maaiveld van de woning),
z = zuid (m), oorsprong = middelpunt van de woning-footprint. Draai: python3 pipeline/bouw_dakdata.py [slug-filter]
Alle HTTP via curl (proxy van de omgeving). Bronnen: CC BY 4.0 (PDOK, 3DBAG, AHN), PVGIS (EC JRC).
"""
import json
import math
import os
import re
import subprocess
import sys
import time
from io import BytesIO

import mapbox_earcut as earcut
import numpy as np
import tifffile
from PIL import Image
from scipy import ndimage
from shapely.geometry import Polygon, Point, box
import shapely

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROTO = os.path.join(ROOT, 'prototype')
UIT = os.path.join(PROTO, 'public', 'data')
PRICING = json.load(open(os.path.join(PROTO, 'config', 'pricing.json')))
PANEEL_B, PANEEL_H = PRICING['paneelMaat']['breedte'], PRICING['paneelMaat']['hoogte']
WP = PRICING['paneelWp']
RAND = 0.4          # m randmarge op het dakvlak
TUSSEN = 0.02       # m tussen panelen
STRAAL_BUREN = 70   # m
NABIJ = 80          # half-breedte luchtfoto dichtbij (m)
WIJD = 800          # half-breedte luchtfoto wijd (m)


# ---------------------------------------------------------------- HTTP
def get(url, binair=False, pogingen=4):
    for p in range(pogingen):
        r = subprocess.run(['curl', '-sS', '-m', '90', '-A', 'ICN-configurator-pipeline', url], capture_output=True)
        if r.returncode == 0 and r.stdout:
            if binair:
                return r.stdout
            try:
                return json.loads(r.stdout)
            except json.JSONDecodeError:
                pass
        time.sleep(2 ** p)
    raise RuntimeError(f'ophalen mislukt: {url[:120]} {r.stderr.decode()[:200]}')


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:60]


# ---------------------------------------------------------------- PDOK / BAG
def pdok_adres(label):
    q = re.sub(r'\s+', '%20', label)
    d = get(f'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q={q}&fq=type:adres&rows=10'
            '&fl=weergavenaam,provincienaam,adresseerbaarobject_id,centroide_rd,centroide_ll')
    docs = d['response']['docs']
    straat_nr = label.split(',')[0].strip().lower()
    doc = next((x for x in docs if x['weergavenaam'].split(',')[0].strip().lower() == straat_nr), docs[0])
    x, y = map(float, re.findall(r'[\d.]+', doc['centroide_rd']))
    lon, lat = map(float, re.findall(r'[\d.]+', doc['centroide_ll']))
    return doc, x, y, lat, lon


def bag_pand(x, y):
    u = ('https://service.pdok.nl/lv/bag/wfs/v2_0?service=WFS&version=2.0.0&request=GetFeature&typeNames=bag:pand'
         f'&outputFormat=application/json&srsName=EPSG:28992&bbox={x-0.5},{y-0.5},{x+0.5},{y+0.5},EPSG:28992')
    d = get(u)
    if not d['features']:
        return None
    f = d['features'][0]
    p = f['properties']
    ring = f['geometry']['coordinates'][0]
    return {'id': p.get('identificatie'), 'bouwjaar': p.get('bouwjaar'), 'gebruiksdoel': p.get('gebruiksdoel'),
            'eenheden': p.get('aantal_verblijfsobjecten'), 'status': p.get('status'), 'footprint': ring}


# ---------------------------------------------------------------- 3DBAG
def panden_3dbag(x, y, r):
    d = get(f'https://api.3dbag.nl/collections/pand/items?bbox={x-r},{y-r},{x+r},{y+r}&limit=50')
    tr = d['metadata']['transform']
    uit = [(f, tr) for f in d['features']]
    while True:
        nxt = next((l['href'] for l in d.get('links', []) if l['rel'] == 'next'), None)
        if not nxt or len(uit) > 500:
            break
        d = get(nxt)
        tr_pagina = d['metadata']['transform']  # elke pagina heeft een eigen transform
        uit += [(f, tr_pagina) for f in d['features']]
    return uit


def verts(f, tr):
    s, t = tr['scale'], tr['translate']
    return np.array([(v[0] * s[0] + t[0], v[1] * s[1] + t[1], v[2] * s[2] + t[2]) for v in f['vertices']])


def footprint_rings(f, tr):
    V = verts(f, tr)
    g = f['CityObjects'][f['id']]['geometry'][0]
    return [V[surf[0]][:, :2] for surf in g['boundaries']]


def lod22_vlakken(f, tr):
    """Alle LoD2.2-oppervlakken: lijst (type, ringen[ np.array(n,3) ])."""
    V = verts(f, tr)
    uit = []
    for o in f['CityObjects'].values():
        if o['type'] != 'BuildingPart':
            continue
        g = next((g for g in o.get('geometry', []) if g.get('lod') == '2.2'), None)
        if not g:
            continue
        srf = g['semantics']['surfaces']
        for si, shell in enumerate(g['boundaries']):
            for fi, face in enumerate(shell):
                sv = g['semantics']['values'][si][fi]
                typ = srf[sv]['type'] if sv is not None else 'WallSurface'
                uit.append((typ, [V[ring] for ring in face]))
    return uit


# ---------------------------------------------------------------- geometrie
def newell(p):
    n = np.zeros(3)
    for i in range(len(p)):
        a, b = p[i], p[(i + 1) % len(p)]
        n += [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]
    opp = 0.5 * np.linalg.norm(n)
    return (n / (np.linalg.norm(n) + 1e-12)), opp


def basis_vlak(n):
    """Twee assen in het vlak: u horizontaal, v 'omhoog langs het dak' (of noord bij plat)."""
    if abs(n[2]) > 0.995:  # plat
        return np.array([1.0, 0, 0]), np.array([0, 1.0, 0])
    u = np.cross([0, 0, 1.0], n)
    u /= np.linalg.norm(u)
    v = np.cross(n, u)
    if v[2] < 0:
        v, u = -v, -u
    return u, v


def trianguleer(ringen):
    """Ringen (eerste = buitenrand, rest = gaten) in 3D -> driehoeken (n,3,3)."""
    n, opp = newell(ringen[0])
    if opp < 1e-6:
        return np.zeros((0, 3, 3))
    u, v = basis_vlak(n)
    o = ringen[0][0]
    pts2d, pts3d, ends = [], [], []
    for r in ringen:
        r = r[:-1] if np.allclose(r[0], r[-1]) else r
        for p in r:
            d = p - o
            pts2d.append([d @ u, d @ v])
            pts3d.append(p)
        ends.append(len(pts2d))
    if len(pts2d) < 3:
        return np.zeros((0, 3, 3))
    idx = earcut.triangulate_float64(np.array(pts2d, dtype=np.float64), np.array(ends, dtype=np.uint32))
    P = np.array(pts3d)
    return P[np.array(idx).reshape(-1, 3)]


# ---------------------------------------------------------------- zon en schaduw
def zonstanden(lat, lon, dagen, stap_uur):
    """Zonvectoren (lokaal: x oost, y omhoog, z zuid) en DNI-gewicht, alleen boven 3 graden."""
    uit, gew = [], []
    for dag in dagen:
        for uur in np.arange(3, 21.01, stap_uur):  # UTC
            g = 2 * math.pi / 365 * (dag - 1 + (uur - 12) / 24)
            decl = (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g)
                    + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))
            eqt = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g)
                            - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
            ha = math.radians(((uur * 60 + eqt + 4 * lon) / 4) - 180)
            phi = math.radians(lat)
            cz = math.sin(phi) * math.sin(decl) + math.cos(phi) * math.cos(decl) * math.cos(ha)
            zen = math.acos(max(-1, min(1, cz)))
            hoogte = 90 - math.degrees(zen)
            if hoogte < 3:
                continue
            az = math.degrees(math.acos(max(-1, min(1, (math.sin(phi) * math.cos(zen) - math.sin(decl)) /
                                                        (math.cos(phi) * math.sin(zen) + 1e-12)))))
            az = (az + 180) % 360 if ha > 0 else (540 - az) % 360
            h, a = math.radians(hoogte), math.radians(az)
            uit.append([math.cos(h) * math.sin(a), math.sin(h), -math.cos(h) * math.cos(a)])
            am = 1 / max(0.05, math.sin(h))
            gew.append(1000 * 0.7 ** (am ** 0.678))
    return np.array(uit), np.array(gew)


def raak_driehoeken(o, D, T):
    """Möller-Trumbore: voor elke richting in D (k,3) vanaf o: raakt een driehoek uit T (m,3,3)? -> (k,) bool."""
    if len(T) == 0:
        return np.zeros(len(D), bool)
    v0, e1, e2 = T[:, 0], T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]
    p = np.cross(D[:, None, :], e2[None])                      # k,m,3
    det = np.einsum('kmj,mj->km', p, e1)
    ok = np.abs(det) > 1e-9
    inv = np.where(ok, 1 / np.where(ok, det, 1), 0)
    s = o - v0                                                  # m,3
    uu = np.einsum('mj,kmj->km', s, p) * inv
    q = np.cross(s, e1)                                         # m,3
    vv = np.einsum('kj,mj->km', D, q) * inv
    t = np.einsum('mj,mj->m', e2, q)[None] * inv
    hit = ok & (uu >= 0) & (vv >= 0) & (uu + vv <= 1) & (t > 0.05)
    return hit.any(1)


def raak_bollen(o, D, bomen):
    if not bomen:
        return np.zeros(len(D), bool)
    C = np.array([[b['x'], b['h'] - b['r'], b['z']] for b in bomen])
    R = np.array([b['r'] for b in bomen])
    oc = o - C                                                  # n,3
    b = D @ oc.T                                                # k,n
    c = (oc * oc).sum(1) - R * R
    disc = b * b - c[None]
    t = -b + np.sqrt(np.maximum(disc, 0))
    return ((disc > 0) & (t > 0)).any(1)


def schaduwfactor(punt, normaal, D, W, T, bomen):
    """Verhouding instraling met schaduw / zonder schaduw (direct + vast diffuus deel)."""
    cos = D @ normaal
    zicht = cos > 0
    if not zicht.any():
        return 0.0
    o = punt + normaal * 0.05
    Dz, Wz, cz = D[zicht], W[zicht], cos[zicht]
    # Alleen driehoeken die hoger liggen dan het punt kunnen schaduw geven.
    Tz = T[T[:, :, 1].max(1) > o[1] + 0.05]
    geblokt = raak_driehoeken(o, Dz, Tz) | raak_bollen(o, Dz, bomen)
    direct = (Wz * cz).sum()
    direct_vrij = (Wz * cz * ~geblokt).sum()
    diffuus = 0.18 * direct  # grove aanname: diffuus aandeel, niet beschaduwd
    return float((direct_vrij + diffuus) / (direct + diffuus))


# ---------------------------------------------------------------- AHN-bomen
def bomen_uit_ahn(x0, y0, r, gebouw_polys):
    def wcs(cov):
        u = ('https://service.pdok.nl/rws/ahn/wcs/v1_0?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage'
             f'&COVERAGEID={cov}&SUBSET=x({x0-r},{x0+r})&SUBSET=y({y0-r},{y0+r})&FORMAT=image/tiff')
        a = tifffile.imread(BytesIO(get(u, binair=True))).astype(float)
        a[a > 1e30] = np.nan
        return a
    dsm, dtm = wcs('dsm_05m'), wcs('dtm_05m')
    grond = dtm
    # gaten in het maaiveld (onder gebouwen/bomen) opvullen met het dichtstbijzijnde maaiveld
    if np.isnan(dtm).any():
        idx = ndimage.distance_transform_edt(np.isnan(dtm), return_distances=False, return_indices=True)
        grond = dtm[tuple(idx)]
    hoogte = dsm - grond
    n = dsm.shape[0]
    px = 2 * r / n
    gebouw = np.zeros_like(hoogte, bool)
    ys, xs = np.mgrid[0:n, 0:n]
    X = x0 - r + (xs + 0.5) * px
    Y = y0 + r - (ys + 0.5) * px
    for poly in gebouw_polys:
        gebouw |= shapely.contains_xy(poly.buffer(1.0), X, Y)
    veg = (hoogte > 2.5) & ~gebouw & ~np.isnan(hoogte)
    veg = ndimage.binary_opening(veg, iterations=1)
    lab, nlab = ndimage.label(veg)
    bomen = []
    for k in range(1, nlab + 1):
        m = lab == k
        opp = m.sum() * px * px
        if opp < 3:
            continue
        hmax = float(np.nanpercentile(hoogte[m], 95))
        # Grote vlekken (bomenrij) opknippen: per ~6 m een boom op lokale maxima.
        if opp > 60:
            loc = (ndimage.maximum_filter(np.where(m, hoogte, 0), size=int(5 / px)) == hoogte) & m & (hoogte > 3)
            for i, j in zip(*np.where(loc)):
                bomen.append({'x': float(X[i, j] - x0), 'z': float(-(Y[i, j] - y0)), 'h': float(hoogte[i, j]), 'r': 3.0})
        else:
            i, j = ndimage.center_of_mass(m)
            rr = math.sqrt(opp / math.pi)
            bomen.append({'x': float(x0 - r + (j + 0.5) * px - x0), 'z': float(-((y0 + r - (i + 0.5) * px) - y0)),
                          'h': hmax, 'r': float(min(max(rr, 1.2), 6))})
    return bomen


# ---------------------------------------------------------------- PVGIS
_pv_cache = {}


def pvgis(lat, lon, helling, aspect):
    k = (round(lat, 3), round(lon, 3), round(helling), round(aspect))
    if k not in _pv_cache:
        u = (f'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat={lat}&lon={lon}&peakpower=1&loss=14'
             f'&angle={round(helling)}&aspect={round(aspect)}&outputformat=json')
        _pv_cache[k] = get(u)['outputs']['totals']['fixed']['E_y']
        time.sleep(0.1)
    return _pv_cache[k]


# ---------------------------------------------------------------- luchtfoto
def luchtfoto(x, y, half, px, bestand):
    u = ('https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0?service=WMS&version=1.3.0&request=GetMap'
         f'&layers=Actueel_orthoHR&styles=&crs=EPSG:28992&bbox={x-half},{y-half},{x+half},{y+half}'
         f'&width={px}&height={px}&format=image/jpeg')
    Image.open(BytesIO(get(u, binair=True))).convert('RGB').save(bestand, quality=82, optimize=True, progressive=True)


# ---------------------------------------------------------------- paneelplekken
def plekken_op_vlak(ring3d, n, plat):
    """Rechthoekige paneelplekken (staand) binnen het dakvlak met randmarge. Geeft lijst van 4 hoekpunten (3D)."""
    u, v = basis_vlak(n)
    o = ring3d[0]
    p2 = Polygon([((p - o) @ u, (p - o) @ v) for p in ring3d])
    if not p2.is_valid:
        p2 = p2.buffer(0)
    binnen = p2.buffer(-RAND)
    if binnen.is_empty:
        return []
    if plat:
        # Plat dak: oost-west-opstelling in rijen, staand paneel = 1.722 m in noord-zuid, rijgang 0.5 m per twee rijen
        bw, bh, gap_v = PANEEL_B, PANEEL_H, TUSSEN
    else:
        bw, bh, gap_v = PANEEL_B, PANEEL_H, TUSSEN
    mnx, mny, mxx, mxy = binnen.bounds
    uit = []
    rij = 0
    yv = mny
    while yv + bh <= mxy + 1e-6:
        xu = mnx
        while xu + bw <= mxx + 1e-6:
            if binnen.contains(box(xu, yv, xu + bw, yv + bh)):
                hoeken = [o + u * a + v * b for a, b in ((xu, yv), (xu + bw, yv), (xu + bw, yv + bh), (xu, yv + bh))]
                uit.append({'rij': rij, 'hoeken': hoeken})
            xu += bw + TUSSEN
        rij += 1
        yv += bh + (0.5 if plat and rij % 2 == 0 else gap_v)
    return uit


# ---------------------------------------------------------------- hoofdroutine per adres
def lokaal(P, ox, oy, oz):
    P = np.asarray(P, float)
    return np.stack([P[..., 0] - ox, P[..., 2] - oz, -(P[..., 1] - oy)], -1)


def verwerk(adres, werkgebied):
    s = slug(adres['label'])
    map_ = os.path.join(UIT, s)
    os.makedirs(map_, exist_ok=True)
    doc, x, y, lat, lon = pdok_adres(adres['label'])
    bag = bag_pand(x, y)
    rond = panden_3dbag(x, y, STRAAL_BUREN)
    doel = None
    for f, tr in rond:
        if bag and f['id'].endswith(bag['id']):
            doel = (f, tr)
            break
    model = {
        'versie': 2,
        'adres': {'label': adres['label'], 'bag': doc['weergavenaam'], 'provincie': doc['provincienaam'],
                  'lat': lat, 'lon': lon, 'soort': adres.get('soort')},
        'pand': {k: bag.get(k) for k in ('id', 'bouwjaar', 'gebruiksdoel', 'eenheden')} if bag else None,
        'buitenWerkgebied': doc['provincienaam'] not in werkgebied,
        'bronnen': ['PDOK Locatieserver', 'BAG (Kadaster)', '3DBAG (TU Delft, 3DGI)', 'AHN (Rijkswaterstaat)', 'PDOK luchtfoto', 'PVGIS (EC JRC)'],
    }
    # Oorsprong: midden van de BAG-footprint (of adrespunt).
    if bag:
        fp = Polygon(bag['footprint'])
        ox, oy = fp.centroid.x, fp.centroid.y
    else:
        ox, oy = x, y
    luchtfoto(ox, oy, NABIJ, 1280, os.path.join(map_, 'lucht-dichtbij.jpg'))
    luchtfoto(ox, oy, WIJD, 1024, os.path.join(map_, 'lucht-wijd.jpg'))
    model['luchtfoto'] = {'dichtbij': {'bestand': 'lucht-dichtbij.jpg', 'half': NABIJ},
                          'wijd': {'bestand': 'lucht-wijd.jpg', 'half': WIJD}}

    gd = (bag or {}).get('gebruiksdoel') or ''
    eenheden = (bag or {}).get('eenheden') or 1
    if not doel:
        model['status'] = 'niet-in-3dbag'
        model['footprint'] = lokaal([[p[0], p[1], 0] for p in bag['footprint']], ox, oy, 0)[:, [0, 2]].round(2).tolist() if bag else []
        json.dump(model, open(os.path.join(map_, 'model.json'), 'w'), separators=(',', ':'))
        return s, model
    andere = [d for d in gd.split(',') if d and d != 'woonfunctie']
    if 'woonfunctie' in gd and not andere and eenheden >= 3:
        model['status'] = 'appartement'
    elif adres.get('soort') == 'monument':
        model['status'] = 'monument'
    elif gd and 'woonfunctie' not in gd and 'overige' in gd:
        model['status'] = 'bijgebouw'
    elif andere:
        model['status'] = 'zakelijk'
    else:
        model['status'] = 'woning'

    f, tr = doel
    attr = f['CityObjects'][f['id']]['attributes']
    oz = attr.get('b3_h_maaiveld') or 0.0
    model['kwaliteit'] = {'3dbagGoed': bool(attr.get('b3_kwaliteitsindicator')), 'puntenwolkJaar': attr.get('b3_pw_datum'),
                          'dakType': attr.get('b3_dak_type')}

    def mesh(vlakken):
        pos, typ = [], []
        for t, ringen in vlakken:
            tri = trianguleer(ringen)
            if len(tri):
                pos.append(tri)
                typ += [{'RoofSurface': 1, 'WallSurface': 2}.get(t, 0)] * len(tri)
        if not pos:
            return np.zeros((0, 3, 3)), []
        return np.concatenate(pos), typ

    woning_vlakken = lod22_vlakken(f, tr)
    W_tri, W_typ = mesh(woning_vlakken)
    buren_tri, buren_typ, buren_fp = [], [], []
    for g, tr2 in rond:
        if g is f:
            continue
        t, ty = mesh(lod22_vlakken(g, tr2))
        if len(t):
            buren_tri.append(t)
            buren_typ += ty
        buren_fp += [Polygon(r) for r in footprint_rings(g, tr2) if len(r) >= 3]
    B_tri = np.concatenate(buren_tri) if buren_tri else np.zeros((0, 3, 3))
    W_l, B_l = lokaal(W_tri, ox, oy, oz), lokaal(B_tri, ox, oy, oz)

    def pak(tri, typ):
        return {'pos': tri.reshape(-1).round(2).tolist(), 'type': typ}
    # Alleen dak- en muurvlakken van buren meesturen (grond niet nodig).
    keep = [i for i, t in enumerate(buren_typ) if t in (1, 2)]
    model['woning'] = pak(W_l, W_typ)
    model['buren'] = pak(B_l[keep], [buren_typ[i] for i in keep])
    fp_w = [Polygon(r) for r in footprint_rings(f, tr) if len(r) >= 3]

    print('  bomen uit AHN...', flush=True)
    try:
        bomen = bomen_uit_ahn(ox, oy, 45, fp_w + buren_fp)
    except Exception as e:  # noqa: BLE001
        print('  AHN mislukt:', e)
        bomen = []
    model['bomen'] = [{k: round(v, 2) for k, v in b.items()} for b in bomen]

    # Dakvlakken van de woning en paneelplekken
    occ = np.concatenate([W_l, B_l]) if len(B_l) else W_l
    D, Wg = zonstanden(lat, lon, [21, 52, 80, 111, 141, 172, 202, 233, 264, 294, 325, 355], 0.5)
    dakvlakken, plekken = [], []
    for t, ringen in woning_vlakken:
        if t != 'RoofSurface':
            continue
        ring = lokaal(ringen[0], ox, oy, oz)
        ring = ring[:-1] if np.allclose(ring[0], ring[-1]) else ring
        # newell in lokaal stelsel (y omhoog): zet om naar (x, z_noord, y) voor de basis
        rn = np.stack([ring[:, 0], -ring[:, 2], ring[:, 1]], -1)
        n_rd, opp = newell(rn)
        if n_rd[2] < 0:
            n_rd = -n_rd
            rn = rn[::-1]
        helling = math.degrees(math.acos(min(1, n_rd[2])))
        azimut = (math.degrees(math.atan2(n_rd[0], n_rd[1])) + 360) % 360
        if opp < 4 or helling > 65:
            continue
        plat = helling < 8
        vid = f'v{len(dakvlakken)}'
        if plat:
            kwh = (pvgis(lat, lon, 10, -90) + pvgis(lat, lon, 10, 90)) / 2
        else:
            kwh = pvgis(lat, lon, helling, azimut - 180)
        geschikt = plat or (95 <= azimut <= 265)
        normaal_l = np.array([n_rd[0], n_rd[2], -n_rd[1]])
        vlak = {'id': vid, 'helling': round(helling, 1), 'azimut': round(azimut), 'opp': round(opp, 1), 'plat': plat,
                'kwhPerKwp': round(kwh), 'geschikt': geschikt, 'normaal': normaal_l.round(4).tolist(),
                'rand': np.stack([rn[:, 0], rn[:, 2], -rn[:, 1]], -1).round(2).tolist()}
        dakvlakken.append(vlak)
        # Warmtekaart: raster over het vlak; de schaduwfactor van een paneelplek is het gemiddelde van de cellen eronder.
        u, v = basis_vlak(n_rd)
        o = rn[0]
        p2 = Polygon([((q - o) @ u, (q - o) @ v) for q in rn]).buffer(0)
        mnx, mny, mxx, mxy = p2.bounds
        stap = 1.0 if opp < 150 else 2.0 if opp < 600 else 4.0
        Dx, Wx = (D, Wg) if opp < 150 else (D[::2], Wg[::2])
        cellen, cel2d = [], []
        for a in np.arange(mnx + stap / 2, mxx, stap):
            for b in np.arange(mny + stap / 2, mxy, stap):
                if p2.contains(Point(a, b)):
                    q = o + u * a + v * b
                    ql = np.array([q[0], q[2], -q[1]])
                    fac = schaduwfactor(ql, normaal_l, Dx, Wx, occ, bomen)
                    cellen.append([*ql.round(2).tolist(), round(fac, 2)])
                    cel2d.append((a, b, fac))
        vlak['warmte'] = {'stap': stap, 'u': np.array([u[0], u[2], -u[1]]).round(4).tolist(),
                          'v': np.array([v[0], v[2], -v[1]]).round(4).tolist(), 'cellen': cellen}
        C = np.array(cel2d) if cel2d else np.zeros((0, 3))
        for p in plekken_op_vlak(rn, n_rd, plat):
            H = np.array(p['hoeken'])
            H2 = np.array([((q - o) @ u, (q - o) @ v) for q in H])
            if len(C):
                binnen = (C[:, 0] >= H2[:, 0].min()) & (C[:, 0] <= H2[:, 0].max()) & (C[:, 1] >= H2[:, 1].min()) & (C[:, 1] <= H2[:, 1].max())
                if binnen.any():
                    fac = float(C[binnen, 2].mean())
                else:
                    m2 = H2.mean(0)
                    fac = float(C[np.argmin(((C[:, :2] - m2) ** 2).sum(1)), 2])
            else:
                fac = 1.0
            H_l = np.stack([H[:, 0], H[:, 2], -H[:, 1]], -1)
            plekken.append({'id': f'{vid}p{len(plekken)}', 'vlak': vid, 'rij': p['rij'], 'hoeken': H_l.round(3).tolist(),
                            'schaduw': round(fac, 3), 'kwh': round(WP / 1000 * kwh * fac)})
    beste = max([p['kwh'] for p in plekken], default=1) or 1
    for p in plekken:
        vl = next(v for v in dakvlakken if v['id'] == p['vlak'])
        p['actief'] = bool(vl['geschikt'] and p['kwh'] >= 0.8 * beste and model['status'] not in ('appartement', 'monument'))
    model['dakvlakken'] = dakvlakken
    model['plekken'] = plekken
    json.dump(model, open(os.path.join(map_, 'model.json'), 'w'), separators=(',', ':'))
    return s, model


def main():
    filt = sys.argv[1] if len(sys.argv) > 1 else ''
    sc = json.load(open(os.path.join(PROTO, 'config', 'showcase.json')))
    os.makedirs(UIT, exist_ok=True)
    idx_pad = os.path.join(UIT, 'index.json')
    index = json.load(open(idx_pad)) if os.path.exists(idx_pad) and filt else []
    for a in sc['adressen']:
        if filt and filt not in slug(a['label']):
            continue
        t0 = time.time()
        print(a['label'], flush=True)
        try:
            s, m = verwerk(a, sc['werkgebiedProvincies'])
        except Exception as e:  # noqa: BLE001
            print('  FOUT', e)
            continue
        index = [i for i in index if i['slug'] != s]
        actief = [p for p in m.get('plekken', []) if p['actief']]
        index.append({'slug': s, 'label': a['label'], 'provincie': m['adres']['provincie'], 'status': m['status'],
                      'buitenWerkgebied': m['buitenWerkgebied'], 'panelen': len(actief),
                      'kwh': sum(p['kwh'] for p in actief)})
        print(f"  {m['status']}, {len(m.get('dakvlakken', []))} dakvlakken, {len(m.get('plekken', []))} plekken, "
              f"{len(actief)} actief, {sum(p['kwh'] for p in actief)} kWh, {len(m.get('bomen', []))} bomen, {time.time()-t0:.0f}s", flush=True)
    order = [slug(a['label']) for a in sc['adressen']]
    index.sort(key=lambda i: order.index(i['slug']) if i['slug'] in order else 99)
    json.dump(index, open(idx_pad, 'w'), indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
