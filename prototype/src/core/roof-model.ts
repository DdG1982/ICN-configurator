/**
 * Genormaliseerd dakmodel. De UI leest alleen dit, nooit de bron (Google of Tier B).
 * Coördinaten in meters, lokaal stelsel: x = oost, z = zuid, y = omhoog.
 */
export type Bron = 'voorbeeld' | 'tier-a' | 'tier-b';

export interface Vec2 { x: number; z: number }

export interface Dakvlak {
  id: string;
  /** Helling in graden (0 = plat). */
  helling: number;
  /** Windrichting van de normaal in graden vanaf noord (180 = zuid). */
  azimut: number;
  /** Oppervlak in m². */
  oppervlak: number;
  /** Rechthoek in dakvlak-coördinaten: breedte langs de nok, diepte van goot tot nok (schuine lengte). */
  breedte: number;
  diepte: number;
}

export interface Gebouw {
  id: string;
  /** Middelpunt van de grondvlak-rechthoek. */
  midden: Vec2;
  breedte: number; // langs x
  diepte: number; // langs z
  gootHoogte: number;
  nokHoogte: number;
  /** Nok loopt langs x (oost-west) of langs z. */
  nokRichting: 'x' | 'z';
  rotatie?: number;
}

export interface Boom { id: string; positie: Vec2; hoogte: number; kroonStraal: number }

export interface RoofModel {
  bron: Bron;
  nauwkeurigheid: 'gecontroleerd' | 'indicatie' | 'illustratief';
  adresLabel: string;
  breedtegraad: number;
  lengtegraad: number;
  woning: Gebouw;
  dakvlakken: Dakvlak[];
  omgeving: { gebouwen: Gebouw[]; bomen: Boom[] };
  bouwjaar?: number;
}
