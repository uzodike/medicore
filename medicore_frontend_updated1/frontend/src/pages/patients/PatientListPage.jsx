import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import { patientsAPI } from '../../api/patients'
import toast from 'react-hot-toast'

const BADGE = {
  none: { bg: '#f3f4f6', color: '#6b7280', label: 'Self-Pay' },
  nhis: { bg: '#e6f5f1', color: '#1a6b5a', label: 'NHIS' },
  axa: { bg: '#eff6ff', color: '#2563eb', label: 'AXA' },
  hygeia: { bg: '#fef9c3', color: '#854d0e', label: 'Hygeia' },
  aiico: { bg: '#fdf4ff', color: '#7c3aed', label: 'AIICO' },
  other: { bg: '#f3f4f6', color: '#6b7280', label: 'Other' },
}

export default function PatientListPage() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [count, setCount] = useState(0)
  const navigate = useNavigate()

  const fetchPatients = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await patientsAPI.list({ search, page })
      setPatients(data.results || data)
      setTotalPages(data.total_pages || 1)
      setCount(data.count || (data.results || data).length)
    } catch {
      toast.error('Failed to load patients')
    } finally {
      setLoading(false)
    }
  }, [search, page])

  useEffect(() => { fetchPatients() }, [fetchPatients])

  // Debounce search
  useEffect(() => { setPage(1) }, [search])

  const getInitials = (p) => `${p.first_name?.[0]||''}${p.last_name?.[0]||''}`.toUpperCase()
  const avatarColors = ['#1a6b5a','#2563eb','#7c3aed','#dc2626','#d97706','#0891b2']
  const getColor = (id) => avatarColors[id?.charCodeAt?.(0) % avatarColors.length] || '#1a6b5a'

  return (
    <AppLayout
      title="Patients"
      action={
        <button onClick={() => navigate('/patients/register')} style={{
          padding: '8px 16px', background: '#1a6b5a', color: '#fff',
          border: 'none', borderRadius: '8px', cursor: 'pointer',
          fontSize: '13px', fontWeight: '600', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span> New Patient
        </button>
      }
    >
      {/* Search + stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '340px' }}>
          <svg style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, ID or phone…"
            style={{
              width: '100%', padding: '9px 12px 9px 34px', border: '1px solid #e5e7eb',
              borderRadius: '8px', fontSize: '13px', outline: 'none',
              fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginLeft: 'auto' }}>
          {count} patient{count !== 1 ? 's' : ''} total
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
            Loading patients…
          </div>
        ) : patients.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>🏥</div>
            <div style={{ fontWeight: '600', color: '#374151', marginBottom: '4px' }}>No patients found</div>
            <div style={{ fontSize: '13px', color: '#9ca3af' }}>
              {search ? 'Try a different search term' : 'Register your first patient to get started'}
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                {['Patient','ID','Age / Gender','Blood','Insurance','Registered'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patients.map((p, i) => {
                const ins = BADGE[p.insurance_provider] || BADGE.none
                return (
                  <tr key={p.id} onClick={() => navigate(`/patients/${p.patient_id}`)}
                    style={{ borderBottom: i < patients.length-1 ? '1px solid #f3f4f6' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseOver={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: getColor(p.patient_id), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0 }}>
                          {getInitials(p)}
                        </div>
                        <div>
                          <div style={{ fontWeight: '600', fontSize: '13.5px' }}>{p.first_name} {p.last_name}</div>
                          <div style={{ fontSize: '11.5px', color: '#9ca3af' }}>{p.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '12.5px', color: '#6b7280', fontFamily: 'monospace' }}>{p.patient_id}</td>
                    <td style={{ padding: '12px 14px', fontSize: '13px' }}>{p.age}y · {p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : 'Other'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', background: p.blood_group ? '#fee2e2' : '#f3f4f6', color: p.blood_group ? '#991b1b' : '#9ca3af' }}>
                        {p.blood_group || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: ins.bg, color: ins.color }}>
                        {ins.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '12px', color: '#9ca3af' }}>
                      {new Date(p.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
            style={{ padding: '6px 14px', border: '1px solid #e5e7eb', borderRadius: '7px', background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: '13px', color: page === 1 ? '#d1d5db' : '#374151' }}>
            ← Prev
          </button>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
            style={{ padding: '6px 14px', border: '1px solid #e5e7eb', borderRadius: '7px', background: '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: '13px', color: page === totalPages ? '#d1d5db' : '#374151' }}>
            Next →
          </button>
        </div>
      )}
    </AppLayout>
  )
}
