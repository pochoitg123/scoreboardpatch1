// frontend/src/components/ScoreDashboardCharts.tsx
import React, { useMemo } from "react";
import type { ScoreRow } from "../api/client";
import {
  ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip as PieTooltip,
} from "recharts";

/* ========================= Helpers ========================= */

function getSongTitle(s: ScoreRow): string {
  return (
    (s.songMeta as any)?.title ||
    s.songMeta?.name ||
    String(s.songId ?? "Song")
  );
}

function getMode(s: ScoreRow): "S" | "D" {
  return String(s.mode || "S").toUpperCase() === "D" ? "D" : "S";
}

/** Dificultad abreviada (BSP/DSP/ESP/CSP, BDP/DDP/EDP/CDP) */
function diffLabel(
  mode?: string | null,
  difficulty?: number | null
): { abbr: string; name: string } {
  const m = (String(mode || "S").toUpperCase() === "D") ? "D" : "S";

  switch (difficulty ?? -1) {
    case 0:
      return { abbr: m === "S" ? "SP" : "DP", name: "Simple" };
    case 1:
      return { abbr: m === "S" ? "BSP" : "BDP", name: "Basic" };
    case 2:
      return { abbr: m === "S" ? "DSP" : "DDP", name: "Difficult" };
    case 3:
      return { abbr: m === "S" ? "ESP" : "EDP", name: "Expert" };
    case 4:
      return { abbr: m === "S" ? "CSP" : "CDP", name: "Challenge" };
    default:
      return { abbr: "??", name: "Unknown" };
  }
}

/** Nivel desde songMeta.diffLv considerando Single/Double + difficulty */
function levelFrom(s: ScoreRow): number | null {
  const meta: any = s.songMeta || {};
  const lv: number[] | undefined = Array.isArray(meta?.diffLv) ? meta.diffLv : undefined;
  if (!lv) return null;
  const base = getMode(s) === "D" ? 5 : 0;
  const d = (s.difficulty ?? 0) as number;
  const idx = base + d;
  const val = lv[idx] ?? 0;
  return val && val > 0 ? val : null;
}

/** Texto final: ESP10, CSP13, etc. (si no hay nivel, solo abbr) */
function getDiffText(s: ScoreRow): string {
  const label = diffLabel(s.mode, s.difficulty);
  const lv = levelFrom(s);
  return lv ? `${label.abbr}${lv}` : label.abbr;
}

/** createdAt/updatedAt soportando Mongo Extended JSON { $$date: <ms> } */
function getPlayedAt(s: ScoreRow): number | null {
  const raw = (s as any).createdAt || (s as any).updatedAt;
  if (!raw) return null;

  if (typeof raw === "object" && raw && "$$date" in raw) {
    const n = (raw as any)["$$date"];
    return typeof n === "number" ? n : null;
  }
  if (typeof raw === "number") {
    return raw > 1e12 ? raw : raw * 1000; // segundos→ms
  }
  if (typeof raw === "string") {
    const ts = Date.parse(raw);
    if (!isNaN(ts)) return ts;
  }
  return null;
}

function getSongBasename(s: ScoreRow): string | null {
  const base =
    (s.songMeta as any)?.basename ||
    (s.songMeta as any)?.baseName ||
    null;
  if (typeof base === "string" && base.trim()) return base.trim();
  if (s.songId != null) return String(s.songId);
  const title = getSongTitle(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return title || null;
}

function getSongImage(s: ScoreRow): string | null {
  const base = getSongBasename(s);
  return base ? `/songs/${base}.png` : null; // Usamos .png según tu carpeta public/songs
}

/* ========================= Props ========================= */

type Props = {
  scores: ScoreRow[];
  loading?: boolean;
};

const TOP_N = 12; // mostramos 12 portadas

const PIE_COLORS = [
  "#60a5fa", "#34d399", "#fbbf24", "#f472b6",
  "#a78bfa", "#f87171", "#22d3ee", "#c084fc",
];

// Escalado sublineal: √r para evitar “monstruos” cuando hay mucha diferencia
function iconSizeFrom(value: number, maxVal: number, minPx = 48, maxPx = 160) {
  if (maxVal <= 0) return minPx;
  const r = Math.max(0, Math.min(1, value / maxVal));
  const k = Math.sqrt(r);
  return Math.round(minPx + (maxPx - minPx) * k);
}

/* ========================= Component ========================= */

export default function ScoreDashboardCharts({ scores, loading }: Props) {
  // Top por jugadas (con imagen)
  const topSongs = useMemo(() => {
    type Row = { key: string; name: string; value: number; img?: string | null };
    const acc: Record<string, Row> = {};
    for (const s of scores) {
      const key = String(s.songId ?? getSongTitle(s));
      if (!acc[key]) {
        acc[key] = { key, name: getSongTitle(s), value: 0, img: getSongImage(s) };
      }
      acc[key].value += 1;
    }
    return Object.values(acc)
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_N);
  }, [scores]);

  const maxVal = useMemo(
    () => topSongs.reduce((m, r) => Math.max(m, r.value), 0),
    [topSongs]
  );

  // Pie: distribución por dificultad
  const byDiff = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of scores) {
      const label = getDiffText(s);
      counts[label] = (counts[label] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [scores]);

  // Lista: jugadas recientes (con score)
  const recent = useMemo(() => {
    const copy = scores.map((s) => ({
      ...s,
      _ts: getPlayedAt(s),
    }));
    copy.sort((a, b) => {
      const ta = a._ts ?? 0;
      const tb = b._ts ?? 0;
      return tb - ta;
    });
    return copy.slice(0, 12);
  }, [scores]);

  return (
    <div className="section">
      {loading && <div>Cargando datos…</div>}

      {/* Mosaico de imágenes escaladas por popularidad */}
      <div className="card">
        <h3 className="h3">Canciones más jugadas (Top {TOP_N})</h3>

        <div
          className="image-cloud"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "flex-end",
            justifyContent: "center",
            padding: 8,
          }}
        >
          {topSongs.map((s, i) => {
            const size = iconSizeFrom(s.value, maxVal, 48, 160);
            return (
              <div
                key={s.key ?? i}
                title={`${s.name} — ${s.value} veces`}
                style={{
                  width: size,
                  height: size,
                  position: "relative",
                  borderRadius: 12,
                  overflow: "hidden",
                  boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
                  background: "#0b1220",
                }}
              >
                {s.img ? (
                  <img
                    src={s.img}
                    alt={s.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover", // conserva relación de aspecto llenando el cuadro
                      display: "block",
                    }}
                    draggable={false}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "grid",
                      placeItems: "center",
                      background: "#0EA5E9",
                      color: "#0b1220",
                      fontWeight: 800,
                    }}
                  >
                    {s.name.slice(0, 2).toUpperCase()}
                  </div>
                )}

                {/* Badge inferior con veces */}
                <div
                  style={{
                    position: "absolute",
                    left: 8,
                    bottom: 8,
                    background: "rgba(0,0,0,0.6)",
                    color: "#e5e7eb",
                    padding: "2px 6px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {s.value}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: "center", opacity: 0.8, fontSize: 12, marginTop: 6 }}>
          *El tamaño de cada portada refleja su número de jugadas (escala √).
        </div>
      </div>

      {/* Grid 2 columnas: Pie + Recientes */}
      <div className="grid-2">
        <div className="card">
          <h3 className="h3">Distribución por dificultad</h3>
          <div className="chart chart--lg">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byDiff} dataKey="value" nameKey="label" outerRadius={110}>
                  {byDiff.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <PieTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="h3">Jugadas recientemente</h3>
          <ul className="list">
            {recent.map((s: any, idx: number) => (
              <li key={idx} className="list-item">
                <div className="title-wrap">
                  <div className="title">{getSongTitle(s)}</div>
                  <div className="meta">{getDiffText(s)}</div>
                </div>
                <div className="meta">
                  {/* Fecha */}
                  <span style={{ marginRight: 8 }}>
                    {s._ts ? new Date(s._ts).toLocaleString() : "sin fecha"}
                  </span>
                  {/* Score */}
                  {typeof s.score === "number" && (
                    <span title="Score">• Score: {s.score.toLocaleString()}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Sugerencia de estilos mínimos (opcional, puedes moverlos a tu CSS global) */}
      <style>{`
        .h3 { margin: 0 0 8px; }
        .card { background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 16px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
        .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
        .list-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-radius: 12px; background: #0b1220; border: 1px solid #1f2937; }
        .title-wrap { display: flex; align-items: baseline; gap: 8px; }
        .title { font-weight: 700; }
        .meta { opacity: .85; font-size: 12px; }
        @media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
