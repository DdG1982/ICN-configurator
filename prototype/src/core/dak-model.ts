/**
 * Genormaliseerd dakmodel (versie 2), zoals pipeline/bouw_dakdata.py het schrijft.
 * De UI leest alleen dit en weet niet uit welke bron het komt (Tier B nu, later eventueel Tier A).
 * Lokaal stelsel: x = oost, y = omhoog (m boven maaiveld), z = zuid; oorsprong = midden van de woning.
 */
export type DakStatus = 'woning' | 'zakelijk' | 'bijgebouw' | 'appartement' | 'monument' | 'niet-in-3dbag';

export interface Mesh {
  /** Driehoeken: 9 getallen per driehoek. */
  pos: number[];
  /** Per driehoek: 0 = grond, 1 = dak, 2 = muur. */
  type: number[];
}

export interface Boom { x: number; z: number; h: number; r: number }

export interface Dakvlak {
  id: string;
  helling: number;
  azimut: number;
  opp: number;
  plat: boolean;
  kwhPerKwp: number;
  geschikt: boolean;
  normaal: [number, number, number];
  rand: [number, number, number][];
  warmte: { stap: number; u: [number, number, number]; v: [number, number, number]; cellen: [number, number, number, number][] };
}

export interface Plek {
  id: string;
  vlak: string;
  rij: number;
  hoeken: [number, number, number][];
  /** 0..1: deel van de instraling dat overblijft na schaduw van buren, bomen en eigen dak. */
  schaduw: number;
  /** Jaaropbrengst van dit paneel (kWh), PVGIS per dakvlak x schaduw. */
  kwh: number;
  /** Kandidaat volgens de pijplijn (goed vlak, weinig schaduw). */
  actief: boolean;
}

export interface DakModel {
  versie: 2;
  status: DakStatus;
  adres: { label: string; bag: string; provincie: string; lat: number; lon: number; soort?: string };
  pand: { id: string; bouwjaar: number; gebruiksdoel: string; eenheden: number } | null;
  buitenWerkgebied: boolean;
  bronnen: string[];
  /** wijd.midden: middelpunt van de wijde foto (x, z) als die niet op de oorsprong ligt (live: het adrespunt). */
  luchtfoto: { dichtbij: { bestand: string; half: number }; wijd: { bestand: string; half: number; midden?: [number, number] } };
  kwaliteit?: { '3dbagGoed': boolean; puntenwolkJaar: number; dakType: string };
  woning?: Mesh;
  buren?: Mesh;
  bomen?: Boom[];
  dakvlakken?: Dakvlak[];
  plekken?: Plek[];
  footprint?: [number, number][];
  /** Live: wat er niet gelukt is (bijv. AHN niet bereikbaar), om eerlijk te tonen. */
  waarschuwingen?: string[];
}

export interface IndexItem {
  slug: string;
  label: string;
  provincie: string;
  status: DakStatus;
  buitenWerkgebied: boolean;
  panelen: number;
  kwh: number;
}
