import { useState, useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'

interface ReaderStatsWidgetProps {
  sessionStartedAt: number
  todaySeconds: number
  dailyGoalMinutes: number | null
}

export function ReaderStatsWidget({ sessionStartedAt, todaySeconds, dailyGoalMinutes }: ReaderStatsWidgetProps) {
  const { colors } = useTheme()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - sessionStartedAt) / 1000))
    }, 10_000)
    return () => clearInterval(interval)
  }, [sessionStartedAt])

  const sessionMin = Math.floor(elapsed / 60)
  const totalTodayMin = Math.floor(todaySeconds / 60) + sessionMin

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
        <Text style={[styles.text, { color: colors.textSecondary }]}>{sessionMin}m</Text>
      </View>
      {dailyGoalMinutes != null && (
        <>
          <Text style={[styles.dot, { color: colors.textSecondary }]}>·</Text>
          <View style={styles.goalRow}>
            {[0, 1, 2, 3].map(i => {
              const threshold = (dailyGoalMinutes / 4) * (i + 1)
              return (
                <View
                  key={i}
                  style={[
                    styles.goalDot,
                    { backgroundColor: colors.border },
                    totalTodayMin >= threshold && { backgroundColor: colors.primary },
                  ]}
                />
              )
            })}
            <Text style={[styles.text, { color: colors.textSecondary }]}> {totalTodayMin}/{dailyGoalMinutes}m</Text>
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 6,
  },
  text: { fontSize: 11 },
  dot: { fontSize: 11 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  goalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
})
