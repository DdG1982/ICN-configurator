/** Eigen paneelindeling: rechthoekig pakken op een dakvlak met randmarge. Zuivere functie. */
export interface Plek { id: string; rij: number; kolom: number; u: number; v: number; factor: number; actief: boolean }

export function paneelPlekken(
  breedte: number, diepte: number, paneel: { breedte: number; hoogte: number },
  marge: number, raster: number[][], drempel: number,
): Plek[] {
  const tussen = 0.02;
  const kolommen = Math.floor((breedte - 2 * marge + tussen) / (paneel.breedte + tussen));
  const rijen = Math.floor((diepte - 2 * marge + tussen) / (paneel.hoogte + tussen));
  const totaalB = kolommen * paneel.breedte + (kolommen - 1) * tussen;
  const totaalD = rijen * paneel.hoogte + (rijen - 1) * tussen;
  const startU = -totaalB / 2 + paneel.breedte / 2;
  const startV = (diepte - totaalD) / 2 + paneel.hoogte / 2;
  const nv = raster.length, nu = raster[0].length;
  const plekken: Plek[] = [];
  for (let r = 0; r < rijen; r++) {
    for (let k = 0; k < kolommen; k++) {
      const u = startU + k * (paneel.breedte + tussen);
      const v = startV + r * (paneel.hoogte + tussen);
      // Gemiddelde rasterwaarde onder het paneel.
      let som = 0, n = 0;
      for (let j = 0; j < nv; j++) {
        const cv = ((j + 0.5) / nv) * diepte;
        if (Math.abs(cv - v) > paneel.hoogte / 2) continue;
        for (let i = 0; i < nu; i++) {
          const cu = -breedte / 2 + ((i + 0.5) / nu) * breedte;
          if (Math.abs(cu - u) > paneel.breedte / 2) continue;
          som += raster[j][i]; n++;
        }
      }
      const factor = n ? som / n : 1;
      plekken.push({ id: `r${r}k${k}`, rij: r, kolom: k, u, v, factor, actief: factor >= drempel });
    }
  }
  return plekken;
}
