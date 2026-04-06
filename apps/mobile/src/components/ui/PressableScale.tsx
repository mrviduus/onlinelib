import { useRef, type ReactNode } from 'react'
import { Pressable, Animated, type ViewStyle, type StyleProp } from 'react-native'

interface PressableScaleProps {
  onPress?: () => void
  style?: StyleProp<ViewStyle>
  children: ReactNode
  disabled?: boolean
}

export function PressableScale({ onPress, style, children, disabled }: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, tension: 100, friction: 8 }).start()
  }

  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start()
  }

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} disabled={disabled}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  )
}
