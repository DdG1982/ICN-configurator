"""
Fase 1 spike: Google Solar API (buildingInsights:findClosest) voor de demo-adressen, naast 3DBAG.

De API-sleutel wordt door de omgeving als header toegevoegd (network secret); dit script ziet hem niet.
Quota in Google Cloud: 3 aanvragen per minuut -> we wachten 22 s tussen aanroepen.
Per adres eerst requiredQuality=MEDIUM, bij 404 opnieuw met LOW. Kosten: max. 2 x 14 = 28 aanroepen.

Draai:  python3 spike/google_spike.py
Uitvoer: docs/spike-google/resultaten.json (+ ruwe antwoorden per adres)
"""
import json
import math
import os
import re
import subprocess
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UIT = os.path.join(ROOT, 'docs', 'spike-google')
os.makedirs(os.path.join(UIT, 'ruw'), exist_ok=True)
PAUZE = 22


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:50]


def roep(lat, lon, kwaliteit):
    url = (f'https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude={lat}'
           f'&location.longitude={lon}&requiredQuality={kwaliteit}')
    r = subprocess.run(['curl', '-sS', '-m', '60', '-w', '\n%{http_code}', url], capture_output=True, text=True)
    body, _, code = r.stdout.rpartition('\n')
    return int(code or 0), body


def afstand_m(lat1, lon1, lat2, lon2):
    dy = (lat2 - lat1) * 111_320
    dx = (lon2 - lon1) * 111_320 * math.cos(math.radians(lat1))
    return math.hypot(dx, dy)


def samenvatting(d, lat, lon):
    sp = d.get('solarPotential', {})
    segs = sp.get('roofSegmentStats', [])
    cfgs = sp.get('solarPanelConfigs', [])
    beste = cfgs[-1] if cfgs else {}
    return {
        'kwaliteit': d.get('imageryQuality'),
        'opnamedatum': '-'.join(str(d.get('imageryDate', {}).get(k, '')) for k in ('year', 'month', 'day')),
        'verwerkt': '-'.join(str(d.get('imageryProcessedDate', {}).get(k, '')) for k in ('year', 'month', 'day')),
        'afstand_tot_adrespunt_m': round(afstand_m(lat, lon, d['center']['latitude'], d['center']['longitude']), 1),
        'velden_aanwezig': sorted(k for k in ('postalCode', 'administrativeArea', 'regionCode', 'statisticalArea') if k in d),
        'dak_m2_google': round(sp.get('wholeRoofStats', {}).get('areaMeters2', 0), 1),
        'max_panelen': sp.get('maxArrayPanelsCount'),
        'paneel_wp_google': sp.get('panelCapacityWatts'),
        'paneelmaat_google': [sp.get('panelWidthMeters'), sp.get('panelHeightMeters')],
        'max_zonuren_per_jaar': round(sp.get('maxSunshineHoursPerYear', 0)),
        'n_dakvlakken': len(segs),
        'dakvlakken': [{
            'helling': round(s.get('pitchDegrees', 0), 1),
            'azimut': round(s.get('azimuthDegrees', 0)),
            'opp': round(s.get('stats', {}).get('areaMeters2', 0), 1),
            'zonuren_mediaan': round((s.get('stats', {}).get('sunshineQuantiles') or [0] * 11)[5]),
        } for s in sorted(segs, key=lambda s: -s.get('stats', {}).get('areaMeters2', 0))[:6]],
        'max_config_kwh_dc_per_jaar': round(beste.get('yearlyEnergyDcKwh', 0)),
        'n_configs': len(cfgs),
    }


def main():
    bag = {r['adres']: r for r in json.load(open(os.path.join(ROOT, 'docs', 'spike-3dbag', 'resultaten.json')))}
    alles = []
    eerste = True
    for adres, b in bag.items():
        lat, lon = b['lat'], b['lon']
        res = {'adres': adres, 'pogingen': []}
        for kwaliteit in ('MEDIUM', 'LOW'):
            if not eerste:
                time.sleep(PAUZE)
            eerste = False
            code, body = roep(lat, lon, kwaliteit)
            res['pogingen'].append({'requiredQuality': kwaliteit, 'http': code})
            if code == 200:
                d = json.loads(body)
                json.dump(d, open(os.path.join(UIT, 'ruw', slug(adres) + '.json'), 'w'), indent=1)
                res.update(samenvatting(d, lat, lon))
                res['gevonden_met'] = kwaliteit
                break
            res['fout'] = body[:300]
            if code != 404:
                break
        if 'gevonden_met' in res:
            res.pop('fout', None)
        res['3dbag'] = {k: b.get(k) for k in ('pand', 'dak_type', 'opp_dak_plat', 'opp_dak_schuin', 'panelen_indicatie_totaal', 'pvgis_kwh_per_kwp_beste_vlak')}
        alles.append(res)
        print(json.dumps({k: res.get(k) for k in ('adres', 'gevonden_met', 'kwaliteit', 'opnamedatum', 'afstand_tot_adrespunt_m',
                                                   'dak_m2_google', 'max_panelen', 'n_dakvlakken', 'max_config_kwh_dc_per_jaar', 'fout')},
                         ensure_ascii=False), flush=True)
        json.dump(alles, open(os.path.join(UIT, 'resultaten.json'), 'w'), indent=2, ensure_ascii=False)


if __name__ == '__main__':
    main()
