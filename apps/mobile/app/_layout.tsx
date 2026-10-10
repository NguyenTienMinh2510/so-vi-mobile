import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from '../src/store';
import { Button, Card, Page, colors, styles } from '../src/ui';

function Root() {
  const store = useStore();
  if (store.error) return <Page title="Không mở được Sổ Ví"><Card><Text accessibilityRole="alert" style={styles.error}>{store.error}</Text><Text style={styles.text}>Dữ liệu được giữ nguyên. Thử mở lại. Nếu lỗi tiếp diễn, giữ ứng dụng và file backup; không gỡ Expo Go hoặc xóa dữ liệu.</Text><Button title="Thử lại" onPress={store.retry} /></Card></Page>;
  if (!store.loaded) return <Page title="Sổ Ví"><View style={styles.content}><ActivityIndicator color={colors.accent} accessibilityLabel="Đang mở dữ liệu" /><Text style={styles.secondary}>Đang mở dữ liệu trên điện thoại…</Text></View></Page>;
  return <><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'none' }} />{store.notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{store.notice}</Text> : null}</>;
}
export default function Layout() { return <SafeAreaProvider><StoreProvider><StatusBar style="light" /><Root /></StoreProvider></SafeAreaProvider>; }
