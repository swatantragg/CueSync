import { C, FONTS } from "../../styles/palette";
import Header from "../../components/Header";

export default function DashboardShell({ title, subtitle, tabs, activeTab, onTab, children }) {
  return (
    <div className="min-h-screen" style={{ background: C.light, fontFamily: FONTS.sans, color: C.dark }}>
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-4xl mb-1" style={{ fontFamily: FONTS.serif }}>{title}</h2>
          {subtitle && <p className="text-sm" style={{ color: C.sub }}>{subtitle}</p>}
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-6 border-b" style={{ borderColor: C.mint1 + "44" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => onTab(t.key)}
              className="px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors relative"
              style={{
                color: activeTab === t.key ? C.dark : C.sub,
                background: activeTab === t.key ? C.mint4 + "88" : "transparent",
                borderBottom: activeTab === t.key ? `2px solid ${C.dark}` : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {t.label}
              {t.badge > 0 && (
                <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "#ef4444", color: "#fff" }}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {children}
      </main>
    </div>
  );
}
