export function inspectYue2Input(style: string, lyrics?: string, instrumental?: boolean): {
  valid: boolean;
  message: string;
  lyricsLength: number;
  styleLength: number;
  lyricsLimit: 2000;
  styleLimit: 1000;
};
