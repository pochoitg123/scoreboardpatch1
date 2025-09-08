import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import type { ScoreRow } from "../api/client";
import { fetchSongRanking, type SongRankingResponse } from "../api/client";
import RankingModal from "./RankingModal";
import {
  Icon,
  clearIconNames,
  rankIconNames,
  getRankLabel,
  getClearLabel,
  publicUrl,
} from "../utils/icons";
import ScoreDashboardCharts from "@/components/ScoreDashboardCharts";

/* ===== Query param helper ===== */
function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

/* ===== Covers helpers ===== */
function coverCandidates(s: ScoreRow): string[] {
  const meta: any = s.songMeta || {};
  const list: string[] = [];
  if (meta?.imageUrl) list.push(String(meta.imageUrl));
  const base =
    meta?.basename || meta?.baseName || meta?.BaseName || meta?.name || null;
  if (base) {
    list.push(
      publicUrl(`songs/${base}.png`),
      publicUrl(`songs/${base}.PNG`),
      publicUrl(`songs/${base}.jpg`),
      publicUrl(`songs/${base}.jpeg`)
    );
  }
  list.push(publicUrl("songs/_missing.png"));
  return list;
}
function onCoverError(e: React.SyntheticEvent<HTMLImageElement>) {
  const el = e.currentTarget;
  const covers = (el.dataset.covers || "").split("|").filter(Boolean);
  let i = Number(el.dataset.idx || "0");
  if (i < covers.length - 1) {
    i += 1;
    el.dataset.idx = String(i);
    el.src = covers[i];
  }
}

/* ===== Difficulty label (DSP/ESP/CSP, etc.) ===== */
function diffLabel(
  mode?: string | null,
  difficulty?: number | null
): { abbr: string; name: string } {
  const m = (String(mode || "S").toUpperCase() === "D") ? "D" : "S";
  switch (difficulty ?? -1) {
    case 1:  return { abbr: m === "S" ? "BSP" : "BDP", name: "Basic" };
    case 2:  return { abbr: m === "S" ? "DSP" : "DDP", name: "Difficult" };
    case 3:  return { abbr: m === "S" ? "ESP" : "EDP", name: "Expert" };
    case 4:  return { abbr: m === "S" ? "CSP" : "CDP", name: "Challenge" };
    case 0:  return { abbr: "BGN", name: "Beginner" };
    default: return { abbr: `${m}?`, name: "Unknown" };
  }
}

/* ===== UI helpers ===== */
function diffColor(diff?: number | null) {
  switch (diff) {
    case 0: return "#06b6d4"; // Beginner
    case 1: return "#facc15"; // Basic
    case 2: return "#ef4444"; // Difficult
    case 3: return "#22c55e"; // Expert
    case 4: return "#a855f7"; // Challenge
    default: return "#94a3b8";
  }
}
function levelFrom(s: ScoreRow): string {
  const meta: any = s.songMeta || {};
  const lv: number[] | undefined = Array.isArray(meta?.diffLv)
    ? meta.diffLv
    : undefined;
  if (!lv) return "-";
  const base = (String(s.mode || "").toUpperCase() === "D") ? 5 : 0;
  const d = (s.difficulty ?? 0) as number;
  const idx = base + d;
  const val = lv[idx] ?? 0;
  return val && val > 0 ? String(val) : "-";
}
function formatScore(v?: number | null) {
  if (v == null) return "-";
  try { return v.toLocaleString("en-US"); } catch { return String(v); }
}

const FRAME = { bg:"#00de91", border: "#22d3ee", strip: "#06b6d4" };

/* ===== Series labels ===== */
const SERIES_LABELS: Record<number, string> = {
  1: "1st",
  2: "2ndMIX",
  3: "3rdMIX",
  4: "4thMIX",
  5: "5thMIX",
  6: "MAX",
  7: "MAX2",
  8: "EXTREME",
  9: "SuperNOVA",
  10: "SuperNOVA2",
  11: "X",
  12: "X2",
  13: "X3 VS 2ndMIX",
  14: "2013",
  15: "2014",
  16: "2015",
  17: "A",
  18: "A20",
  19: "A20 PLUS",
  20: "A3",
  21: "WORLD",
};
function seriesLabel(n?: number | null) {
  if (n == null) return "—";
  return SERIES_LABELS[n] || String(n);
}

/* ===== Componente principal ===== */
export default function ScoreDashboard({ initialScores }: { initialScores: ScoreRow[] }) {
  const query = useQuery();
  const dancerFromQuery = query.get("dancer") || "";

  // base: solo source=score3
  const base = useMemo(
    () => (initialScores || []).filter((s) => s.source === "score3"),
    [initialScores]
  );

  // dedupe: mejor score por (songId, mode, difficulty, dancerName)
  const deduped: ScoreRow[] = useMemo(() => {
    const best = new Map<string, ScoreRow>();
    for (const s of base) {
      const key = [
        String(s.songId ?? ""),
        String(s.mode ?? ""),
        String(s.difficulty ?? ""),
        String(s.dancerName ?? ""),
      ].join("|");
      const prev = best.get(key);
      if (!prev || (s.score ?? 0) > (prev.score ?? 0)) best.set(key, s);
    }
    return [...best.values()];
  }, [base]);

  // lista de dancers para el filtro
  const dancerNames = useMemo(
    () => Array.from(new Set(deduped.map((s) => s.dancerName || "UNKNOWN"))).sort(),
    [deduped]
  );

  // ===== Filtros =====
  // dancer (inicial desde ?dancer=)
  const [filterDancer, setFilterDancer] = useState<string>(dancerFromQuery || "");
  useEffect(() => {
    if (dancerFromQuery) setFilterDancer(dancerFromQuery);
  }, [dancerFromQuery]);

  // series (multi-select)
  const seriesInData = useMemo(() => {
    const set = new Set<number>();
    for (const s of deduped) {
      const n = (s.songMeta as any)?.series;
      if (typeof n === "number") set.add(n);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [deduped]);

  const [seriesSel, setSeriesSel] = useState<number[]>([]);
  function toggleSeries(n: number) {
    setSeriesSel(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
  }
  function clearSeries() {
    setSeriesSel([]);
  }

  // aplicar filtros
  const filtered = useMemo(() => {
    return deduped.filter(s => {
      if (filterDancer && (s.dancerName || "UNKNOWN") !== filterDancer) return false;
      if (seriesSel.length > 0) {
        const sn = (s.songMeta as any)?.series;
        if (typeof sn !== "number" || !seriesSel.includes(sn)) return false;
      }
      return true;
    });
  }, [deduped, filterDancer, seriesSel]);

  const scores = useMemo(
    () => [...filtered].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [filtered]
  );

  // ===== Modal ranking =====
  const [open, setOpen] = useState(false);
  const [selSong, setSelSong] = useState<{ songId: number | string; title: string; cover: string } | null>(null);
  const [ranking, setRanking] = useState<SongRankingResponse | null>(null);
  const [loadingRank, setLoadingRank] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function openRanking(s: ScoreRow, coverUrl: string, title: string) {
    setSelSong({ songId: s.songId, title, cover: coverUrl });
    setOpen(true);
    setLoadingRank(true);
    try {
      const data = await fetchSongRanking(s.songId as any, { source: "score3", limit: 5 });
      setRanking(data);
    } finally {
      setLoadingRank(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Filtros básicos */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          background: "#f8fafc",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 10,
        }}
      >
        <div style={{ fontWeight: 700 }}>Filtros</div>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Dancer
          <select
            value={filterDancer}
            onChange={(e) => setFilterDancer(e.target.value)}
          >
            <option value="">Todos</option>
            {dancerNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div style={{ marginLeft: "auto", color: "#64748b" }}>
          {scores.length} resultados
        </div>
      </div>

      {/* Filtro por series */}
      <div style={seriesBar}>
        <SeriesChip
          label="Todos"
          active={seriesSel.length === 0}
          onClick={clearSeries}
        />
        {seriesInData.map((n) => (
          <SeriesChip
            key={n}
            label={seriesLabel(n)}
            active={seriesSel.includes(n)}
            onClick={() => toggleSeries(n)}
          />
        ))}
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 18,
        }}
      >
        {scores.map((s, idx) => {
          const covers = coverCandidates(s);
          const cover0 = covers[0];
          const songTitle =
            (s.songMeta as any)?.title ||
            s.songMeta?.name ||
            String(s.songId ?? "Song");
          const color = diffColor(s.difficulty);
          const level = levelFrom(s);
          const scoreText = formatScore(s.score);
          const rankLbl = getRankLabel((s as any).rank);
          const clearLbl = getClearLabel(s.clearKind);
          const diff = diffLabel(s.mode, s.difficulty);

          return (
            <div
              key={idx}
              style={tile}
              title={`${songTitle} · ${diff.abbr} · ${rankLbl} · ${clearLbl}`}
              onClick={() => openRanking(s, cover0, songTitle)}
            >
              <div
                style={{
                  background: FRAME.bg,
                  padding: 10,
                  border: `2px solid ${FRAME.border}`,
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    position: "relative",
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "#111827",
                  }}
                >
                  <img
                    src={cover0}
                    alt={songTitle}
                    data-covers={covers.join("|")}
                    data-idx="0"
                    onError={onCoverError}
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                  <span style={{ ...chipTL, borderColor: color, color }}>
                    {diff.abbr}
                  </span>
                </div>

                {/* Barra inferior */}
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    background: "#0b1220",
                    border: "1px solid #111827",
                    borderRadius: 10,
                    padding: "8px 10px",
                    minHeight: 48,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "baseline", gap: 12 }}
                  >
                    <span
                      style={{
                        fontWeight: 900,
                        fontSize: 24,
                        lineHeight: 1,
                        color,
                      }}
                    >
                      {level}
                    </span>
                    <span
                      style={{
                        fontFamily:
                          "var(--font-mono)",
                        fontWeight: 800,
                        fontSize: 12,
                        color: "#a5b4fc",
                      }}
                    >
                      {scoreText}
                    </span>
                  </div>

                  {/* Rank/Clear con íconos */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={iconBadge}>
                      <Icon
                        names={rankIconNames((s as any).rank)}
                        size={16}
                        title={rankLbl}
                      />
                    </div>
                    <div style={iconBadge}>
                      <Icon
                        names={clearIconNames(s.clearKind)}
                        size={16}
                        title={clearLbl}
                        spin
                        speedMs={900}
                      />
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    height: 7,
                    marginTop: 8,
                    borderRadius: 100,
                    background: `repeating-linear-gradient(135deg, ${FRAME.strip}, ${FRAME.strip} 12px, transparent 12px, transparent 24px)`,
                  }}
                />
              </div>

              <div style={titleBar}>{songTitle}</div>
            </div>
          );
        })}
      </div>

      {/* Modal Ranking */}
      <RankingModal
        open={open}
        onClose={() => setOpen(false)}
        song={selSong}
        ranking={ranking}
        loading={loadingRank}
      />
    </div>
  );
}

/* ===== chip de series ===== */
function SeriesChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={active ? seriesChipActive : seriesChip}
    >
      <span>{label}</span>
    </button>
  );
}

/* ===== estilos ===== */
const seriesBar: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  gap: 10,
};

const seriesChipBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 36,
  padding: "0 14px",
  borderRadius: 12,
  fontWeight: 800,
  letterSpacing: 0.2,
  cursor: "pointer",
  userSelect: "none",
  border: "2px solid #a98827", // dorado
  boxShadow: "inset 0 0 0 2px rgba(0,0,0,.35), 0 2px 4px rgba(0,0,0,.15)",
};
const seriesChip: React.CSSProperties = {
  ...seriesChipBase,
  background: "linear-gradient(180deg, #1f2937 0%, #0f172a 100%)", // negro/gris
  color: "#e5e7eb",
};
const seriesChipActive: React.CSSProperties = {
  ...seriesChipBase,
  background: "linear-gradient(180deg, #67e8f9 0%, #06b6d4 100%)", // turquesa
  color: "#0b1220",
  borderColor: "#0891b2",
};

const tile: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  boxShadow: "0 2px 10px rgba(0,0,0,.06)",
  cursor: "pointer",
};
const titleBar: React.CSSProperties = {
  padding: "6px 8px 8px",
  textAlign: "center",
  fontWeight: 800,
  fontSize: 13,
  color: "#0f172a",
  minHeight: 34,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const chipTL: React.CSSProperties = {
  position: "absolute",
  top: 10,
  left: 10,
  padding: "4px 7px",
  borderRadius: 9,
  fontWeight: 900,
  fontSize: 11,
  lineHeight: 1,
  color: "#111827",
  background: "rgba(255,255,255,.94)",
  border: "2px solid currentColor",
  boxShadow: "0 1px 4px rgba(0,0,0,.1)",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};
const iconBadge: React.CSSProperties = {
  width: 26,
  height: 26,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#0b1220",
};
