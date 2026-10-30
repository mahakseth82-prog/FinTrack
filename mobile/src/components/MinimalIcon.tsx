import React from 'react';
import { View, StyleSheet, Text } from 'react-native';

export type MinimalIconName =
  | 'home'
  | 'transactions'
  | 'insights'
  | 'ledger'
  | 'profile'
  | 'mic'
  | 'camera'
  | 'arrow-left'
  | 'trash'
  | 'edit'
  | 'search'
  | 'close'
  | 'chevron-left'
  | 'chevron-right'
  | 'food'
  | 'shopping'
  | 'travel'
  | 'grocery'
  | 'bills'
  | 'plus'
  | 'calendar';

interface MinimalIconProps {
  name: MinimalIconName | string;
  size?: number;
  color?: string;
}

/**
 * Pure React Native geometric minimalist line icons (Feather/Lucide aesthetic).
 * Zero external font/TTF dependencies — guaranteed 100% reliable on Web and Native.
 */
export const MinimalIcon: React.FC<MinimalIconProps> = ({
  name,
  size = 18,
  color = '#0F172A',
}) => {
  if (name === 'home') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
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

  if (name === 'transactions') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <View
          style={{
            width: size * 0.72,
            height: size * 0.84,
            borderRadius: 2,
            borderWidth: 1.8,
            borderColor: color,
            paddingHorizontal: 2,
            justifyContent: 'space-evenly',
            alignItems: 'center',
          }}
        >
          <View style={{ width: size * 0.44, height: 1.6, backgroundColor: color }} />
          <View style={{ width: size * 0.44, height: 1.6, backgroundColor: color }} />
          <View style={{ width: size * 0.28, height: 1.6, backgroundColor: color, alignSelf: 'flex-start', marginLeft: 2 }} />
        </View>
      </View>
    );
  }

  if (name === 'insights') {
    return (
      <View style={[styles.box, { width: size, height: size, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 }]}>
        <View style={{ width: size * 0.2, height: size * 0.45, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ width: size * 0.2, height: size * 0.8, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ width: size * 0.2, height: size * 0.6, backgroundColor: color, borderRadius: 1 }} />
      </View>
    );
  }

  if (name === 'ledger') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <View
          style={{
            width: size * 0.74,
            height: size * 0.84,
            borderRadius: 3,
            borderWidth: 1.8,
            borderColor: color,
            justifyContent: 'space-evenly',
            alignItems: 'center',
            paddingVertical: 2,
          }}
        >
          <View style={{ width: size * 0.42, height: 1.6, backgroundColor: color }} />
          <View style={{ width: size * 0.42, height: 1.6, backgroundColor: color }} />
        </View>
      </View>
    );
  }

  if (name === 'profile') {
    return (
      <View style={[styles.box, { width: size, height: size, alignItems: 'center' }]}>
        {/* Head */}
        <View
          style={{
            width: size * 0.4,
            height: size * 0.4,
            borderRadius: size * 0.2,
            borderWidth: 1.8,
            borderColor: color,
            marginBottom: 1,
          }}
        />
        {/* Torso */}
        <View
          style={{
            width: size * 0.7,
            height: size * 0.35,
            borderTopLeftRadius: size * 0.35,
            borderTopRightRadius: size * 0.35,
            borderWidth: 1.8,
            borderBottomWidth: 0,
            borderColor: color,
          }}
        />
      </View>
    );
  }

  if (name === 'mic') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <View
          style={{
            width: size * 0.36,
            height: size * 0.56,
            borderRadius: size * 0.18,
            borderWidth: 1.8,
            borderColor: color,
          }}
        />
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

  if (name === 'trash') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        {/* Lid */}
        <View style={{ width: size * 0.75, height: 1.6, backgroundColor: color, marginBottom: 1 }} />
        {/* Can */}
        <View
          style={{
            width: size * 0.58,
            height: size * 0.64,
            borderWidth: 1.6,
            borderTopWidth: 0,
            borderColor: color,
            borderBottomLeftRadius: 2,
            borderBottomRightRadius: 2,
            justifyContent: 'space-evenly',
            flexDirection: 'row',
            paddingVertical: 1,
          }}
        >
          <View style={{ width: 1.2, height: size * 0.45, backgroundColor: color }} />
          <View style={{ width: 1.2, height: size * 0.45, backgroundColor: color }} />
        </View>
      </View>
    );
  }

  if (name === 'edit') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <View
          style={{
            width: size * 0.68,
            height: size * 0.22,
            borderWidth: 1.6,
            borderColor: color,
            transform: [{ rotate: '-45deg' }],
            borderRadius: 1,
          }}
        />
      </View>
    );
  }

  if (name === 'search') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <View
          style={{
            width: size * 0.58,
            height: size * 0.58,
            borderRadius: size * 0.29,
            borderWidth: 1.8,
            borderColor: color,
            marginTop: -size * 0.15,
            marginLeft: -size * 0.15,
          }}
        />
        <View
          style={{
            width: 2,
            height: size * 0.35,
            backgroundColor: color,
            transform: [{ rotate: '-45deg' }],
            position: 'absolute',
            bottom: size * 0.12,
            right: size * 0.15,
          }}
        />
      </View>
    );
  }

  if (name === 'close') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <View
          style={{
            width: size * 0.75,
            height: 1.8,
            backgroundColor: color,
            transform: [{ rotate: '45deg' }],
            position: 'absolute',
          }}
        />
        <View
          style={{
            width: size * 0.75,
            height: 1.8,
            backgroundColor: color,
            transform: [{ rotate: '-45deg' }],
            position: 'absolute',
          }}
        />
      </View>
    );
  }

  if (name === 'chevron-left') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <View
          style={{
            width: size * 0.45,
            height: size * 0.45,
            borderLeftWidth: 2,
            borderBottomWidth: 2,
            borderColor: color,
            transform: [{ rotate: '45deg' }],
            marginLeft: size * 0.15,
          }}
        />
      </View>
    );
  }

  if (name === 'chevron-right') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <View
          style={{
            width: size * 0.45,
            height: size * 0.45,
            borderRightWidth: 2,
            borderTopWidth: 2,
            borderColor: color,
            transform: [{ rotate: '45deg' }],
            marginRight: size * 0.15,
          }}
        />
      </View>
    );
  }

  if (name === 'food') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <View
          style={{
            width: size * 0.65,
            height: size * 0.55,
            borderWidth: 1.6,
            borderColor: color,
            borderBottomLeftRadius: size * 0.3,
            borderBottomRightRadius: size * 0.3,
          }}
        />
        <View style={{ width: size * 0.5, height: 1.6, backgroundColor: color, marginTop: 1 }} />
      </View>
    );
  }

  if (name === 'shopping') {
    return (
      <View style={[styles.box, { width: size, height: size, alignItems: 'center' }]}>
        <View
          style={{
            width: size * 0.36,
            height: size * 0.28,
            borderWidth: 1.5,
            borderBottomWidth: 0,
            borderColor: color,
            borderTopLeftRadius: size * 0.18,
            borderTopRightRadius: size * 0.18,
            marginBottom: -1,
          }}
        />
        <View
          style={{
            width: size * 0.72,
            height: size * 0.58,
            borderRadius: 2,
            borderWidth: 1.6,
            borderColor: color,
          }}
        />
      </View>
    );
  }

  if (name === 'travel') {
    return (
      <View style={[styles.box, { width: size, height: size, alignItems: 'center' }]}>
        <View
          style={{
            width: size * 0.74,
            height: size * 0.48,
            borderWidth: 1.6,
            borderColor: color,
            borderRadius: 3,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <View style={{ width: size * 0.4, height: 1.4, backgroundColor: color }} />
        </View>
        <View style={{ flexDirection: 'row', width: size * 0.6, justifyContent: 'space-between', marginTop: 1 }}>
          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
        </View>
      </View>
    );
  }

  if (name === 'grocery') {
    return (
      <View style={[styles.box, { width: size, height: size, alignItems: 'center' }]}>
        <View
          style={{
            width: size * 0.78,
            height: size * 0.48,
            borderWidth: 1.6,
            borderColor: color,
            borderBottomLeftRadius: 4,
            borderBottomRightRadius: 4,
          }}
        />
      </View>
    );
  }

  if (name === 'bills') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
        <View
          style={{
            width: size * 0.65,
            height: size * 0.8,
            borderWidth: 1.6,
            borderColor: color,
            borderRadius: 2,
            justifyContent: 'space-around',
            paddingVertical: 2,
            alignItems: 'center',
          }}
        >
          <View style={{ width: size * 0.38, height: 1.4, backgroundColor: color }} />
          <View style={{ width: size * 0.38, height: 1.4, backgroundColor: color }} />
        </View>
      </View>
    );
  }

  if (name === 'camera') {
    return (
      <View style={[styles.box, { width: size, height: size }]}>
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

  // 'arrow-left' default
  return (
    <View style={[styles.box, { width: size, height: size, flexDirection: 'row' }]}>
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
