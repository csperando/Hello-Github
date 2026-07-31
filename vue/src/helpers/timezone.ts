/**
 * Every IANA timezone name the runtime knows about, as BaseSelect options.
 * Intl.supportedValuesOf('timeZone') omits the plain 'UTC' alias even
 * though Intl.DateTimeFormat().resolvedOptions().timeZone can report it as
 * the detected default (e.g. in a container with no TZ set) - without
 * adding it explicitly, a user whose detected zone is UTC would see a
 * blank select with no matching option.
 */
export function timezoneOptions(): { value: string; label: string }[] {
  const zones = Intl.supportedValuesOf('timeZone')
  const withUTC = zones.includes('UTC') ? zones : ['UTC', ...zones]
  return withUTC.map((tz) => ({ value: tz, label: tz.replace(/_/g, ' ') }))
}

/** The browser/runtime's own detected timezone, as a sensible default. */
export function detectTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
