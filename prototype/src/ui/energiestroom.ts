/** Energiestroom: zon -> huis -> net, met stromende deeltjes. SVG, werkt zonder WebGL. */

const fmt = (kw: number) => kw.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export interface Stroom { pv: number; verbruik: number }

export function maakEnergiestroom(el: HTMLElement) {
  el.innerHTML = `
  <svg viewBox="0 0 360 180" role="img" aria-labelledby="stroom-titel">
    <title id="stroom-titel">Stroom van je panelen naar je huis en het net</title>
    <style>
      .knoop { fill: var(--vlak-2); stroke: var(--lijn-sterk); stroke-width: 1.5; }
      .knoop-tekst { fill: var(--tekst); font: 600 13px var(--font-tekst); text-anchor: middle; }
      .knoop-sub { fill: var(--tekst-2); font: 500 12px var(--font-tekst); text-anchor: middle; font-variant-numeric: tabular-nums; }
      .baan { fill: none; stroke: var(--lijn-sterk); stroke-width: 2; }
      .deeltjes { fill: none; stroke-linecap: round; stroke-dasharray: 0.1 14; animation: stroom var(--duur, 1s) linear infinite; }
      .deeltjes.terug { animation-direction: reverse; }
      @keyframes stroom { to { stroke-dashoffset: -14.1; } }
      @media (prefers-reduced-motion: reduce) { .deeltjes { animation: none; stroke-dasharray: none; opacity: .5; } }
      .icoon { fill: none; stroke: var(--tekst-2); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .icoon-zon { stroke: var(--accent); }
      .later { opacity: .45; }
    </style>
    <path class="baan" id="p-zon" d="M70 60 C 120 60, 130 85, 165 85" />
    <path class="baan" id="p-net" d="M215 85 C 250 85, 260 60, 290 60" />
    <path class="baan later" d="M190 118 L190 132" stroke-dasharray="3 4" />
    <path class="deeltjes" id="d-zon" d="M70 60 C 120 60, 130 85, 165 85" stroke="var(--accent)" stroke-width="6" />
    <path class="deeltjes" id="d-net" d="M215 85 C 250 85, 260 60, 290 60" stroke="var(--accent)" stroke-width="6" />

    <g transform="translate(40 60)">
      <circle class="knoop" r="30" />
      <circle class="icoon icoon-zon" r="8" />
      <g class="icoon icoon-zon">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="0" y1="-12" x2="0" y2="-16" transform="rotate(${a})" />`).join('')}</g>
      <text class="knoop-tekst" y="50">Panelen</text>
      <text class="knoop-sub" y="66" id="t-pv">0,0 kW</text>
    </g>
    <g transform="translate(190 85)">
      <circle class="knoop" r="30" />
      <path class="icoon" d="M-11 2 L0 -9 L11 2 M-8 0 V10 H8 V0" />
      <text class="knoop-tekst" y="-40">Je huis</text>
      <text class="knoop-sub" y="50" id="t-huis">0,0 kW</text>
    </g>
    <g transform="translate(320 60)">
      <circle class="knoop" r="30" />
      <path class="icoon" d="M0 -12 L-7 12 M0 -12 L7 12 M-9 -5 H9 M-5 4 H5" />
      <text class="knoop-tekst" y="50">Net</text>
      <text class="knoop-sub" y="66" id="t-net">0,0 kW</text>
    </g>
    <g transform="translate(190 150)" class="later">
      <rect class="knoop" x="-42" y="-14" width="84" height="28" rx="14" />
      <text class="knoop-sub" y="4">Batterij · later</text>
    </g>
  </svg>`;
  const $ = (id: string) => el.querySelector<SVGElement>('#' + id)!;
  return function update(s: Stroom): string {
    const zelf = Math.min(s.pv, s.verbruik);
    const terug = Math.max(0, s.pv - s.verbruik);
    const af = Math.max(0, s.verbruik - s.pv);
    $('t-pv').textContent = `${fmt(s.pv)} kW`;
    $('t-huis').textContent = `${fmt(s.verbruik)} kW`;
    $('t-net').textContent = terug > 0.05 ? `↑ ${fmt(terug)} kW` : af > 0.05 ? `↓ ${fmt(af)} kW` : '0,0 kW';
    const dz = $('d-zon'), dn = $('d-net');
    dz.style.opacity = s.pv > 0.05 ? '1' : '0';
    dz.style.setProperty('--duur', `${Math.max(0.35, 1.6 - s.pv / 4)}s`);
    const netStroom = Math.max(terug, af);
    dn.style.opacity = netStroom > 0.05 ? '1' : '0';
    dn.classList.toggle('terug', af > terug);
    dn.setAttribute('stroke', af > terug ? 'var(--tekst-3)' : 'var(--accent)');
    dn.style.setProperty('--duur', `${Math.max(0.35, 1.6 - netStroom / 4)}s`);
    if (s.pv < 0.05) return 'Geen zon: je huis haalt nu alle stroom van het net.';
    if (terug > 0.05) return `Je panelen leveren meer dan je huis nu gebruikt. ${fmt(zelf)} kW gebruik je zelf, ${fmt(terug)} kW gaat naar het net. Vanaf 2027 levert zelf gebruiken het meeste op.`;
    return `Je huis gebruikt alle zonnestroom zelf en haalt nog ${fmt(af)} kW van het net.`;
  };
}
