/**
 * Topographic contour lines — signature texture for hero cards.
 * Renders as an absolute-positioned SVG behind content.
 */
export function TopoContours({
  opacity = 0.06,
  color = 'currentColor',
}: {
  opacity?: number
  color?: string
}) {
  return (
    <svg
      viewBox="0 0 400 220"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity }}
      aria-hidden="true"
    >
      <g fill="none" stroke={color} strokeWidth="0.7" strokeLinecap="round">
        <path d="M-20,200 C 60,180 140,210 220,185 C 280,166 350,200 420,178" />
        <path d="M-20,170 C 70,148 140,178 220,150 C 290,128 360,165 420,140" />
        <path d="M-20,138 C 80,116 150,148 230,118 C 300,92  370,128 420,104" />
        <path d="M-20,108 C 90,86  160,118 240,86  C 310,58  380,94  420,70" />
        <path d="M-20,80  C 100,58 170,90  250,58  C 320,34  390,68  420,44" />
        <path d="M-20,54  C 110,34 180,64  260,34  C 330,10  400,44  420,22" />
        <path d="M-20,30  C 120,12 190,40  270,12" strokeDasharray="2,3" opacity="0.5" />
      </g>
    </svg>
  )
}
