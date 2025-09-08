import ScoreDashboardCharts from "../components/ScoreDashboardCharts";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-950 text-white p-4">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <ScoreDashboardCharts scores={[]} />
    </div>
  );
}
