// Build-time access to content/. Imported JSON is bundled into the build, so no
// file or network reads happen when a visitor loads a page.
import countriesJson from '../../content/countries.json';
import archiveJson from '../../content/archive.json';
import upcomingJson from '../../content/upcoming.json';
import type { ArchiveRow, Contest, Countries, Upcoming } from './types';
import { countryCodes, slugify } from './derive';

const contestFiles = import.meta.glob<Contest>('../../content/contests/*.json', { eager: true, import: 'default' });

export const countries = countriesJson as Countries;
export const upcoming = upcomingJson as Upcoming;

export const contests: Record<number, Contest> = Object.fromEntries(
  Object.values(contestFiles).map((c) => [c.year, c]),
);

// Every year that gets a page: the archive plus any contest file outside it.
const archiveRows = archiveJson as ArchiveRow[];
export const archive: Record<number, ArchiveRow> = Object.fromEntries(archiveRows.map((r) => [r.year, r]));
for (const c of Object.values(contests)) {
  if (!archive[c.year]) {
    const w = c.entries.find((e) => e.place === 1);
    archive[c.year] = { year: c.year, city: c.city, host: c.hostCode ?? '', winner: w?.country, artist: w?.artist, song: w?.song };
  }
}

export const allYears = Object.keys(archive).map(Number).sort((a, b) => b - a);
export const latestFullYear = Math.max(...Object.keys(contests).map(Number));

// Country pages: /country/{slug}/ for every country with an entry or win on file.
export const countryList = countryCodes(contests, archive, countries).map((code) => ({ code, name: countries[code], slug: slugify(countries[code]) }));
export const countryHref = (code: string) => (countryList.some((c) => c.code === code) ? `/country/${slugify(countries[code])}/` : null);
