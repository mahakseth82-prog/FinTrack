import React from 'react';
import { View, StyleSheet } from 'react-native';

export type MinimalIconName =
  | 'home'
  | 'mic'
  | 'ledger'
  | 'camera'
  | 'arrow-left';

interface MinimalIconProps {
  name: MinimalIconName;
  size?: number;
  color?: string;
}

/**
 * Pure React Native geometric minimalist line icons (Feather/Lucide aesthetic).
 * Zero external font/TTF dependencies — guaranteed never to fail on Web or Native.
 */
export const MinimalIcon: React.FC<MinimalIconProps> = ({
  name,
  size = 18,
  color = '#0F172A',
}) => {
  if (name === 'home') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        {/* Roof triangle */}
        <View
          style={{
            width: size * 0.58,
            height: size * 0.58,
            borderTopWidth: 1.8,
            borderLeftWidth: 1.8,
            borderColor: color,
            transform: [{ rotate: '45deg' }],
            marginBottom: -size * 0.28,
          }}
        />
        {/* House body */}
        <View
          style={{
            width: size * 0.68,
            height: size * 0.52,
            borderWidth: 1.8,
            borderTopWidth: 0,
            borderColor: color,
            borderBottomLeftRadius: 2,
            borderBottomRightRadius: 2,
          }}
        />
      </View>
    );
  }

  if (name === 'mic') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        {/* Capsule */}
        <View
          style={{
            width: size * 0.36,
            height: size * 0.56,
            borderRadius: size * 0.18,
            borderWidth: 1.8,
            borderColor: color,
          }}
        />
        {/* U-cradle */}
        <View
          style={{
            width: size * 0.64,
            height: size * 0.34,
            borderBottomLeftRadius: size * 0.32,
            borderBottomRightRadius: size * 0.32,
            borderWidth: 1.8,
            borderTopWidth: 0,
            borderColor: color,
            marginTop: -size * 0.18,
          }}
        />
        {/* Stand */}
        <View
          style={{
            width: 1.8,
            height: size * 0.18,
            backgroundColor: color,
          }}
        />
      </View>
    );
  }

  if (name === 'ledger') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <View
          style={{
            width: size * 0.72,
            height: size * 0.82,
            borderRadius: 2.5,
            borderWidth: 1.8,
            borderColor: color,
            justifyContent: 'space-evenly',
            alignItems: 'center',
            paddingVertical: 2,
          }}
        >
          <View
            style={{
              width: size * 0.4,
              height: 1.6,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              width: size * 0.4,
              height: 1.6,
              backgroundColor: color,
            }}
          />
        </View>
      </View>
    );
  }

  if (name === 'camera') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        {/* Top shutter tab */}
        <View
          style={{
            width: size * 0.36,
            height: 2.2,
            backgroundColor: color,
            borderTopLeftRadius: 1,
            borderTopRightRadius: 1,
            marginBottom: 1,
          }}
        />
        {/* Camera body */}
        <View
          style={{
            width: size * 0.86,
            height: size * 0.64,
            borderRadius: 3,
            borderWidth: 1.6,
            borderColor: color,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Lens circle */}
          <View
            style={{
              width: size * 0.32,
              height: size * 0.32,
              borderRadius: size * 0.16,
              borderWidth: 1.5,
              borderColor: color,
            }}
          />
        </View>
      </View>
    );
  }

  // 'arrow-left'
  return (
    <View
      style={[
        styles.box,
        { width: size, height: size, flexDirection: 'row' },
      ]}
    >
      <View
        style={{
          width: size * 0.38,
          height: size * 0.38,
          borderLeftWidth: 1.8,
          borderBottomWidth: 1.8,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
          marginRight: -size * 0.28,
        }}
      />
      <View
        style={{
          width: size * 0.65,
          height: 1.8,
          backgroundColor: color,
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

