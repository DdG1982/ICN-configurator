/**
 * ILLUSTRATIEVE voorbeeldwoning voor het ontwerpprototype (Fase 2a).
 * Dit is geen gemeten dak van een echt adres. Vrijstaande woning, nok oost-west.
 */
import type { RoofModel } from '../core/roof-model';

const helling = 40;
const diepte = 8.6;
const gootHoogte = 3.1;
const schuin = diepte / 2 / Math.cos((helling * Math.PI) / 180);
const nokHoogte = gootHoogte + (diepte / 2) * Math.tan((helling * Math.PI) / 180);

export const voorbeeldwoning: RoofModel = {
  bron: 'voorbeeld',
  nauwkeurigheid: 'illustratief',
  adresLabel: 'Voorbeeldwoning',
  breedtegraad: 53.14,
  lengtegraad: 6.43,
  bouwjaar: 1978,
  woning: { id: 'woning', midden: { x: 0, z: 0 }, breedte: 10.4, diepte, gootHoogte, nokHoogte, nokRichting: 'x' },
  dakvlakken: [
    { id: 'zuid', helling, azimut: 180, breedte: 10.4, diepte: schuin, oppervlak: 10.4 * schuin },
    { id: 'noord', helling, azimut: 0, breedte: 10.4, diepte: schuin, oppervlak: 10.4 * schuin },
  ],
  omgeving: {
    gebouwen: [
      { id: 'buur-west', midden: { x: -15.5, z: 1 }, breedte: 9, diepte: 9, gootHoogte: 3, nokHoogte: 8.6, nokRichting: 'z' },
      { id: 'buur-oost', midden: { x: 15, z: -1 }, breedte: 9.5, diepte: 8.5, gootHoogte: 3.2, nokHoogte: 8.2, nokRichting: 'x' },
      { id: 'garage', midden: { x: 8.4, z: 1.8 }, breedte: 3.6, diepte: 6, gootHoogte: 2.6, nokHoogte: 2.8, nokRichting: 'z' },
      { id: 'overkant-1', midden: { x: -6, z: 31 }, breedte: 10, diepte: 8.5, gootHoogte: 3, nokHoogte: 8, nokRichting: 'x' },
      { id: 'overkant-2', midden: { x: 10, z: 32 }, breedte: 9, diepte: 8.5, gootHoogte: 3, nokHoogte: 8.4, nokRichting: 'x' },
    ],
    bomen: [
      { id: 'eik', positie: { x: -8.2, z: 9.5 }, hoogte: 12.5, kroonStraal: 3.6 },
      { id: 'berk', positie: { x: 12.5, z: 12 }, hoogte: 9, kroonStraal: 2.4 },
    ],
  },
};
