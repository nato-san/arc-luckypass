/**
 * DateTimePicker — timezone-aware datetime-local input for LuckyPass CreateLotForm.
 *
 * The `timezone` prop is CONTROLLED by the parent (JST | UTC).
 * The `value` prop is a Unix timestamp in seconds (or null).
 * Switching timezone only changes the displayed local time; the stored Unix
 * seconds remain unchanged.
 */

interface DateTimePickerProps {
  /** Field label shown above the input */
  label: string
  /** Optional hint text shown below the label */
  hint?: string
  /** Shows * if true */
  required?: boolean
  /** Unix timestamp in seconds, or null if empty */
  value: number | null
  onChange: (unix: number | null) => void
  /** Controlled from parent — this component does NOT own the toggle */
  timezone: 'JST' | 'UTC'
  /** Optional minimum allowed value (unix seconds) */
  minUnix?: number
  /** Optional placeholder for the datetime-local input */
  placeholder?: string
}

// ─── Conversion helpers ────────────────────────────────────────────────────

/**
 * Parse a datetime-local string (e.g. "2026-10-28T23:59") typed in `tz` as the
 * local timezone and return the corresponding Unix timestamp in seconds.
 *
 * Strategy:
 *   Appending 'Z' makes `new Date()` interpret the string as UTC.
 *   If the user meant JST (UTC+9), we subtract the 9-hour offset to arrive at
 *   the true UTC instant.
 *
 *   Example: user types "2026-10-28T23:59" with timezone = "JST"
 *     → parsedAsUtcMs = Date("2026-10-28T23:59Z") → 23:59 UTC in ms
 *     → actualUtcMs   = 23:59 UTC − 9h = 14:59 UTC in ms  ✓
 */
function localStringToUnix(str: string, tz: 'JST' | 'UTC'): number | null {
  if (!str) return null
  const offsetSeconds = tz === 'JST' ? 9 * 3600 : 0
  const parsedAsUtcMs = new Date(str + 'Z').getTime() // treats string as UTC
  const actualUtcMs = parsedAsUtcMs - offsetSeconds * 1000 // shift to real UTC
  if (isNaN(actualUtcMs)) return null
  return Math.floor(actualUtcMs / 1000)
}

/**
 * Format a Unix timestamp (seconds) as a datetime-local string in `tz`.
 *
 * Strategy:
 *   Add the timezone offset to the UTC epoch ms so that d.getUTCxxx() methods
 *   return the "local" clock values for that timezone.
 *
 *   Example: unix = 1761695940 (14:59 UTC on 2026-10-28)
 *     With tz = "JST":  d represents 14:59 + 9h = 23:59 local  → "2026-10-28T23:59" ✓
 *     With tz = "UTC":  d represents 14:59 UTC                  → "2026-10-28T14:59" ✓
 */
function unixToLocalString(unix: number, tz: 'JST' | 'UTC'): string {
  const offsetMs = tz === 'JST' ? 9 * 60 * 60 * 1000 : 0
  const d = new Date(unix * 1000 + offsetMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  )
}

/** Format a Unix timestamp as a human-readable datetime string in `tz`. */
function unixToPreviewString(unix: number, tz: 'JST' | 'UTC'): string {
  const offsetMs = tz === 'JST' ? 9 * 60 * 60 * 1000 : 0
  const d = new Date(unix * 1000 + offsetMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  )
}

// ─── Component ────────────────────────────────────────────────────────────

export function DateTimePicker({
  label,
  hint,
  required,
  value,
  onChange,
  timezone,
  minUnix,
  placeholder,
}: DateTimePickerProps) {
  // Derive the displayed string directly from the controlled value + timezone.
  // When the parent switches timezone, this re-derives automatically — no extra
  // state or effect needed.
  const inputValue = value !== null ? unixToLocalString(value, timezone) : ''

  // Compute the min attribute in the current timezone so the browser enforces it.
  const minValue =
    minUnix !== undefined ? unixToLocalString(minUnix, timezone) : undefined

  // Preview: show the same instant in the OTHER timezone.
  const otherTz: 'JST' | 'UTC' = timezone === 'JST' ? 'UTC' : 'JST'
  const previewLabel = value !== null ? `${otherTz}: ${unixToPreviewString(value, otherTz)}` : null

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const unix = localStringToUnix(e.target.value, timezone)
    onChange(unix)
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Label row */}
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && (
          <span className="ml-1 text-red-500" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {/* Hint */}
      {hint && (
        <p className="text-xs text-gray-400">{hint}</p>
      )}

      {/* datetime-local input */}
      <input
        type="datetime-local"
        value={inputValue}
        min={minValue}
        placeholder={placeholder}
        onChange={handleChange}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      />

      {/* Cross-timezone preview */}
      {previewLabel && (
        <p className="text-xs text-gray-400 mt-1">{previewLabel}</p>
      )}
    </div>
  )
}
