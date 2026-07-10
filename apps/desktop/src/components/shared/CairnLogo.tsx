/**
 * Cairn brand mark — three stacked stones with an oxblood summit.
 * Nvexis "The Almanac": flat, two inks on paper. No glow, no neon.
 * Stones are drawn in the current ink colour; the summit stone is oxblood.
 */
export function CairnLogo({ size = 28, animated = true }: { size?: number; animated?: boolean }) {
  // `animated` kept for API compatibility; the Almanac mark is intentionally still.
  void animated

  const stoneFill = 'hsl(var(--ink) / 0.14)'
  const stoneStroke = 'hsl(var(--ink) / 0.42)'
  const summit = 'hsl(var(--ox))'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible' }}
      aria-hidden="true"
    >
      {/* Bottom stone — wide, low */}
      <ellipse
        cx="16"
        cy="25"
        rx="10"
        ry="3.2"
        fill={stoneFill}
        stroke={stoneStroke}
        strokeWidth="0.75"
      />
      {/* Mid-large stone */}
      <ellipse
        cx="14.5"
        cy="19"
        rx="7.5"
        ry="2.6"
        fill={stoneFill}
        stroke={stoneStroke}
        strokeWidth="0.75"
      />
      {/* Mid stone */}
      <ellipse
        cx="17"
        cy="13.5"
        rx="5.5"
        ry="2.1"
        fill={stoneFill}
        stroke={stoneStroke}
        strokeWidth="0.75"
      />
      {/* Summit stone — oxblood, the single accent */}
      <ellipse cx="15.5" cy="8.5" rx="3.6" ry="1.6" fill={summit} />
      {/* Summit cap — small oxblood point (the "vertex") */}
      <circle cx="15.5" cy="4.6" r="0.95" fill={summit} />
    </svg>
  )
}
