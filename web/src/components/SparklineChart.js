'use client';

export default function SparklineChart({ data, width = 80, height = 24 }) {
  if (!data || !data.data || data.data.length === 0) return null;

  const values = data.data.filter(v => v !== null);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const padding = 2;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((v - min) / range) * chartHeight;
    return `${x},${y}`;
  }).join(' ');

  const isUptrend = values[values.length - 1] >= values[0];
  const color = isUptrend ? '#4caf50' : '#f44336';
  const changePercent = ((values[values.length - 1] - values[0]) / (values[0] || 1) * 100).toFixed(1);
  const trendLabel = `${isUptrend ? '+' : ''}${changePercent}% over ${values.length} data points`;

  return (
    <svg
      width={width}
      height={height}
      className="inline-block"
      role="img"
      aria-label={trendLabel}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="motion-safe:animate-none"
      />
    </svg>
  );
}
