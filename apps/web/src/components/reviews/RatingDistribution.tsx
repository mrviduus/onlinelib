interface Props {
  distribution: { star5: number; star4: number; star3: number; star2: number; star1: number }
  totalRatings: number
}

export function RatingDistribution({ distribution, totalRatings }: Props) {
  if (totalRatings === 0) return null

  const bars = [
    { star: 5, count: distribution.star5 },
    { star: 4, count: distribution.star4 },
    { star: 3, count: distribution.star3 },
    { star: 2, count: distribution.star2 },
    { star: 1, count: distribution.star1 },
  ]

  return (
    <div className="rating-dist">
      {bars.map(({ star, count }) => {
        const pct = totalRatings > 0 ? Math.round((count / totalRatings) * 100) : 0
        return (
          <div key={star} className="rating-dist__row">
            <span className="rating-dist__label">{star}</span>
            <div className="rating-dist__bar">
              <div className="rating-dist__fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="rating-dist__pct">{pct}%</span>
          </div>
        )
      })}
    </div>
  )
}
