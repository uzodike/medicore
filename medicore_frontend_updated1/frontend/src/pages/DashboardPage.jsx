import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import { dashboardAPI } from '../api/dashboard'
import toast from 'react-hot-toast'

const REFRESH_MS = 20000  // auto-refresh interval

// insurance pill colours (matches PatientListPage)
const INS_BADGE = {
  none:   { bg: '#f3f4f6', color: '#6b7280' },
  nhis:   { bg: '#e6f5f1', color: '#1a6b5a' },
  axa:    { bg: '#eff6ff', color: '#2563eb' },
  hygeia: { bg: '#fef9c3', color: '#854d0e' },
  aiico:  { bg: '#fdf4ff', color: '#7c3aed' },
  other:  { bg: '#f3f4f6', color: '#6b7280' },
}

// activity dot colours
const DOT = {
  g: { bg: '#f0fdf4', border: '#16a34a' },
  b: { bg: '#eff6ff', border: '#2563eb' },
  a: { bg: '#fffbeb', border: '#d97706' },
}

const nairaCompact = (n) => {
  n = Number(n || 0)
  if (n >= 1e6) return '\u20a6' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1e3) return '\u20a6' + Math.round(n / 1e3) + 'k'
  return '\u20a6' + n.toLocaleString('en-NG')
}

// stat card icon paths (lifted straight from the v8 design)
const ICONS = {
  opd: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7 a4 4 0 1 0 0.001 0 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
}

function StatCard({ iconBg, iconStroke, icon, label, value, sub }) {
  return (
    <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '16px 18px' }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2">{icon}</svg>
      </div>
      <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '26px', fontWeight: '700', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '11.5px', color: '#9ca3af', marginTop: '5px' }}>{sub}</div>
    </div>
  )
}

function TrendSub({ trend, suffix }) {
  if (!trend || trend.dir === 'flat') return <span>{suffix}</span>
  const up = trend.dir === 'up'
  const color = up ? '#16a34a' : '#dc2626'
  return (
    <span>
      <span style={{ color, fontWeight: '500' }}>{up ? '\u2191' : '\u2193'} {trend.pct}%</span> {suffix}
    </span>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const firstLoad = useRef(true)

  const load = useCallback(async () => {
    try {
      const { data } = await dashboardAPI.stats()
      setData(data)
      setUpdatedAt(new Date())
    } catch {
      if (firstLoad.current) toast.error('Could not load dashboard')
    } finally {
      firstLoad.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  const cards = data?.cards || {}
  const recent = data?.recent_patients || []
  const activity = data?.activity || []
  const wards = data?.wards || []

  const liveIndicator = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: '#9ca3af' }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#16a34a', display: 'inline-block', boxShadow: '0 0 0 0 rgba(22,163,74,0.5)', animation: 'mc-pulse 2s infinite' }} />
      {updatedAt ? `Updated ${updatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Live'}
    </div>
  )

  return (
    <AppLayout title="Dashboard" action={liveIndicator}>
      <style>{`@keyframes mc-pulse{0%{box-shadow:0 0 0 0 rgba(22,163,74,0.4)}70%{box-shadow:0 0 0 6px rgba(22,163,74,0)}100%{box-shadow:0 0 0 0 rgba(22,163,74,0)}}`}</style>

      {/* ===== STAT CARDS ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '22px' }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '16px 18px', height: '116px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: '#f3f4f6', marginBottom: '10px' }} />
              <div style={{ width: '55%', height: '11px', background: '#f3f4f6', borderRadius: '4px', marginBottom: '9px' }} />
              <div style={{ width: '40%', height: '22px', background: '#f3f4f6', borderRadius: '4px' }} />
            </div>
          ))
        ) : (
          <>
            <StatCard
              iconBg="#e6f5f1" iconStroke="#1a6b5a"
              icon={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>}
              label="OPD Today"
              value={cards.opd_today?.value ?? 0}
              sub={<TrendSub trend={cards.opd_today?.trend} suffix="vs yesterday" />}
            />
            <StatCard
              iconBg="#eff6ff" iconStroke="#2563eb"
              icon={<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />}
              label="IPD Occupancy"
              value={`${cards.occupancy?.pct ?? 0}%`}
              sub={`${cards.occupancy?.occupied ?? 0}/${cards.occupancy?.total ?? 0} beds`}
            />
            <StatCard
              iconBg="#fef9c3" iconStroke="#d97706"
              icon={<><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></>}
              label="Today's Revenue"
              value={nairaCompact(cards.revenue_today?.value)}
              sub={<TrendSub trend={cards.revenue_today?.trend} suffix="vs last week" />}
            />
            <StatCard
              iconBg="#fef2f2" iconStroke="#dc2626"
              icon={<path d="M22 12h-4l-3 9L9 3l-3 9H2" />}
              label="Registered Patients"
              value={cards.patients_total?.value ?? 0}
              sub={`+${cards.patients_total?.new_this_week ?? 0} this week`}
            />
          </>
        )}
      </div>

      {/* ===== RECENT REGISTRATIONS + ACTIVITY FEED ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        {/* Recent registrations */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: '700' }}>Recent Registrations</span>
            <span onClick={() => navigate('/patients/register')} style={{ fontSize: '12px', color: '#1a6b5a', cursor: 'pointer', fontWeight: '500' }}>Register \u2192</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Patient', 'ID', 'Insurance', 'Date'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr><td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: '#9ca3af', fontSize: '13px' }}>No patients registered yet.</td></tr>
              ) : recent.map((p, i) => {
                const ins = INS_BADGE[p.insurance] || INS_BADGE.none
                return (
                  <tr key={p.patient_id} onClick={() => navigate(`/patients/${p.patient_id}`)} style={{ cursor: 'pointer' }}
                    onMouseOver={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '11px 12px', borderBottom: i < recent.length - 1 ? '1px solid #f3f4f6' : 'none', fontSize: '13.5px', fontWeight: '600' }}>{p.name}</td>
                    <td style={{ padding: '11px 12px', borderBottom: i < recent.length - 1 ? '1px solid #f3f4f6' : 'none', fontSize: '12.5px', color: '#6b7280', fontFamily: 'monospace' }}>{p.patient_id}</td>
                    <td style={{ padding: '11px 12px', borderBottom: i < recent.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                      <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: ins.bg, color: ins.color }}>{p.insurance_label}</span>
                    </td>
                    <td style={{ padding: '11px 12px', borderBottom: i < recent.length - 1 ? '1px solid #f3f4f6' : 'none', fontSize: '12px', color: '#9ca3af' }}>{p.date}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Activity feed */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: '700' }}>Activity Feed</span>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {activity.length === 0 ? (
              <li style={{ display: 'flex', gap: '12px', paddingBottom: '14px' }}>
                <div style={{ width: '15px', height: '15px', borderRadius: '50%', flexShrink: 0, marginTop: '2px', border: '2px solid', background: DOT.g.bg, borderColor: DOT.g.border }} />
                <div><div style={{ fontSize: '13px', fontWeight: '600' }}>System ready — start by registering a patient</div><div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '1px' }}>Now</div></div>
              </li>
            ) : activity.map((ev, i) => {
              const d = DOT[ev.dot] || DOT.b
              const isLast = i === activity.length - 1
              return (
                <li key={i} style={{ display: 'flex', gap: '12px', paddingBottom: '14px', position: 'relative' }}>
                  {!isLast && <div style={{ position: 'absolute', left: '7px', top: '20px', bottom: 0, width: '1px', background: '#e5e7eb' }} />}
                  <div style={{ width: '15px', height: '15px', borderRadius: '50%', flexShrink: 0, marginTop: '2px', border: '2px solid', background: d.bg, borderColor: d.border }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600' }}>{ev.title}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '1px' }}>{ev.time}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* ===== DEPARTMENT OCCUPANCY ===== */}
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '18px 20px' }}>
        <div style={{ marginBottom: '16px' }}><span style={{ fontSize: '14px', fontWeight: '700' }}>Department Occupancy</span></div>
        {wards.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#9ca3af', textAlign: 'center', padding: '12px' }}>No wards configured yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(wards.length, 5)}, 1fr)`, gap: '14px' }}>
                          {wards.map((w, i) => (
                              <div key={w.id || `${w.name}-${i}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '5px' }}>
                  <span style={{ fontWeight: '600' }}>{w.name}</span>
                  <span style={{ color: '#6b7280' }}>{w.occupied}/{w.total}</span>
                </div>
                <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: '3px', width: `${w.pct}%`, background: w.color }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
