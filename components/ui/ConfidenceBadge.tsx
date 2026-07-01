export function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: { bg: '#22c55e22', color: '#22c55e', border: '#22c55e44', label: 'High' },
    medium: { bg: '#f59e0b22', color: '#f59e0b', border: '#f59e0b44', label: 'Medium' },
    low: { bg: '#ef444422', color: '#ef4444', border: '#ef444444', label: 'Low' },
  }
  const s = styles[confidence] || styles.high
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {s.label}
    </span>
  )
}
