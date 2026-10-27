// Content model. These shapes are what lives in content/*.json and what the CMS publishes.

export type Status = '' | 'A' | 'SF1' | 'SF2' | 'SF' | 'DQ';

export type Video = { live?: string; liveTitle?: string; mv?: string; mvTitle?: string };

export type Entry = {
  country: string; // "bg", "gb", "yu" (Yugoslavia), "cs" (Serbia & Montenegro)
  artist: string;
  song: string;
  place: number | null; // final placing; null = didn't reach the final
  jury: number | null; // null for years without a published split (pre-2016)
  televote: number | null;
  total: number | null;
  oddsRank: number | null;
  odds?: string;
  status: Status; // A = auto-qualified (Big 5 + host)
  runningOrder: number | null;
  semiPlace?: number | null;
  semiPoints?: number | null;
  video?: Video;
};

export type Contest = {
  year: number;
  city: string;
  host: string;
  hostCode?: string;
  venue?: string;
  date?: string;
  edition?: number;
  note?: string;
  source?: 'bundled' | 'Wikipedia';
  sourced?: boolean; // odds are from a named bookmaker snapshot
  importedAt?: string;
  entries: Entry[];
};

export type ArchiveRow = {
  year: number;
  city: string;
  host: string; // country code
  winner?: string;
  artist?: string;
  song?: string;
  note?: string;
};

export type Upcoming = {
  year: number;
  edition: number;
  city: string;
  host: string;
  hostCode: string;
  venue: string;
  village: string;
  finalISO: string;
  finalDateLabel: string;
  kicker: string;
  blurb: string;
  shows: { name: string; date: string }[];
  intending: number;
  debut: string[];
  returning: string[];
  leaving: string[];
};

export type Countries = Record<string, string>;
