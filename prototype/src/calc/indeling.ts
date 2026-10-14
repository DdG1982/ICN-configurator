/**
 * Standaardindeling: kies de beste plekken tot de opbrengst ongeveer het jaarverbruik dekt.
 * Na 2026 levert teruggeleverde stroom weinig op, dus een installatie die veel meer produceert dan je
 * verbruikt verdient zich trager terug. De bezoeker kan daarna zelf plekken toevoegen of weghalen.
 */
export interface PlekLike { id: string; kwh: number; actief: boolean; vlak?: string; rij?: number }

export function standaardIndeling<T extends PlekLike>(plekken: T[], verbruikKwh: number, dekking = 1.0, minimum = 4): Set<string> {
  // Aaneengesloten zoals een installateur legt: eerst het beste dakvlak, daarbinnen rij voor rij
  // (de pijplijn levert plekken per vlak rij voor rij aan); pas dan het volgende vlak.
  const perVlak = new Map<string, T[]>();
  for (const p of plekken.filter((x) => x.actief)) {
    const k = p.vlak ?? '';
    if (!perVlak.has(k)) perVlak.set(k, []);
    perVlak.get(k)!.push(p);
  }
  const gem = (l: T[]) => l.reduce((s, p) => s + p.kwh, 0) / l.length;
  const kandidaten = [...perVlak.values()].sort((a, b) => gem(b) - gem(a))
    .flatMap((l) => [...l].sort((a, b) => (a.rij ?? 0) - (b.rij ?? 0)));
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
