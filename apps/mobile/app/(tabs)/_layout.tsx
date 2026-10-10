import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { useLedger } from '../../src/store';
import { colors, Icon } from '../../src/ui';
export default function Layout() {
  const { ledger } = useLedger(); if (!ledger.settings.onboarded) return <Redirect href="/onboarding" />;
  return <Tabs screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border }, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.secondary, tabBarLabelStyle: { fontSize: 12 }, animation: 'none' }}>
    <Tabs.Screen name="index" options={{ title: 'Giao dịch', tabBarIcon: ({ color }) => <Icon name="list" color={color} /> }} />
    <Tabs.Screen name="wallets" options={{ title: 'Ví', tabBarIcon: ({ color }) => <Icon name="wallet" color={color} /> }} />
    <Tabs.Screen name="budgets" options={{ title: 'Ngân sách', tabBarIcon: ({ color }) => <Icon name="pie-chart" color={color} /> }} />
    <Tabs.Screen name="activities" options={{ title: 'Hoạt động', tabBarIcon: ({ color }) => <Icon name="notifications" color={color} /> }} />
    <Tabs.Screen name="more" options={{ title: 'Thêm', tabBarIcon: ({ color }) => <Icon name="menu" color={color} /> }} />
  </Tabs>;
}
