/** Turns a stored value like "medium" or "in review" into "Medium" / "In review" for display. */
export const sentenceCase = (value: string) => value ? value[0].toUpperCase() + value.slice(1) : value
