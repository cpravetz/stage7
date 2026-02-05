export interface LyricSection {
  id: string;
  type: 'Verse' | 'Chorus' | 'Bridge' | 'Pre-Chorus' | 'Outro' | 'Intro';
  content: string;
}

export interface SongStructure {
  id: string;
  name: string;
  sections: LyricSection['type'][];
}
