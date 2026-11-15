import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, useWindowDimensions, Pressable } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop as SvgStop, Circle } from "react-native-svg";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, runOnJS } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { C, STAGES, Stage } from "./theme";

/* Two columns, four rows. Eight stops, eight cells - so a drag is always a
   swap and two stops can never share a spot. The route runs left-right then
   right-left down the grid, which is a winding road by construction: it
   cannot tangle the way the web version did, where the path chased stops
   around a 3x3 grid in workflow order and crossed itself. */
const COLS = 2, ROWS = 4;

type Cell = { x: number; y: number };

function cells(w: number, h: number): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const col = r % 2 ? COLS - 1 - c : c;           // serpentine
      out.push({ x: (col + 0.5) * (w / COLS), y: (r + 0.5) * (h / ROWS) });
    }
  }
  return out;
}

/* Catmull-Rom through the stop centres, as a bezier. Smooth, no corners. */
function roadPath(pts: Cell[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const money = (n: number) => "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function Node({ s, step, size }: { s: Stage; step: number; size: number }) {
  const live = s.count > 0;
  const cardW = Math.min(64, size * 0.40), cardH = cardW * 1.36;
  return (
    <View style={st.node} pointerEvents="none">
      <View style={[st.cardWrap, { width: cardW, height: cardH }]}>
        {live ? (
          <>
            <View style={[st.card, st.cardBack2, { borderColor: s.color }]} />
            <View style={[st.card, st.cardBack1, { borderColor: s.color }]} />
            <View style={[st.card, { borderColor: s.color, shadowColor: s.color }]} />
            {s.count > 1 && (
              <View style={[st.more, { borderColor: s.color }]}>
                <Text style={[st.moreTxt, { color: s.color }]}>+{s.count - 1}</Text>
              </View>
            )}
          </>
        ) : (
          <View style={[st.empty, { borderColor: "rgba(232,255,244,0.18)" }]} />
        )}
      </View>

      <View style={[st.dot, { backgroundColor: s.color, shadowColor: s.color }]}>
        <View style={[st.dotRing, { borderColor: s.color }]} />
        <Text style={st.dotNum}>{step}</Text>
      </View>

      <Text style={[st.label, !live && st.labelDim]} numberOfLines={1}>{s.label}</Text>
      <View style={st.numsRow}>
        <Text style={[st.count, { color: s.color }, !live && st.dimmed]}>{s.count}</Text>
        <Text style={[st.value, !live && st.dimmed]}>{money(s.value)}</Text>
      </View>
    </View>
  );
}

export default function RoadMap({ arranging }: { arranging: boolean }) {
  const { width, height } = useWindowDimensions();
  const boardW = width;
  const boardH = Math.max(420, height - 230);           // fits the screen: no scrolling, ever
  const grid = useMemo(() => cells(boardW, boardH), [boardW, boardH]);
  const cellW = boardW / COLS, cellH = boardH / ROWS;

  /* slot[i] = which cell stage i currently sits in */
  const [slots, setSlots] = useState<number[]>(() => STAGES.map((_, i) => i));

  const swap = useCallback((a: number, b: number) => {
    setSlots((prev) => {
      if (a === b) return prev;
      const next = prev.slice();
      const ai = next.indexOf(a), bi = next.indexOf(b);
      if (ai < 0 || bi < 0) return prev;
      next[ai] = b; next[bi] = a;
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const pts = slots.map((cell) => grid[cell]);
  const d = roadPath(pts);

  return (
    <View style={{ width: boardW, height: boardH }}>
      <Svg width={boardW} height={boardH} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="road" x1="0" y1="0" x2="0" y2="1">
            <SvgStop offset="0" stopColor={C.greenDeep} />
            <SvgStop offset="0.55" stopColor={C.mint} />
            <SvgStop offset="1" stopColor={C.amber} />
          </LinearGradient>
        </Defs>
        {/* glow, then a dark casing, then the bright line. The casing is what
            makes a crossing read like a transit map instead of spaghetti. */}
        <Path d={d} stroke={C.green} strokeOpacity={0.1} strokeWidth={18} fill="none" strokeLinecap="round" />
        <Path d={d} stroke={C.roadCase} strokeWidth={9} fill="none" strokeLinecap="round" />
        <Path d={d} stroke="url(#road)" strokeWidth={3.5} fill="none" strokeLinecap="round" />
        {arranging && grid.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={Math.min(cellW, cellH) * 0.42}
            stroke="rgba(144,255,204,0.18)" strokeWidth={1} strokeDasharray="5 5" fill="none" />
        ))}
      </Svg>

      {STAGES.map((s, i) => (
        <DraggableStop key={s.id} stage={s} step={i + 1} cell={grid[slots[i]]} cellIndex={slots[i]}
          grid={grid} size={Math.min(cellW, cellH)} arranging={arranging} onSwap={swap} />
      ))}
    </View>
  );
}

function DraggableStop({ stage, step, cell, cellIndex, grid, size, arranging, onSwap }: {
  stage: Stage; step: number; cell: Cell; cellIndex: number; grid: Cell[];
  size: number; arranging: boolean; onSwap: (a: number, b: number) => void;
}) {
  const dx = useSharedValue(0), dy = useSharedValue(0), lift = useSharedValue(0);

  const buzz = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

  const pan = Gesture.Pan()
    .enabled(arranging)
    .activateAfterLongPress(140)
    .onStart(() => { lift.value = withSpring(1); runOnJS(buzz)(); })
    .onUpdate((e) => { dx.value = e.translationX; dy.value = e.translationY; })
    .onEnd(() => {
      const x = cell.x + dx.value, y = cell.y + dy.value;
      let best = cellIndex, bd = Infinity;
      for (let k = 0; k < grid.length; k++) {
        const g = grid[k], dist = (g.x - x) ** 2 + (g.y - y) ** 2;
        if (dist < bd) { bd = dist; best = k; }
      }
      dx.value = withSpring(0, { damping: 18 });
      dy.value = withSpring(0, { damping: 18 });
      lift.value = withTiming(0, { duration: 160 });
      if (best !== cellIndex) runOnJS(onSwap)(cellIndex, best);
    });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: dx.value },
      { translateY: dy.value },
      { scale: 1 + lift.value * 0.06 },
    ],
    zIndex: lift.value > 0 ? 20 : 1,
    shadowOpacity: lift.value * 0.6,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[
        st.slot,
        { left: cell.x - size / 2, top: cell.y - size / 2, width: size, height: size, shadowColor: "#000", shadowRadius: 20, shadowOffset: { width: 0, height: 12 } },
        style,
      ]}>
        <Node s={stage} step={step} size={size} />
      </Animated.View>
    </GestureDetector>
  );
}

const st = StyleSheet.create({
  slot: { position: "absolute", alignItems: "center", justifyContent: "center" },
  node: { alignItems: "center", justifyContent: "center" },
  cardWrap: { alignItems: "center", justifyContent: "center", marginBottom: 6 },
  card: {
    position: "absolute", width: "100%", height: "100%", borderRadius: 10, borderWidth: 1,
    backgroundColor: "#13201A", shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
  },
  cardBack1: { transform: [{ translateX: 4 }, { translateY: -4 }, { rotate: "2.5deg" }], opacity: 0.65 },
  cardBack2: { transform: [{ translateX: 8 }, { translateY: -8 }, { rotate: "5deg" }], opacity: 0.4 },
  empty: { width: "72%", height: "72%", borderRadius: 10, borderWidth: 1, borderStyle: "dashed" },
  more: {
    position: "absolute", top: -8, right: -10, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 999, borderWidth: 1, backgroundColor: "#07110D",
  },
  moreTxt: { fontSize: 10, fontWeight: "700" },
  dot: {
    width: 24, height: 24, borderRadius: 12, marginBottom: 6,
    shadowOpacity: 0.9, shadowRadius: 12, alignItems: "center", justifyContent: "center",
  },
  dotRing: { position: "absolute", width: 36, height: 36, borderRadius: 18, borderWidth: 1, opacity: 0.4 },
  dotNum: { fontSize: 12, fontWeight: "800", color: "#06110C" },
  label: { color: C.ink, fontSize: 13.5, fontWeight: "700", textAlign: "center", letterSpacing: -0.2 },
  labelDim: { color: C.dim, fontWeight: "600" },
  numsRow: { flexDirection: "row", alignItems: "baseline", gap: 7, marginTop: 2 },
  count: { fontSize: 14, fontWeight: "800" },
  value: { fontSize: 12, color: C.dim, fontWeight: "600" },
  dimmed: { opacity: 0.45 },
});
