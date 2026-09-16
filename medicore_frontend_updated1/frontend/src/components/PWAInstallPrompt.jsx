import { useState, useEffect } from 'react'

export default function PWAInstallPrompt() {
    const [prompt, setPrompt] = useState(null)
    const [show, setShow] = useState(false)

    useEffect(() => {
        const handler = (e) => {
            e.preventDefault()
            setPrompt(e)
            setShow(true)
        }
        window.addEventListener('beforeinstallprompt', handler)
        return () => window.removeEventListener('beforeinstallprompt', handler)
    }, [])

    if (!show) return null

    return (
        <div style={{
            position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
            background: '#1a6b5a', color: '#fff', borderRadius: '12px',
            padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 9999, whiteSpace: 'nowrap',
        }}>
            <span style={{ fontSize: '13.5px', fontWeight: '500' }}>
                📲 Install MediCore for quick access
            </span>
            <button onClick={async () => { await prompt.prompt(); setShow(false) }}
                style={{ padding: '6px 14px', background: '#fff', color: '#1a6b5a', border: 'none', borderRadius: '7px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                Install
            </button>
            <button onClick={() => setShow(false)}
                style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '0 4px' }}>
                ×
            </button>
        </div>
    )
}