/** Zonnestand (NOAA-benadering, nauwkeurig tot ruwweg 0,5 graad). Zuivere functies. */
const rad = Math.PI / 180;

export interface Zonstand {
  /** Hoogte boven de horizon in graden. */
  hoogte: number;
  /** Azimut in graden vanaf noord, met de klok mee. */
  azimut: number;
}

/** dag: dag van het jaar (1-365), uur: lokale zonnetijd-onafhankelijke klokuren in UTC. */
export function zonstand(lat: number, lon: number, dag: number, uurUtc: number): Zonstand {
  const g = (2 * Math.PI / 365) * (dag - 1 + (uurUtc - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const tijd = uurUtc * 60 + eqt + 4 * lon; // ware zonnetijd in minuten
  const ha = (tijd / 4 - 180) * rad;
  const phi = lat * rad;
  const cosZen = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZen)));
  let az = Math.acos(Math.min(1, Math.max(-1,
    (Math.sin(phi) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(phi) * Math.sin(zen)))));
  az = ha > 0 ? (az / rad + 180) % 360 : (540 - az / rad) % 360;
  return { hoogte: 90 - zen / rad, azimut: az };
}

/** Nederlandse klokuren naar UTC (zomertijd ruwweg dag 88-300). */
export function klokNaarUtc(dag: number, klokuur: number): number {
  const zomertijd = dag >= 88 && dag < 300;
  return klokuur - (zomertijd ? 2 : 1);
}

/** Eenheidsvector richting de zon in het lokale stelsel (x = oost, y = omhoog, z = zuid). */
export function zonVector(z: Zonstand): { x: number; y: number; z: number } {
  const h = z.hoogte * rad;
  const a = z.azimut * rad;
  return { x: Math.cos(h) * Math.sin(a), y: Math.sin(h), z: -Math.cos(h) * Math.cos(a) };
}

/** Normaal van een dakvlak in hetzelfde stelsel. */
export function vlakNormaal(helling: number, azimut: number): { x: number; y: number; z: number } {
  const t = helling * rad;
  const a = azimut * rad;
  return { x: Math.sin(t) * Math.sin(a), y: Math.cos(t), z: -Math.sin(t) * Math.cos(a) };
}
