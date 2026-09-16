import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { teleAPI } from '../../api/telemedicine'
import { createTeleRTC, teleWsUrl } from '../../lib/teleRTC'

const Shell = ({ children }) => (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0e2a24,#1a6b5a)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "'DM Sans',sans-serif" }}>
        <div style={{ width: '100%', maxWidth: '460px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', marginBottom: '18px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                </div>
                <span style={{ fontFamily: "'Syne',sans-serif", fontSize: '19px', fontWeight: '700', color: '#fff' }}>MediCore</span>
            </div>
            <div style={{ background: '#fff', borderRadius: '18px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
                {children}
            </div>
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '11.5px', marginTop: '14px' }}>
                Secure telemedicine · Do not share this link
            </div>
        </div>
    </div>
)

export default function JoinSessionPage() {
    const { token } = useParams()
    const [data, setData] = useState(null)
    const [error, setError] = useState(null)
    const [loading, setLoading] = useState(true)
    const [joined, setJoined] = useState(false)
    const [camOn, setCamOn] = useState(true)
    const [micOn, setMicOn] = useState(true)
    const [peerState, setPeerState] = useState('connecting')
    const videoRef = useRef(null)
    const remoteRef = useRef(null)
    const streamRef = useRef(null)
    const remoteStream = useRef(null)
    const rtcRef = useRef(null)

    const fetchSession = useCallback(() => {
        teleAPI.joinByToken(token)
            .then(({ data }) => { setData(data); setError(null) })
            .catch((e) => setError(e.response?.data?.detail || 'This link is invalid or has expired.'))
            .finally(() => setLoading(false))
    }, [token])

    useEffect(() => { fetchSession() }, [fetchSession])

    // poll status every 6s until joined
    useEffect(() => {
        if (joined) return
        const id = setInterval(fetchSession, 6000)
        return () => clearInterval(id)
    }, [joined, fetchSession])

    // start local media + WebRTC (patient = answerer) when joined
    useEffect(() => {
        if (!joined) return
        let cancelled = false
        const room = data?.room_name || data?.session?.room_name
        navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
            .then(stream => {
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
                streamRef.current = stream
                if (videoRef.current) videoRef.current.srcObject = stream

                if (room) {
                    rtcRef.current = createTeleRTC({
                        wsUrl: teleWsUrl(room),
                        initiator: false,
                        localStream: stream,
                        onRemote: (rs) => { remoteStream.current = rs; if (remoteRef.current) remoteRef.current.srcObject = rs; setPeerState('connected') },
                        onStatus: (st) => { if (st === 'connected') setPeerState('connected'); else if (st === 'failed' || st === 'disconnected') setPeerState('disconnected') },
                        onPeerLeft: () => { setPeerState('left'); remoteStream.current = null; if (remoteRef.current) remoteRef.current.srcObject = null },
                    })
                }
            })
            .catch(() => { })
        return () => {
            cancelled = true
            rtcRef.current?.close()
            streamRef.current?.getTracks().forEach(t => t.stop())
        }
    }, [joined, data])

    const toggleMic = () => { const t = streamRef.current?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; setMicOn(t.enabled) } }
    const toggleCam = () => { const t = streamRef.current?.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; setCamOn(t.enabled) } }

    if (loading) return <Shell><div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>Loading your session…</div></Shell>

    if (error) return (
        <Shell>
            <div style={{ textAlign: 'center', padding: '10px' }}>
                <div style={{ fontSize: '34px', marginBottom: '10px' }}>🔒</div>
                <div style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>Can't open this session</div>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>{error}</div>
            </div>
        </Shell>
    )

    const s = data.session
    const p = s.patient_detail
    const pName = p ? `${p.first_name} ${p.last_name}` : 'Patient'
    const docName = s.doctor_detail ? `Dr. ${s.doctor_detail.first_name} ${s.doctor_detail.last_name}` : 'your doctor'
    const when = new Date(s.scheduled_at).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    const isLive = s.status === 'live'

    // Joined view — doctor's video (main) + patient self-preview (PiP)
    if (joined) return (
        <Shell>
            <div style={{ textAlign: 'center' }}>
                <div style={{ background: '#0e2a24', borderRadius: '14px', overflow: 'hidden', position: 'relative', height: '240px', marginBottom: '14px' }}>
                    <video ref={remoteRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#0e2a24', opacity: peerState === 'connected' ? 1 : 0 }} />
                    {peerState !== 'connected' && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.7)', fontSize: '13px', gap: '4px' }}>
                            <div style={{ fontSize: '26px' }}>🩺</div>
                            {peerState === 'left' ? `${docName} left the call` : peerState === 'disconnected' ? 'Reconnecting…' : `Waiting for ${docName}…`}
                        </div>
                    )}
                    {/* patient self-preview */}
                    <div style={{ position: 'absolute', bottom: '10px', right: '10px', width: '92px', height: '64px', borderRadius: '9px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.25)', background: '#000' }}>
                        <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                        {!camOn && <div style={{ position: 'absolute', inset: 0, background: '#1a3d33', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>Off</div>}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '14px' }}>
                    <button onClick={toggleMic} style={joinCtrl(micOn)}>{micOn ? '🎙' : '🔇'}</button>
                    <button onClick={toggleCam} style={joinCtrl(camOn)}>{camOn ? '🎥' : '📷'}</button>
                </div>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>
                    {peerState === 'connected' ? `You're connected with ${docName}` : isLive ? `${docName} is in the room — connecting…` : 'Waiting for your doctor to start the session…'}
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                    {peerState === 'connected' ? 'You are live.' : 'Please keep this window open — it will connect automatically.'}
                </div>
            </div>
        </Shell>
    )

    // Pre-join lobby
    return (
        <Shell>
            <div style={{ textAlign: 'center', marginBottom: '18px' }}>
                <div style={{ fontSize: '13px', color: '#9ca3af' }}>Telemedicine appointment</div>
                <div style={{ fontSize: '20px', fontWeight: '700', fontFamily: "'Syne',sans-serif", marginTop: '2px' }}>Hello, {pName}</div>
            </div>
            <div style={{ background: '#f4f6f8', borderRadius: '12px', padding: '14px 16px', marginBottom: '18px' }}>
                {[['Doctor', docName], ['Scheduled', when], ['Type', s.consult_type], ['Session', s.session_id]].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '13px' }}>
                        <span style={{ color: '#6b7280' }}>{l}</span>
                        <span style={{ fontWeight: '600', textTransform: l === 'Type' ? 'capitalize' : 'none' }}>{v}</span>
                    </div>
                ))}
            </div>
            <div style={{ background: isLive ? '#f0fdf4' : '#fffbeb', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px', fontSize: '12.5px', color: isLive ? '#16a34a' : '#854d0e', textAlign: 'center', fontWeight: '600' }}>
                {isLive ? '🟢 Your doctor has started the session' : '🟡 The session has not started yet — you can join the waiting room'}
            </div>
            <button onClick={() => setJoined(true)} style={{ width: '100%', padding: '12px', background: '#1a6b5a', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '700', fontFamily: 'inherit' }}>
                {isLive ? '🎥 Join Session Now' : 'Enter Waiting Room'}
            </button>
            <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', marginTop: '10px' }}>
                Your camera and microphone will be requested when you join.
            </div>
        </Shell>
    )
}

function joinCtrl(on) {
    return { width: '44px', height: '44px', borderRadius: '50%', border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: '17px', background: on ? '#fff' : '#f3f4f6' }
}