import { useFonts } from 'expo-font'

export function useAppFonts() {
  return useFonts({
    'CrimsonPro-Regular': require('../../assets/fonts/CrimsonPro-Regular.ttf'),
    'CrimsonPro-SemiBold': require('../../assets/fonts/CrimsonPro-SemiBold.ttf'),
    'CrimsonPro-Italic': require('../../assets/fonts/CrimsonPro-Italic.ttf'),
    'Inter-Regular': require('../../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('../../assets/fonts/Inter-SemiBold.ttf'),
  })
}
