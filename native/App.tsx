import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, StatusBar, ScrollView } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import RoadMap from "./src/RoadMap";
import { C, STAGES } from "./src/theme";

const TABS = ["Command", "Warehouse", "Scouter", "Channels", "Collection", "Settings"];

export default function App() {
  const [arranging, setArranging] = useState(false);
  const [tab, setTab] = useState("Command");

  const live = STAGES.reduce((a, s) => a + s.count, 0);
  const worth = STAGES.reduce((a, s) => a + s.value, 0);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={s.root} edges={["top", "bottom"]}>

          <View style={s.header}>
            <Text style={s.brand}>CornDogSmuggler</Text>
            <View style={s.headerRight}>
              <View style={s.pulse} />
              <Text style={s.sync}>Sync</Text>
            </View>
          </View>

          <View style={s.statRow}>
            <Stat label="On the map" value={String(live)} />
            <Stat label="Worth" value={"$" + worth.toFixed(2)} />
            <Stat label="Needs you" value={String(STAGES[1].count)} accent />
          </View>

          <View style={s.toolRow}>
            <Pressable
              onPress={() => { setArranging((v) => !v); Haptics.selectionAsync(); }}
              style={({ pressed }) => [s.btn, arranging && s.btnOn, pressed && s.btnPressed]}>
              <Text style={[s.btnTxt, arranging && s.btnTxtOn]}>
                {arranging ? "Done arranging" : "Arrange map"}
              </Text>
            </Pressable>
            {arranging && <Text style={s.hint}>Hold a stop, drag it anywhere</Text>}
          </View>

          <View style={s.board}>
            <RoadMap arranging={arranging} />
          </View>

          <View style={s.tabs}>
            {TABS.map((t) => (
              <Pressable key={t} onPress={() => { setTab(t); Haptics.selectionAsync(); }} style={s.tab}>
                <View style={[s.tabDot, tab === t && s.tabDotOn]} />
                <Text style={[s.tabTxt, tab === t && s.tabTxtOn]}>{t}</Text>
              </Pressable>
            ))}
          </View>

        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, accent && { color: C.amber }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 4, paddingBottom: 10 },
  brand: { color: C.mint, fontSize: 17, fontWeight: "800", letterSpacing: 0.3 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green, shadowColor: C.green, shadowOpacity: 1, shadowRadius: 8 },
  sync: { color: C.dim, fontSize: 13, fontWeight: "600" },

  statRow: { flexDirection: "row", paddingHorizontal: 14, gap: 10, marginBottom: 10 },
  stat: { flex: 1, backgroundColor: C.bgLift, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  statLabel: { color: C.faint, fontSize: 11, fontWeight: "600", marginBottom: 2 },
  statValue: { color: C.ink, fontSize: 18, fontWeight: "800" },

  toolRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, marginBottom: 2 },
  btn: { backgroundColor: "rgba(144,255,204,0.1)", borderColor: "rgba(144,255,204,0.3)", borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  btnOn: { backgroundColor: C.mint, borderColor: C.mint },
  btnPressed: { opacity: 0.7 },
  btnTxt: { color: C.mint, fontSize: 13, fontWeight: "700" },
  btnTxtOn: { color: "#06110C" },
  hint: { color: C.faint, fontSize: 12, flexShrink: 1 },

  board: { flex: 1 },

  tabs: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10, paddingTop: 8, borderTopColor: "rgba(144,255,204,0.12)", borderTopWidth: 1 },
  tab: { alignItems: "center", flex: 1, gap: 3 },
  tabDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "transparent" },
  tabDotOn: { backgroundColor: C.green },
  tabTxt: { color: C.faint, fontSize: 10, fontWeight: "600" },
  tabTxtOn: { color: C.mint },
});
