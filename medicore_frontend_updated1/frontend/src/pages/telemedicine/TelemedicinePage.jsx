import { useState, useEffect, useRef } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import { teleAPI } from '../../api/telemedicine'
import { patientsAPI } from '../../api/patients'
import toast from 'react-hot-toast'

export default function TelemedicinePage() {
    const [sessions, setSessions] = useState([])
    const [live, setLive] = useState([])
    const [loading, setLoading] = useState(true)
    const [scheduling, setScheduling] = useState(false)
    const [activeSession, setActiveSession] = useState(null)
    const [messages, setMessages] = useState([])
    const [msgInput, setMsgInput] = useState('')
    const [callTimer, setCallTimer] = useState(0)
    const [micOn, setMicOn] = useState(true)
    const [camOn, setCamOn] = useState(true)
    const [showSchedule, setShowSchedule] = useState(false)
    const [patients, setPatients] = useState([])
    const [form, setForm] = useState({
        patient: '', patient_search: '', scheduled_at: '',
        consult_type: 'video', chief_complaint: '', notify_via: 'sms_email'
    })
    const timerRef = useRef(null)
    const chatRef = useRef(null)

    const load = async () => {
        setLoading(true)
        try {
            const [sessRes, liveRes] = await Promise.all([
                teleAPI.list(),
                teleAPI.live()
            ])
            setSessions(sessRes.data.results || sessRes.data)
            setLive(liveRes.data.sessions || [])
        } catch { toast.error('Failed to load sessions') }
        finally { setLoading(false) }
    }

    useEffect(() => { load() }, [])

    const startSession = async (session) => {
        try {
            await teleAPI.start(session.id)
            setActiveSession({ ...session, status: 'live' })
            const { data } = await teleAPI.messages(session.id)
            setMessages(data.results || data)
            setCallTimer(0)
            timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000)
            toast.success('Session started!')
            load()
        } catch { toast.error('Failed to start session') }
    }

    const endSession = async () => {
        if (!activeSession) return
        try {
            await teleAPI.end(activeSession.id, { clinical_notes: '' })
            clearInterval(timerRef.current)
            setActiveSession(null); setMessages([]); setCallTimer(0)
            toast.success('Session ended'); load()
        } catch { toast.error('Failed to end session') }
    }

    const sendMsg = async () => {
        if (!msgInput.trim() || !activeSession) return
        try {
            await teleAPI.sendMessage(activeSession.id, { message: msgInput })
            setMessages(m => [...m, { sender_label: 'doctor', message: msgInput, created_at: new Date().toISOString() }])
            setMsgInput('')
            setTimeout(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, 50)
        } catch { toast.error('Failed to send') }
    }

    const formatTimer = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

    const handleSchedule = async (e) => {
        e.preventDefault()
        if (!form.patient || !form.scheduled_at) {
            toast.error('Patient and time required'); return
        }
        setScheduling(true)
        try {
            console.log('🔵 Creating session with:', form)
            const { data: newSession } = await teleAPI.create(form)
            console.log('✅ Session created:', newSession)

            await new Promise(resolve => setTimeout(resolve, 500))

            console.log('🔵 Reloading sessions...')
            await load()
            console.log('✅ Sessions reloaded:', sessions)

            toast.success('Session scheduled! ✓')
            setForm({
                patient: '', patient_search: '', scheduled_at: '',
                consult_type: 'video', chief_complaint: '', notify_via: 'sms_email'
            })
            setShowSchedule(false)
        } catch (err) {
            console.error('❌ Schedule failed:', err.response?.data || err.message)
            toast.error(err.response?.data?.detail || 'Failed to schedule')
        } finally {
            setScheduling(false)
        }
    }

    const STATUS_STYLE = {
        scheduled: '#eff6ff:#2563eb',
        waiting: '#fef9c3:#854d0e',
        live: '#f0fdf4:#16a34a',
        ended: '#f3f4f6:#6b7280',
        cancelled: '#fef2f2:#dc2626'
    }

    return (
        <AppLayout title="Telemedicine"
            action={<button onClick={() => setShowSchedule(true)} style={{
                padding: '8px 16px', background: '#1a6b5a', color: '#fff',
                border: 'none', borderRadius: '8px', cursor: 'pointer',
                fontSize: '13px', fontWeight: '600', fontFamily: 'inherit'
            }}>+ Schedule Session</button>}
        >
            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '18px' }}>
                {/* Sessions list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {live.length > 0 && (
                        <div style={{
                            background: '#fff', borderRadius: '12px',
                            border: '1px solid #e5e7eb', overflow: 'hidden'
                        }}>
                            <div style={{
                                padding: '12px 16px', borderBottom: '1px solid #e5e7eb',
                                display: 'flex', alignItems: 'center', gap: '8px'
                            }}>
                                <span style={{
                                    width: '8px', height: '8px', borderRadius: '50%',
                                    background: '#dc2626', display: 'inline-block',
                                    animation: 'blink 1s infinite'
                                }} />
                                <span style={{ fontSize: '12px', fontWeight: '700', color: '#dc2626' }}>
                                    LIVE NOW ({live.length})
                                </span>
                            </div>
                            {live.map(s => (
                                <div key={s.id} onClick={() => startSession(s)}
                                    style={{
                                        padding: '12px 16px', cursor: 'pointer',
                                        borderBottom: '1px solid #f3f4f6', background: '#f0fdf4'
                                    }}
                                    onMouseOver={e => e.currentTarget.style.background = '#dcfce7'}
                                    onMouseOut={e => e.currentTarget.style.background = '#f0fdf4'}>
                                    <div style={{ fontWeight: '600', fontSize: '13px' }}>
                                        {s.patient_detail ? `${s.patient_detail.first_name} ${s.patient_detail.last_name}` : 'Patient'}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '2px' }}>
                                        with Dr. {s.doctor_detail?.last_name} · Click to join
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{
                        background: '#fff', borderRadius: '12px',
                        border: '1px solid #e5e7eb', overflow: 'hidden'
                    }}>
                        <div style={{
                            padding: '12px 16px', borderBottom: '1px solid #e5e7eb',
                            fontSize: '12px', fontWeight: '700', color: '#374151'
                        }}>
                            All Sessions ({sessions.length})
                        </div>
                        {loading ? (
                            <div style={{
                                padding: '32px', textAlign: 'center',
                                color: '#9ca3af', fontSize: '13px'
                            }}>Loading…</div>
                        ) : sessions.length === 0 ? (
                            <div style={{
                                padding: '32px', textAlign: 'center',
                                color: '#9ca3af', fontSize: '13px'
                            }}>No sessions yet. Schedule one to get started!</div>
                        ) : (
                            sessions.map((s, i) => {
                                const [bg, color] = (STATUS_STYLE[s.status] || '#f3f4f6:#6b7280').split(':')
                                const isClickable = ['scheduled', 'waiting'].includes(s.status)
                                return (
                                    <div key={s.id}
                                        onClick={() => { if (isClickable) startSession(s) }}
                                        style={{
                                            padding: '12px 16px',
                                            borderBottom: i < sessions.length - 1 ? '1px solid #f3f4f6' : 'none',
                                            cursor: isClickable ? 'pointer' : 'default',
                                            background: activeSession?.id === s.id ? '#f0fdf4' : 'transparent'
                                        }}
                                        onMouseOver={e => { if (isClickable) e.currentTarget.style.background = '#f9fafb' }}
                                        onMouseOut={e => { if (activeSession?.id !== s.id) e.currentTarget.style.background = 'transparent' }}>
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between',
                                            alignItems: 'flex-start'
                                        }}>
                                            <div>
                                                <div style={{ fontWeight: '600', fontSize: '13px' }}>
                                                    {s.patient_detail ? `${s.patient_detail.first_name} ${s.patient_detail.last_name}` : 'Patient'}
                                                </div>
                                                <div style={{
                                                    fontSize: '11px', color: '#9ca3af', marginTop: '2px'
                                                }}>
                                                    {new Date(s.scheduled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                                    {' '}{new Date(s.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '12px',
                                                fontSize: '10px', fontWeight: '700',
                                                background: bg, color, textTransform: 'capitalize'
                                            }}>
                                                {s.status}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>

                {/* Video panel */}
                <div>
                    {!activeSession ? (
                        <div style={{
                            background: '#fff', borderRadius: '14px',
                            border: '1px solid #e5e7eb',
                            padding: '60px 20px', textAlign: 'center'
                        }}>
                            <div style={{
                                width: '64px', height: '64px', borderRadius: '50%',
                                background: '#e6f5f1', border: '2px solid #a7f3d0',
                                display: 'flex', alignItems: 'center',
                                justifyContent: 'center', margin: '0 auto 16px'
                            }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1a6b5a" strokeWidth="2">
                                    <path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.87v6.26a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
                                </svg>
                            </div>
                            <div style={{
                                fontFamily: "'Syne',sans-serif",
                                fontSize: '18px', fontWeight: '700', marginBottom: '8px'
                            }}>
                                No Active Session
                            </div>
                            <div style={{ color: '#9ca3af', fontSize: '13px' }}>
                                Click a scheduled session on the left or schedule a new one.
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Video grid */}
                            <div style={{
                                background: '#0e2a24', borderRadius: '14px', overflow: 'hidden'
                            }}>
                                <div style={{
                                    display: 'grid', gridTemplateColumns: '1fr 1fr',
                                    gap: '8px', padding: '12px', height: '260px'
                                }}>
                                    {['Doctor', 'Patient'].map((role, idx) => (
                                        <div key={role} style={{
                                            background: idx === 0 ? '#1a3d33' : '#163028',
                                            borderRadius: '10px', display: 'flex',
                                            flexDirection: 'column', alignItems: 'center',
                                            justifyContent: 'center', position: 'relative',
                                            border: idx === 0 ? '2px solid #2a6b5a' : 'none'
                                        }}>
                                            <div style={{
                                                width: '48px', height: '48px', borderRadius: '50%',
                                                background: idx === 0 ? '#2a8f76' : '#1a6b5a',
                                                display: 'flex', alignItems: 'center',
                                                justifyContent: 'center', fontSize: '16px',
                                                fontWeight: '700', color: '#fff', marginBottom: '8px'
                                            }}>
                                                {idx === 0 ? 'DR' : (activeSession.patient_detail?.first_name?.[0] || 'P') + (activeSession.patient_detail?.last_name?.[0] || '')}
                                            </div>
                                            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px' }}>
                                                {idx === 0 ? 'Doctor' : activeSession.patient_detail
                                                    ? `${activeSession.patient_detail.first_name} ${activeSession.patient_detail.last_name}`
                                                    : 'Patient'}
                                            </div>
                                            <div style={{
                                                position: 'absolute', top: '8px', left: '8px',
                                                background: 'rgba(0,0,0,0.5)', borderRadius: '5px',
                                                padding: '2px 7px', fontSize: '10px', color: '#fff',
                                                display: 'flex', alignItems: 'center', gap: '4px'
                                            }}>
                                                <span style={{
                                                    width: '5px', height: '5px', borderRadius: '50%',
                                                    background: '#22c55e', display: 'inline-block'
                                                }} />{role}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {/* Controls */}
                                <div style={{
                                    background: '#0e2a24', borderTop: '1px solid rgba(255,255,255,0.08)',
                                    padding: '12px', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', gap: '10px'
                                }}>
                                    <div style={{
                                        color: 'rgba(255,255,255,0.6)', fontSize: '13px',
                                        fontWeight: '600', marginRight: '8px', fontVariantNumeric: 'tabular-nums'
                                    }}>
                                        {formatTimer(callTimer)}
                                    </div>
                                    {[
                                        {
                                            icon: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
                                            active: micOn, toggle: () => setMicOn(m => !m)
                                        },
                                        {
                                            icon: 'M15 10l4.553-2.069A1 1 0 0 1 21 8.87v6.26a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z',
                                            active: camOn, toggle: () => setCamOn(c => !c)
                                        },
                                    ].map(({ icon, active, toggle }, i) => (
                                        <button key={i} onClick={toggle} style={{
                                            width: '38px', height: '38px', borderRadius: '50%',
                                            background: active ? '#1a3d33' : '#dc2626',
                                            border: 'none', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center',
                                            justifyContent: 'center', transition: 'background 0.15s'
                                        }}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                                <path d={icon} />
                                            </svg>
                                        </button>
                                    ))}
                                    <button onClick={endSession} style={{
                                        padding: '9px 20px', borderRadius: '20px',
                                        background: '#dc2626', border: 'none', cursor: 'pointer',
                                        color: '#fff', fontSize: '13px', fontWeight: '600',
                                        fontFamily: 'inherit'
                                    }}>End Call</button>
                                </div>
                            </div>

                            {/* Chat */}
                            <div style={{
                                background: '#fff', borderRadius: '14px',
                                border: '1px solid #e5e7eb', padding: '16px'
                            }}>
                                <div style={{
                                    fontSize: '12px', fontWeight: '700',
                                    color: '#374151', marginBottom: '10px'
                                }}>Session Chat</div>
                                <div ref={chatRef} style={{
                                    height: '140px', overflowY: 'auto',
                                    display: 'flex', flexDirection: 'column',
                                    gap: '8px', marginBottom: '10px'
                                }}>
                                    {messages.length === 0 && (
                                        <div style={{
                                            textAlign: 'center', color: '#9ca3af',
                                            fontSize: '12px', padding: '20px 0'
                                        }}>No messages yet</div>
                                    )}
                                    {messages.map((m, i) => (
                                        <div key={i} style={{
                                            display: 'flex', gap: '6px', alignItems: 'flex-start',
                                            flexDirection: m.sender_label === 'doctor' ? 'row-reverse' : 'row'
                                        }}>
                                            <div style={{
                                                width: '22px', height: '22px', borderRadius: '50%',
                                                background: m.sender_label === 'doctor' ? '#1a6b5a' : '#374151',
                                                color: '#fff', fontSize: '9px', fontWeight: '700',
                                                display: 'flex', alignItems: 'center',
                                                justifyContent: 'center', flexShrink: 0
                                            }}>
                                                {m.sender_label === 'doctor' ? 'DR' : 'PT'}
                                            </div>
                                            <div style={{
                                                background: m.sender_label === 'doctor' ? '#e6f5f1' : '#f3f4f6',
                                                borderRadius: m.sender_label === 'doctor' ? '8px 0 8px 8px' : '0 8px 8px 8px',
                                                padding: '6px 10px', fontSize: '12.5px', maxWidth: '75%',
                                                color: m.sender_label === 'doctor' ? '#0f4a3d' : '#111827'
                                            }}>
                                                {m.message}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input value={msgInput} onChange={e => setMsgInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && sendMsg()}
                                        placeholder="Type a message…"
                                        style={{
                                            flex: 1, padding: '7px 11px', border: '1.5px solid #e5e7eb',
                                            borderRadius: '8px', fontSize: '13px',
                                            fontFamily: 'inherit', outline: 'none'
                                        }} />
                                    <button onClick={sendMsg} style={{
                                        padding: '7px 14px', background: '#1a6b5a',
                                        color: '#fff', border: 'none', borderRadius: '8px',
                                        cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                                        fontFamily: 'inherit'
                                    }}>Send</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Schedule Modal */}
            {showSchedule && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{
                        background: '#fff', borderRadius: '16px', padding: '28px',
                        width: '480px', maxWidth: '95vw',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', marginBottom: '20px'
                        }}>
                            <div style={{
                                fontFamily: "'Syne',sans-serif",
                                fontSize: '17px', fontWeight: '700'
                            }}>Schedule Session</div>
                            <button onClick={() => setShowSchedule(false)} style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: '20px', color: '#9ca3af'
                            }}>×</button>
                        </div>
                        <form onSubmit={handleSchedule} style={{
                            display: 'flex', flexDirection: 'column', gap: '14px'
                        }}>
                            <div style={{ position: 'relative' }}>
                                <label style={{
                                    fontSize: '11.5px', fontWeight: '600', color: '#374151',
                                    display: 'block', marginBottom: '5px'
                                }}>Patient *</label>
                                <input value={form.patient_search}
                                    onChange={e => {
                                        setForm(f => ({ ...f, patient_search: e.target.value }))
                                        patientsAPI.list({ search: e.target.value })
                                            .then(r => setPatients(r.data.results || r.data))
                                    }}
                                    placeholder="Search patient…"
                                    style={{
                                        width: '100%', padding: '8px 11px',
                                        border: '1.5px solid #e5e7eb', borderRadius: '8px',
                                        fontSize: '13.5px', fontFamily: 'inherit', outline: 'none',
                                        boxSizing: 'border-box'
                                    }} />
                                {patients.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0,
                                        border: '1px solid #e5e7eb', borderRadius: '8px',
                                        marginTop: '4px', background: '#fff',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10
                                    }}>
                                        {patients.slice(0, 4).map(p => (
                                            <div key={p.id} onClick={() => {
                                                setForm(f => ({
                                                    ...f,
                                                    patient: p.id,
                                                    patient_search: `${p.first_name} ${p.last_name}`
                                                }))
                                                setPatients([])
                                            }}
                                                style={{
                                                    padding: '9px 12px', cursor: 'pointer',
                                                    fontSize: '13px', borderBottom: '1px solid #f3f4f6'
                                                }}
                                                onMouseOver={e => e.currentTarget.style.background = '#f9fafb'}
                                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                                <strong>{p.first_name} {p.last_name}</strong>{' '}
                                                <span style={{ color: '#9ca3af' }}>{p.patient_id}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label style={{
                                    fontSize: '11.5px', fontWeight: '600', color: '#374151',
                                    display: 'block', marginBottom: '5px'
                                }}>Date & Time *</label>
                                <input type="datetime-local" value={form.scheduled_at}
                                    onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
                                    style={{
                                        width: '100%', padding: '8px 11px',
                                        border: '1.5px solid #e5e7eb', borderRadius: '8px',
                                        fontSize: '13.5px', fontFamily: 'inherit', outline: 'none',
                                        boxSizing: 'border-box'
                                    }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{
                                        fontSize: '11.5px', fontWeight: '600', color: '#374151',
                                        display: 'block', marginBottom: '5px'
                                    }}>Type</label>
                                    <select value={form.consult_type}
                                        onChange={e => setForm(f => ({ ...f, consult_type: e.target.value }))}
                                        style={{
                                            width: '100%', padding: '8px 11px',
                                            border: '1.5px solid #e5e7eb', borderRadius: '8px',
                                            fontSize: '13.5px', fontFamily: 'inherit', outline: 'none',
                                            background: '#fff'
                                        }}>
                                        <option value="video">Video Call</option>
                                        <option value="voice">Voice Call</option>
                                        <option value="async">Async / Chat</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{
                                        fontSize: '11.5px', fontWeight: '600', color: '#374151',
                                        display: 'block', marginBottom: '5px'
                                    }}>Notify Via</label>
                                    <select value={form.notify_via}
                                        onChange={e => setForm(f => ({ ...f, notify_via: e.target.value }))}
                                        style={{
                                            width: '100%', padding: '8px 11px',
                                            border: '1.5px solid #e5e7eb', borderRadius: '8px',
                                            fontSize: '13.5px', fontFamily: 'inherit', outline: 'none',
                                            background: '#fff'
                                        }}>
                                        <option value="sms_email">SMS + Email</option>
                                        <option value="sms">SMS</option>
                                        <option value="email">Email</option>
                                        <option value="whatsapp">WhatsApp</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label style={{
                                    fontSize: '11.5px', fontWeight: '600', color: '#374151',
                                    display: 'block', marginBottom: '5px'
                                }}>Chief Complaint</label>
                                <input value={form.chief_complaint}
                                    onChange={e => setForm(f => ({ ...f, chief_complaint: e.target.value }))}
                                    placeholder="Brief reason…"
                                    style={{
                                        width: '100%', padding: '8px 11px',
                                        border: '1.5px solid #e5e7eb', borderRadius: '8px',
                                        fontSize: '13.5px', fontFamily: 'inherit', outline: 'none',
                                        boxSizing: 'border-box'
                                    }} />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => setShowSchedule(false)}
                                    style={{
                                        padding: '8px 16px', border: '1px solid #e5e7eb',
                                        borderRadius: '8px', background: '#fff', cursor: 'pointer',
                                        fontSize: '13px', fontFamily: 'inherit'
                                    }}>Cancel</button>
                                <button type="submit" disabled={scheduling}
                                    style={{
                                        padding: '8px 18px', background: scheduling ? '#999' : '#1a6b5a',
                                        color: '#fff', border: 'none', borderRadius: '8px',
                                        cursor: scheduling ? 'not-allowed' : 'pointer',
                                        fontSize: '13px', fontWeight: '600', fontFamily: 'inherit'
                                    }}>
                                    {scheduling ? 'Scheduling…' : 'Schedule'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}`}</style>
        </AppLayout>
    )
}