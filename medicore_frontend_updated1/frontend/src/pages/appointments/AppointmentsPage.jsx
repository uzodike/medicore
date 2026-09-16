import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import { appointmentsAPI } from '../../api/appointments'
import { teleAPI } from '../../api/telemedicine'
import { patientsAPI } from '../../api/patients'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'

const TRIAGE = {
    red: { bg: '#fee2e2', color: '#991b1b' },
    yellow: { bg: '#fef9c3', color: '#854d0e' },
    green: { bg: '#dcfce7', color: '#166534' },
}

const STATUS = {
    scheduled: '#eff6ff:#2563eb',
    confirmed: '#f0fdf4:#16a34a',
    in_progress: '#fef9c3:#854d0e',
    completed: '#f0fdf4:#16a34a',
    cancelled: '#fef2f2:#dc2626',
    no_show: '#f3f4f6:#6b7280',
}

function Badge({ val, map }) {
    const [bg, color] = (map[val] || '#f3f4f6:#6b7280').split(':')
    return (
        <span
            style={{
                padding: '3px 9px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: '600',
                background: bg,
                color,
            }}
        >
            {val?.replace('_', ' ')}
        </span>
    )
}

// ── Helper to format datetime for the API ──
const formatScheduledAt = (localDateTime) => {
    if (!localDateTime) return null
    const d = new Date(localDateTime) // browser interprets as local time
    return d.toISOString()            // e.g. "2026-05-11T13:30:00.000Z"
}

export default function AppointmentsPage() {
    const { user } = useAuthStore()            // 👈 get current doctor
    const [appointments, setAppointments] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('all')
    const [showModal, setShowModal] = useState(false)
    const [patients, setPatients] = useState([])

    // Separate patient search state (not sent to API)
    const [patientSearch, setPatientSearch] = useState('')
    const [selectedPatientId, setSelectedPatientId] = useState('')

    const [form, setForm] = useState({
        scheduled_at: '',
        chief_complaint: '',
        triage: 'green',
        appointment_type: 'opd',
        consult_type: 'video',
    })
    const [submitting, setSubmitting] = useState(false)
    const [invite, setInvite] = useState(null)
    const navigate = useNavigate()

    const inviteOrigin = typeof window !== 'undefined' ? window.location.origin : ''
    const copy = (text) => {
        navigator.clipboard?.writeText(text)
            .then(() => toast.success('Invite link copied'))
            .catch(() => toast.error('Copy failed — select and copy manually'))
    }

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const params = filter !== 'all' ? { status: filter } : {}
            const { data } = await appointmentsAPI.list(params)
            setAppointments(data.results || data)
        } catch {
            toast.error('Failed to load appointments')
        } finally {
            setLoading(false)
        }
    }, [filter])

    useEffect(() => {
        load()
    }, [load])

    // Patient search
    const loadPatients = async (q) => {
        if (!q || q.length < 2) {
            setPatients([])
            return
        }
        try {
            const { data } = await patientsAPI.list({ search: q })
            setPatients(data.results || data)
        } catch {
            setPatients([])
        }
    }

    // Book appointment
    const handleBook = async (e) => {
        e.preventDefault()
        if (!selectedPatientId || !form.scheduled_at) {
            toast.error('Patient and time are required')
            return
        }
        setSubmitting(true)
        try {
            // ✅ Only the fields the backend expects
            const payload = {
                patient: selectedPatientId,
                doctor: user.id,
                scheduled_at: formatScheduledAt(form.scheduled_at),
                chief_complaint: form.chief_complaint,
                triage: form.triage,
                appointment_type: form.appointment_type,
                consult_type: form.consult_type,
            }
            const { data: created } = await appointmentsAPI.create(payload)
            toast.success('Appointment booked!')
            setShowModal(false)
            if (created?.appointment_type === 'telemedicine' && created?.tele?.join_path) {
                setInvite({ link: `${inviteOrigin}${created.tele.join_path}`, patient: patientSearch })
            }
            setPatientSearch('')
            setSelectedPatientId('')
            setForm({ scheduled_at: '', chief_complaint: '', triage: 'green', appointment_type: 'opd', consult_type: 'video' })
            load()
        } catch {
            toast.error('Failed to book appointment')
        } finally {
            setSubmitting(false)
        }
    }

    const FILTERS = ['all', 'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled']

    return (
        <AppLayout
            title="OPD & Appointments"
            action={
                <button
                    onClick={() => setShowModal(true)}
                    style={{
                        padding: '8px 16px',
                        background: '#1a6b5a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '600',
                        fontFamily: 'inherit',
                    }}
                >
                    + Book Appointment
                </button>
            }
        >
            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', flexWrap: 'wrap' }}>
                {FILTERS.map(f => (
                    <button key={f} onClick={() => setFilter(f)} style={{
                        padding: '6px 14px', borderRadius: '20px', border: '1px solid', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                        background: filter === f ? '#1a6b5a' : '#fff', color: filter === f ? '#fff' : '#6b7280', borderColor: filter === f ? '#1a6b5a' : '#e5e7eb'
                    }}>
                        {f.replace('_', ' ')}
                    </button>
                ))}
            </div>

            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
                    : appointments.length === 0 ? (
                        <div style={{ padding: '48px', textAlign: 'center' }}>
                            <div style={{ fontSize: '32px', marginBottom: '10px' }}>📅</div>
                            <div style={{ fontWeight: '600', color: '#374151' }}>No appointments found</div>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    {['Patient', 'Type', 'Scheduled', 'Doctor', 'Triage', 'Status', ''].map(h => (
                                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {appointments.map((a, i) => (
                                    <tr key={a.id} style={{ borderBottom: i < appointments.length - 1 ? '1px solid #f3f4f6' : 'none' }}
                                        onMouseOver={e => e.currentTarget.style.background = '#f9fafb'}
                                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '11px 14px', fontWeight: '600', fontSize: '13.5px' }}>
                                            {a.patient_detail ? `${a.patient_detail.first_name} ${a.patient_detail.last_name}` : a.patient}
                                            <div style={{ fontSize: '11px', color: '#9ca3af' }}>{a.patient_detail?.patient_id}</div>
                                        </td>
                                        <td style={{ padding: '11px 14px' }}>
                                            <span style={{ fontSize: '12px', background: a.appointment_type === 'telemedicine' ? '#eff6ff' : '#f3f4f6', color: a.appointment_type === 'telemedicine' ? '#2563eb' : '#374151', padding: '3px 8px', borderRadius: '6px', fontWeight: '600', textTransform: 'uppercase' }}>{a.appointment_type === 'telemedicine' ? '🎥 Tele' : a.appointment_type}</span>
                                        </td>
                                        <td style={{ padding: '11px 14px', fontSize: '12.5px', color: '#374151' }}>
                                            {new Date(a.scheduled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                            <div style={{ fontSize: '11px', color: '#9ca3af' }}>{new Date(a.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                        </td>
                                        <td style={{ padding: '11px 14px', fontSize: '13px' }}>{a.doctor_detail ? `Dr. ${a.doctor_detail.last_name}` : '—'}</td>
                                        <td style={{ padding: '11px 14px' }}>
                                            <span style={{ padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', background: TRIAGE[a.triage]?.bg, color: TRIAGE[a.triage]?.color }}>{a.triage}</span>
                                        </td>
                                        <td style={{ padding: '11px 14px' }}><Badge val={a.status} map={STATUS} /></td>
                                        <td style={{ padding: '11px 14px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <select value={a.status} onChange={async e => {
                                                    await appointmentsAPI.update(a.id, { status: e.target.value })
                                                    toast.success('Status updated'); load()
                                                }} style={{ fontSize: '12px', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', fontFamily: 'inherit', cursor: 'pointer' }}>
                                                    {['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                                </select>

                                                {a.appointment_type === 'telemedicine' && a.tele && (
                                                    <>
                                                        <button
                                                            title="Copy patient invite link"
                                                            onClick={() => copy(`${inviteOrigin}${a.tele.join_path}`)}
                                                            style={{ fontSize: '12px', border: '1px solid #dbeafe', background: '#eff6ff', color: '#2563eb', borderRadius: '6px', padding: '4px 9px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600', whiteSpace: 'nowrap' }}
                                                        >🔗 Invite</button>
                                                        <button
                                                            title={a.tele.status === 'live' ? 'Join live session' : 'Start session'}
                                                            onClick={async () => {
                                                                try {
                                                                    if (a.tele.status !== 'live') await teleAPI.start(a.tele.id)
                                                                    navigate(`/telemedicine/session/${a.tele.id}`)
                                                                } catch { toast.error('Could not start session') }
                                                            }}
                                                            style={{ fontSize: '12px', border: 'none', background: a.tele.status === 'live' ? '#16a34a' : '#1a6b5a', color: '#fff', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600', whiteSpace: 'nowrap' }}
                                                        >🎥 {a.tele.status === 'live' ? 'Join' : 'Start'}</button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
            </div>


            {/* Modal */}
            {showModal && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                    }}
                >
                    <div
                        style={{
                            background: '#fff',
                            borderRadius: '16px',
                            padding: '28px',
                            width: '480px',
                            maxWidth: '95vw',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: '17px', fontWeight: '700' }}>
                                Book Appointment
                            </div>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#9ca3af' }}>
                                ×
                            </button>
                        </div>

                        <form onSubmit={handleBook} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* ── Patient search ── */}
                            <div>
                                <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>
                                    Patient *
                                </label>
                                <input
                                    value={patientSearch}                                     // separate search state
                                    onChange={(e) => {
                                        setPatientSearch(e.target.value)
                                        loadPatients(e.target.value)
                                        setSelectedPatientId('') // clear selection on new search
                                    }}
                                    placeholder="Type patient name…"
                                    style={{
                                        width: '100%',
                                        padding: '8px 11px',
                                        border: '1.5px solid #e5e7eb',
                                        borderRadius: '8px',
                                        fontSize: '13.5px',
                                        fontFamily: 'inherit',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                    }}
                                />
                                {patients.length > 0 && (
                                    <div
                                        style={{
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '8px',
                                            marginTop: '4px',
                                            background: '#fff',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                        }}
                                    >
                                        {patients.slice(0, 5).map((p) => (
                                            <div
                                                key={p.id}
                                                onClick={() => {
                                                    setSelectedPatientId(p.id)              // store patient ID
                                                    setPatientSearch(`${p.first_name} ${p.last_name} (${p.patient_id})`)
                                                    setPatients([])                         // close dropdown
                                                }}
                                                style={{
                                                    padding: '9px 12px',
                                                    cursor: 'pointer',
                                                    fontSize: '13px',
                                                    borderBottom: '1px solid #f3f4f6',
                                                }}
                                                onMouseOver={(e) => (e.currentTarget.style.background = '#f9fafb')}
                                                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <strong>{p.first_name} {p.last_name}</strong>{' '}
                                                <span style={{ color: '#9ca3af' }}>{p.patient_id}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* ── Date & Time ── */}
                            <div>
                                <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>
                                    Date & Time *
                                </label>
                                <input
                                    type="datetime-local"
                                    value={form.scheduled_at}
                                    onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
                                    style={{
                                        width: '100%',
                                        padding: '8px 11px',
                                        border: '1.5px solid #e5e7eb',
                                        borderRadius: '8px',
                                        fontSize: '13.5px',
                                        fontFamily: 'inherit',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>

                            {/* ── Type & Triage ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>
                                        Type
                                    </label>
                                    <select
                                        value={form.appointment_type}
                                        onChange={(e) => setForm((f) => ({ ...f, appointment_type: e.target.value }))}
                                        style={{
                                            width: '100%',
                                            padding: '8px 11px',
                                            border: '1.5px solid #e5e7eb',
                                            borderRadius: '8px',
                                            fontSize: '13.5px',
                                            fontFamily: 'inherit',
                                            outline: 'none',
                                            background: '#fff',
                                        }}
                                    >
                                        <option value="opd">OPD</option>
                                        <option value="telemedicine">Telemedicine</option>
                                        <option value="follow_up">Follow-Up</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>
                                        Triage
                                    </label>
                                    <select
                                        value={form.triage}
                                        onChange={(e) => setForm((f) => ({ ...f, triage: e.target.value }))}
                                        style={{
                                            width: '100%',
                                            padding: '8px 11px',
                                            border: '1.5px solid #e5e7eb',
                                            borderRadius: '8px',
                                            fontSize: '13.5px',
                                            fontFamily: 'inherit',
                                            outline: 'none',
                                            background: '#fff',
                                        }}
                                    >
                                        <option value="green">Green</option>
                                        <option value="yellow">Yellow</option>
                                        <option value="red">Red</option>
                                    </select>
                                </div>
                            </div>

                            {form.appointment_type === 'telemedicine' && (
                                <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '10px', padding: '12px 14px' }}>
                                    <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#2563eb', display: 'block', marginBottom: '6px' }}>
                                        🎥 TELEMEDICINE — CONSULT MODE
                                    </label>
                                    <select
                                        value={form.consult_type}
                                        onChange={(e) => setForm((f) => ({ ...f, consult_type: e.target.value }))}
                                        style={{ width: '100%', padding: '8px 11px', border: '1.5px solid #dbeafe', borderRadius: '8px', fontSize: '13.5px', fontFamily: 'inherit', outline: 'none', background: '#fff' }}
                                    >
                                        <option value="video">Video Call</option>
                                        <option value="voice">Voice Call</option>
                                        <option value="async">Async / Chat</option>
                                    </select>
                                    <div style={{ fontSize: '11.5px', color: '#1e40af', marginTop: '7px' }}>
                                        A secure invite link will be generated for the patient automatically.
                                    </div>
                                </div>
                            )}

                            {/* ── Chief Complaint ── */}
                            <div>
                                <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>
                                    Chief Complaint
                                </label>
                                <textarea
                                    value={form.chief_complaint}
                                    onChange={(e) => setForm((f) => ({ ...f, chief_complaint: e.target.value }))}
                                    placeholder="Brief reason for visit…"
                                    rows={2}
                                    style={{
                                        width: '100%',
                                        padding: '8px 11px',
                                        border: '1.5px solid #e5e7eb',
                                        borderRadius: '8px',
                                        fontSize: '13.5px',
                                        fontFamily: 'inherit',
                                        outline: 'none',
                                        resize: 'vertical',
                                        boxSizing: 'border-box',
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    style={{
                                        padding: '8px 16px',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '8px',
                                        background: '#fff',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    style={{
                                        padding: '8px 18px',
                                        background: '#1a6b5a',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontWeight: '600',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    {submitting ? 'Booking…' : 'Book'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {invite && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
                    <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '460px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
                            <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#e6f5f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto 12px' }}>🎥</div>
                            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: '17px', fontWeight: '700' }}>Telemedicine session created</div>
                            <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>Share this secure invite link with {invite.patient || 'the patient'}.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            <input readOnly value={invite.link} onFocus={e => e.target.select()}
                                style={{ flex: 1, padding: '9px 11px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '12.5px', fontFamily: 'monospace', outline: 'none', color: '#374151' }} />
                            <button onClick={() => copy(invite.link)} style={{ padding: '9px 14px', background: '#1a6b5a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Copy</button>
                        </div>
                        <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '11px 13px', fontSize: '12px', color: '#6b7280', marginBottom: '18px' }}>
                            The patient opens this link to enter the waiting room. When you click <b>Start</b> on the appointment, they’ll connect automatically — no login or app needed.
                        </div>
                        <button onClick={() => setInvite(null)} style={{ width: '100%', padding: '10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', fontFamily: 'inherit' }}>Done</button>
                    </div>
                </div>
            )}
        </AppLayout>
    )
}
