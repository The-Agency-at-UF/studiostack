export const previewPeople = [
 {id:'preview-admin',displayName:'Taylor (Owner)'},
 {id:'preview-author',displayName:'Alex (Client Services)'},
 {id:'preview-reviewer',displayName:'Jordan (Production leadership)'},
 {id:'preview-executive',displayName:'Sam (Executive Leadership Team)'},
]
export const defaultPreviewPerson='preview-admin'

const legacyPreviewNames = new Map(previewPeople.map(({displayName}) => [
  displayName.replace(/ \((.+)\)$/, ' \u00b7 $1'),
  displayName,
]))

export function normalizePreviewName(name: string): string {
  return legacyPreviewNames.get(name) ?? name
}
