/** Integer cents as dollars: 2550 -> "$25.50". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Typed dollars as integer cents: "25", "$25.5", "25.50" -> 2550. Null for
 * anything that isn't a non-negative amount with at most two decimals.
 */
export function parseDollarsToCents(text: string): number | null {
  const cleaned = text.trim().replace(/^\$/, '').replace(/,/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  const [whole, fraction = ''] = cleaned.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

/** An ISO timestamp or date as "Oct 14, 2026" (UTC, so a stored date never shifts a day). */
export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
