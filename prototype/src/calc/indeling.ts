/**
 * Standaardindeling: kies de beste plekken tot de opbrengst ongeveer het jaarverbruik dekt.
 * Na 2026 levert teruggeleverde stroom weinig op, dus een installatie die veel meer produceert dan je
 * verbruikt verdient zich trager terug. De bezoeker kan daarna zelf plekken toevoegen of weghalen.
 */
export interface PlekLike { id: string; kwh: number; actief: boolean }

export function standaardIndeling<T extends PlekLike>(plekken: T[], verbruikKwh: number, dekking = 1.0, minimum = 4): Set<string> {
  const kandidaten = plekken.filter((p) => p.actief).sort((a, b) => b.kwh - a.kwh);
  const gekozen = new Set<string>();
  let som = 0;
  for (const p of kandidaten) {
    if (som >= verbruikKwh * dekking && gekozen.size >= minimum) break;
    gekozen.add(p.id);
    som += p.kwh;
  }
  return gekozen;
}

/** Hoeveel procent minder levert deze plek dan de beste plek op het dak? */
export function minderDanBeste(kwh: number, beste: number): number {
  return beste > 0 ? Math.max(0, Math.round((1 - kwh / beste) * 100)) : 0;
}
