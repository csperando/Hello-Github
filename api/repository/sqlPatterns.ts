/** A user-typed search term as an ILIKE "contains" pattern - its own % _ \ match literally. */
export function toContainsPattern(term: string): string {
    return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
