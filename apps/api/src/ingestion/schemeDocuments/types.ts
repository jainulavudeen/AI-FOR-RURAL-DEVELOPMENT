export interface CorpusSection {
  section: string
  text: string
}

export interface CorpusDocument {
  schemeId: string
  title: string
  sourceUrl: string
  sourceDescription: string
  vintageLabel: string
  sections: CorpusSection[]
}
