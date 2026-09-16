// src/lib/teleRTC.js
// Minimal WebRTC client for MediCore telemedicine.
// Talks to the Django Channels TeleConsumer over ws/tele/<room>/.
// One peer is the initiator (doctor) and creates the offer; the other (patient) answers.

function wsBase() {
    const env = import.meta?.env?.VITE_TELE_WS_URL
    if (env) return env
    if (typeof window !== 'undefined' && window.location) {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        return `${proto}://${window.location.host}`
    }
    return 'ws://localhost:8080'
}

export function teleWsUrl(roomName) {
    return `${wsBase()}/ws/tele/${roomName}/`
}

const ICE = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject',
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject',
        },
    ]
}

/**
 * Establishes a peer connection + signaling socket.
 *
 * @param {object}   opts
 * @param {string}   opts.wsUrl        full ws:// url (use teleWsUrl(room))
 * @param {boolean}  opts.initiator    true for the doctor (creates the offer)
 * @param {MediaStream|null} opts.localStream  local camera/mic (may be null for chat-only)
 * @param {(stream:MediaStream)=>void} opts.onRemote   called with the remote stream
 * @param {(state:string)=>void}       opts.onStatus   'connecting' | RTCPeerConnectionState | 'disconnected'
 * @param {()=>void}                   opts.onPeerLeft called when the other side disconnects
 * @returns {{ close:()=>void, sendSignal:(obj:object)=>void }}
 */
export function createTeleRTC({ wsUrl, initiator, localStream, onRemote, onStatus, onPeerLeft }) {
    const pc = new RTCPeerConnection(ICE)
    let offering = false
    let readyAcked = false
    let closed = false

    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream))

    pc.ontrack = (e) => { if (onRemote && e.streams[0]) onRemote(e.streams[0]) }
    pc.onicecandidate = (e) => {
        if (e.candidate) send({ type: 'ice-candidate', candidate: e.candidate })
    }
    pc.onconnectionstatechange = () => { if (onStatus) onStatus(pc.connectionState) }

    const ws = new WebSocket(wsUrl)
    function send(obj) { try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)) } catch { } }

    async function makeOffer() {
        if (offering || closed) return
        offering = true
        try {
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            send({ type: 'offer', sdp: pc.localDescription })
        } catch { offering = false }
    }

    ws.onopen = () => { if (onStatus) onStatus('connecting'); send({ type: 'ready' }) }
    ws.onclose = () => { if (!closed && onStatus) onStatus('disconnected') }
    ws.onerror = () => { if (!closed && onStatus) onStatus('disconnected') }

    ws.onmessage = async (ev) => {
        let data
        try { data = JSON.parse(ev.data) } catch { return }
        switch (data.type) {
            case 'ready':
                // Bounce once so a peer that joined first still discovers a late joiner.
                if (!readyAcked) { readyAcked = true; send({ type: 'ready' }) }
                if (initiator) makeOffer()
                break
            case 'offer':
                try {
                    await pc.setRemoteDescription(data.sdp)
                    const answer = await pc.createAnswer()
                    await pc.setLocalDescription(answer)
                    send({ type: 'answer', sdp: pc.localDescription })
                } catch { }
                break
            case 'answer':
                try { await pc.setRemoteDescription(data.sdp) } catch { }
                break
            case 'ice-candidate':
                try { await pc.addIceCandidate(data.candidate) } catch { }
                break
            case 'peer-left':
            case 'peer-leave':
                if (onPeerLeft) onPeerLeft()
                break
            default:
                break
        }
    }

    return {
        sendSignal: send,
        close: () => {
            closed = true
            try { send({ type: 'mute', leaving: true }) } catch { }
            try { ws.close() } catch { }
            try { pc.getSenders().forEach(s => s.track && s.track.stop()) } catch { }
            try { pc.close() } catch { }
        },
    }
}