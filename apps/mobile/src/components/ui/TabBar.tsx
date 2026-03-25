import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../context/ThemeContext'
import { fonts } from '../../theme/typography'

interface TabOption {
  key: string
  label: string
}

interface TabBarProps {
  tabs: TabOption[]
  activeTab: string
  onTabChange: (key: string) => void
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  const { colors } = useTheme()
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.key
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => onTabChange(tab.key)}
          >
            <Text style={[styles.label, { color: isActive ? colors.primary : colors.textSecondary }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  label: { fontFamily: fonts.sansMedium, fontSize: 13 },
})
