import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import { teleAPI } from '../../api/telemedicine'
import { createTeleRTC, teleWsUrl } from '../../lib/teleRTC'
import toast from 'react-hot-toast'

export default function SessionRoomPage() {
    const { sessionId } = useParams()
    const navigate = useNavigate()
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [messages, setMessages] = useState([])
    const [draft, setDraft] = useState('')
    const [micOn, setMicOn] = useState(true)
    const [camOn, setCamOn] = useState(true)
    const [elapsed, setElapsed] = useState(0)
    const [ending, setEnding] = useState(false)
    const [peerState, setPeerState] = useState('connecting') // connecting | connected | disconnected | left

    // video refs
    const localVideoRef = useRef(null)  // doctor's own camera (PiP)
    const remoteVideoRef = useRef(null)  // patient's stream (main)
    const streamRef = useRef(null)
    const rtcRef = useRef(null)
    const chatEndRef = useRef(null)

    // ── load session ───────────────────────────────────────────────
    useEffect(() => {
        teleAPI.get(sessionId)
            .then(({ data }) => setSession(data))
            .catch(() => { toast.error('Session not found'); navigate('/appointments') })
            .finally(() => setLoading(false))
    }, [sessionId, navigate])

    // ── start local media + WebRTC (doctor = initiator) ───────────
    useEffect(() => {
        if (!session) return
        const room = session.room_name
        if (!room) return

        let cancelled = false

        navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
            .then(stream => {
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
                streamRef.current = stream
                if (localVideoRef.current) localVideoRef.current.srcObject = stream

                rtcRef.current = createTeleRTC({
                    wsUrl: teleWsUrl(room),
                    initiator: true,          // doctor always creates the offer
                    localStream: stream,
                    onRemote: (rs) => {
                        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = rs
                        setPeerState('connected')
                    },
                    onStatus: (st) => {
                        if (st === 'connected') setPeerState('connected')
                        else if (st === 'failed' || st === 'disconnected') setPeerState('disconnected')
                    },
                    onPeerLeft: () => {
                        setPeerState('left')
                        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
                    },
                })
            })
            .catch(() => toast.error('Camera/microphone unavailable — check browser permissions'))

        return () => {
            cancelled = true
            rtcRef.current?.close()
            streamRef.current?.getTracks().forEach(t => t.stop())
        }
    }, [session])

    // ── session timer ──────────────────────────────────────────────
    useEffect(() => {
        if (!session?.started_at) return
        const start = new Date(session.started_at).getTime()
        const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
        return () => clearInterval(id)
    }, [session?.started_at])

    // ── chat polling ───────────────────────────────────────────────
    const loadMessages = useCallback(() => {
        teleAPI.messages(sessionId)
            .then(({ data }) => setMessages(data.results || data))
            .catch(() => { })
    }, [sessionId])

    useEffect(() => {
        loadMessages()
        const id = setInterval(loadMessages, 4000)
        return () => clearInterval(id)
    }, [loadMessages])

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

    // ── controls ───────────────────────────────────────────────────
    const toggleMic = () => {
        const t = streamRef.current?.getAudioTracks()[0]
        if (t) { t.enabled = !t.enabled; setMicOn(t.enabled) }
    }
    const toggleCam = () => {
        const t = streamRef.current?.getVideoTracks()[0]
        if (t) { t.enabled = !t.enabled; setCamOn(t.enabled) }
    }

    const send = async () => {
        if (!draft.trim()) return
        const text = draft.trim()
        setDraft('')
        try {
            await teleAPI.sendMessage(sessionId, { sender_label: 'doctor', message: text })
            loadMessages()
        } catch { toast.error('Message failed'); setDraft(text) }
    }

    const endSession = async () => {
        const outcome = window.prompt('Session outcome / summary (optional):', '')
        if (outcome === null) return
        setEnding(true)
        try {
            await teleAPI.end(sessionId, { clinical_notes: outcome, outcome: outcome ? 'completed' : '' })
            rtcRef.current?.close()
            streamRef.current?.getTracks().forEach(t => t.stop())
            toast.success('Session ended')
            navigate('/appointments')
        } catch { toast.error('Could not end session') }
        finally { setEnding(false) }
    }

    const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

    if (loading) return (
        <AppLayout title="Session">
            <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>Loading session…</div>
        </AppLayout>
    )
    if (!session) return null

    const p = session.patient_detail
    const pName = p ? `${p.first_name} ${p.last_name}` : 'Patient'
    const pInit = p ? `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase() : 'P'

    const peerMsg = {
        connecting: `Waiting for ${pName} to connect…`,
        connected: `Connected with ${pName}`,
        disconnected: 'Patient disconnected — reconnecting…',
        left: `${pName} left the call`,
    }[peerState] || 'Connecting…'

    return (
        <AppLayout title="Telemedicine Session"
            action={
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6b7280' }}>
                        <span style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: peerState === 'connected' ? '#16a34a' : session.status === 'live' ? '#d97706' : '#9ca3af'
                        }} />
                        {peerState === 'connected' ? `Live · ${fmt(elapsed)}` : session.status}
                    </span>
                    <button onClick={() => navigate('/appointments')} style={{
                        padding: '7px 14px', border: '1px solid #e5e7eb', borderRadius: '8px',
                        background: '#fff', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit'
                    }}>← Back</button>
                </div>
            }>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', height: 'calc(100vh - 140px)' }}>

                {/* ── Main video area ── */}
                <div style={{
                    background: '#0e2a24', borderRadius: '16px', position: 'relative',
                    overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    {/* Patient's remote video — main feed */}
                    <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        style={{
                            position: 'absolute', inset: 0, width: '100%', height: '100%',
                            objectFit: 'cover',
                            opacity: peerState === 'connected' ? 1 : 0,
                            transition: 'opacity .3s'
                        }}
                    />

                    {/* Placeholder shown until patient connects */}
                    {peerState !== 'connected' && (
                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', zIndex: 1 }}>
                            <div style={{
                                width: '92px', height: '92px', borderRadius: '50%',
                                background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', fontSize: '34px', fontWeight: '700', color: '#fff',
                                margin: '0 auto 14px'
                            }}>{pInit}</div>
                            <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff' }}>{pName}</div>
                            <div style={{ fontSize: '13px', marginTop: '6px' }}>{peerMsg}</div>
                            <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.5 }}>Room: {session.room_name}</div>
                        </div>
                    )}

                    {/* Doctor's self-preview (PiP bottom-right) */}
                    <div style={{
                        position: 'absolute', bottom: '72px', right: '16px',
                        width: '180px', height: '120px', borderRadius: '12px',
                        overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)', background: '#000',
                        zIndex: 2
                    }}>
                        <video
                            ref={localVideoRef}
                            autoPlay muted playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                        />
                        {!camOn && (
                            <div style={{
                                position: 'absolute', inset: 0, background: '#1a3d33',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'rgba(255,255,255,0.6)', fontSize: '12px'
                            }}>Camera off</div>
                        )}
                        <div style={{
                            position: 'absolute', bottom: 4, left: 0, right: 0,
                            textAlign: 'center', fontSize: '10px', color: 'rgba(255,255,255,0.6)'
                        }}>You</div>
                    </div>

                    {/* Controls bar */}
                    <div style={{
                        position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
                        display: 'flex', gap: '10px', zIndex: 2
                    }}>
                        <button onClick={toggleMic} title="Toggle mic" style={ctrlBtn(micOn)}>
                            {micOn ? '🎙' : '🔇'}
                        </button>
                        <button onClick={toggleCam} title="Toggle camera" style={ctrlBtn(camOn)}>
                            {camOn ? '🎥' : '📷'}
                        </button>
                        <button onClick={endSession} disabled={ending} title="End session"
                            style={{ ...ctrlBtn(true), background: '#dc2626', width: 'auto', padding: '0 18px', color: '#fff' }}>
                            {ending ? 'Ending…' : '⏹ End'}
                        </button>
                    </div>
                </div>

                {/* ── Chat panel ── */}
                <div style={{
                    background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden'
                }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: '13px', fontWeight: '700' }}>Chat · {session.session_id}</div>
                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                            {peerState === 'connected'
                                ? `🟢 ${pName} is connected`
                                : `🟡 ${peerMsg}`}
                        </div>
                    </div>
                    <div style={{
                        flex: 1, overflowY: 'auto', padding: '14px 16px',
                        display: 'flex', flexDirection: 'column', gap: '8px'
                    }}>
                        {messages.length === 0
                            ? <div style={{ color: '#9ca3af', fontSize: '13px', textAlign: 'center', marginTop: '20px' }}>No messages yet.</div>
                            : messages.map((m, i) => {
                                const mine = m.sender_label === 'doctor'
                                return (
                                    <div key={m.id || i} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                                        <div style={{
                                            background: mine ? '#1a6b5a' : '#f3f4f6',
                                            color: mine ? '#fff' : '#111827',
                                            padding: '8px 11px', borderRadius: '12px', fontSize: '13px'
                                        }}>{m.message}</div>
                                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px', textAlign: mine ? 'right' : 'left' }}>
                                            {m.sender_label}
                                        </div>
                                    </div>
                                )
                            })
                        }
                        <div ref={chatEndRef} />
                    </div>
                    <div style={{ padding: '12px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '8px' }}>
                        <input
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && send()}
                            placeholder="Type a message…"
                            style={{
                                flex: 1, padding: '8px 11px', border: '1.5px solid #e5e7eb',
                                borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', outline: 'none'
                            }}
                        />
                        <button onClick={send} style={{
                            padding: '8px 14px', background: '#1a6b5a', color: '#fff',
                            border: 'none', borderRadius: '8px', cursor: 'pointer',
                            fontSize: '13px', fontWeight: '600'
                        }}>Send</button>
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}

function ctrlBtn(on) {
    return {
        width: '46px', height: '46px', borderRadius: '50%', border: 'none',
        cursor: 'pointer', fontSize: '18px',
        background: on ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    }
}