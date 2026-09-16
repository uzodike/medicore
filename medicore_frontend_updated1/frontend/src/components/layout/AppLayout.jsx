import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'
import { notificationsAPI } from '../../api/notifications'


const NAV = [
    { label: 'Dashboard', path: '/dashboard', roles: null, icon: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z' },
    { label: 'Patients', path: '/patients', roles: ['admin', 'doctor', 'nurse', 'receptionist'], icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 4a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
    { label: 'Appointments', path: '/appointments', roles: ['admin', 'doctor', 'nurse', 'receptionist'], icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
    { label: 'Telemedicine', path: '/telemedicine', roles: ['admin', 'doctor', 'receptionist'], icon: 'M15 10l4.553-2.069A1 1 0 0 1 21 8.87v6.26a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z' },
    { label: 'Billing', path: '/billing', roles: ['admin', 'receptionist'], icon: 'M1 4h22v16H1zM1 10h22' },
    { label: 'Pharmacy', path: '/pharmacy', roles: ['admin', 'pharmacist'], icon: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM12 8v8M8 12h8' },
    { label: 'Lab', path: '/lab', roles: ['admin', 'lab_tech', 'radiologist'], icon: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11l-3 7h12l-3-7V3' },
    { label: 'Nursing', path: '/nursing', roles: ['admin', 'nurse'], icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
    { label: 'Doctor', path: '/doctor', roles: ['admin', 'doctor'], icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
    { label: 'Maternity/ANC', path: '/maternity', roles: ['admin', 'doctor', 'nurse'], icon: 'M12 21C7 17 3 13.5 3 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 9 2.5c0 4-4 7.5-9 11.5z' },
    { label: 'IPD', path: '/ipd', roles: ['admin', 'nurse', 'doctor'], icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { label: 'Activity', path: '/activity', roles: ['admin'], icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
]

function useIsMobile(breakpoint = 900) {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
    )
    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < breakpoint)
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [breakpoint])
    return isMobile
}

function NotificationBell({ active }) {
    const [open, setOpen] = useState(false)
    const [items, setItems] = useState([])
    const [count, setCount] = useState(0)
    const boxRef = useRef(null)

    const stoppedRef = useRef(false)
    const load = useCallback(() => {
        if (!active || stoppedRef.current) return
        notificationsAPI.unreadCount()
            .then(r => setCount(r.data?.count || 0))
            .catch(e => { if (e?.response?.status === 401) stoppedRef.current = true })
    }, [active])
    useEffect(() => {
        if (!active) return
        stoppedRef.current = false
        load()
        const id = setInterval(load, 30000)
        return () => clearInterval(id)
    }, [active, load])

    useEffect(() => {
        if (!open) return
        notificationsAPI.list().then(r => setItems((Array.isArray(r.data) ? r.data : (r.data?.results || [])).slice(0, 12))).catch(() => { })
        const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [open])

    const readAll = async () => {
        try { await notificationsAPI.markAllRead(); setCount(0); setItems(list => list.map(i => ({ ...i, is_read: true }))) } catch { }
    }
    const icon = (c) => c === 'lab' ? '🧪' : c === 'pharmacy' ? '💊' : c === 'admission' ? '🛏️' : c === 'billing' ? '💳' : '🔔'
    const isMobile = useIsMobile()

    return (
        <div ref={boxRef} style={{ position: 'relative' }}>
            <button onClick={() => setOpen(o => !o)} style={{
                position: 'relative', width: '36px', height: '36px', borderRadius: '10px',
                border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '16px',
            }}>
                🔔
                {count > 0 && <span style={{
                    position: 'absolute', top: '-5px', right: '-5px', minWidth: '17px', height: '17px',
                    borderRadius: '9px', background: '#dc2626', color: '#fff', fontSize: '10px', fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                }}>{count > 99 ? '99+' : count}</span>}
            </button>
            {open && (
                <div style={isMobile ? {
                    position: 'fixed', top: '56px', left: '10px', right: '10px', zIndex: 200,
                    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px',
                    boxShadow: '0 16px 48px rgba(0,0,0,0.16)', overflow: 'hidden', width: 'auto',
                } : {
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '340px', zIndex: 200,
                    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px',
                    boxShadow: '0 16px 48px rgba(0,0,0,0.16)', overflow: 'hidden',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #e5e7eb' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700 }}>Notifications</span>
                        <button onClick={readAll} style={{ background: 'none', border: 'none', color: '#1a6b5a', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}>Mark all read</button>
                    </div>
                    <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                        {items.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '26px', color: '#9ca3af', fontSize: '12.5px' }}>No notifications yet.</div>
                        ) : items.map(n => (
                            <div key={n.id} style={{ display: 'flex', gap: '10px', padding: '10px 14px', borderBottom: '1px solid #f3f4f6', background: n.is_read ? '#fff' : '#eff6ff' }}>
                                <span style={{ fontSize: '15px' }}>{icon(n.category)}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '12.5px', fontWeight: 700 }}>{n.title}</div>
                                    <div style={{ fontSize: '11.5px', color: '#6b7280' }}>{n.message}</div>
                                    <div style={{ fontSize: '10.5px', color: '#9ca3af', marginTop: '2px' }}>{new Date(n.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export default function AppLayout({ children, title, action }) {
    const { user, logout } = useAuthStore()
    const navigate = useNavigate()
    const location = useLocation()
    const isMobile = useIsMobile()
    const [sidebarOpen, setSidebarOpen] = useState(false)

    const initials = user ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() : '?'

    // Close the mobile drawer automatically whenever the route changes,
    // so tapping a nav item both navigates AND dismisses the overlay.
    useEffect(() => { setSidebarOpen(false) }, [location.pathname])

    const handleLogout = async () => {
        await logout()
        toast.success('Logged out')
        navigate('/login')
    }

    return (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif", position: 'relative' }}>
            {/* Backdrop overlay — only rendered on mobile while the drawer is open */}
            {isMobile && sidebarOpen && (
                <div
                    onClick={() => setSidebarOpen(false)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 90,
                    }}
                />
            )}

            {/* Sidebar */}
            <aside style={{
                width: '220px', minWidth: '220px', background: '#0e2a24',
                display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto',
                ...(isMobile ? {
                    position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100,
                    transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
                    transition: 'transform 0.22s ease',
                    boxShadow: sidebarOpen ? '0 0 32px rgba(0,0,0,0.35)' : 'none',
                } : {}),
            }}>
                {/* Logo */}
                <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: '#2a8f76', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: '15px', fontWeight: '700', color: '#fff' }}>MediCore</div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>HMS v1.0</div>
                    </div>
                    {isMobile && (
                        <button onClick={() => setSidebarOpen(false)} style={{
                            background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: '4px',
                        }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </button>
                    )}
                </div>

                {/* Nav */}
                <nav style={{ padding: '10px 8px', flex: 1 }}>
                    {NAV.filter(({ roles }) => !roles || roles.includes(user?.role)).map(({ label, path, icon }) => {
                        const active = location.pathname.startsWith(path)
                        return (
                            <div key={path} onClick={() => navigate(path)} style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '8px 12px', margin: '1px 0', borderRadius: '8px', cursor: 'pointer',
                                background: active ? '#2a6b5a' : 'transparent',
                                color: active ? '#fff' : 'rgba(255,255,255,0.55)',
                                fontSize: '13px', fontWeight: active ? '500' : '400',
                                transition: 'all 0.15s',
                            }}
                                onMouseOver={e => { if (!active) e.currentTarget.style.background = '#1a3d33'; if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.85)' }}
                                onMouseOut={e => { if (!active) e.currentTarget.style.background = 'transparent'; if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                                    <path d={icon} />
                                </svg>
                                {label}
                            </div>
                        )
                    })}
                </nav>

                {/* User */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#2a8f76', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: '#fff', flexShrink: 0 }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: '500', color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.first_name} {user?.last_name}</div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{user?.role}</div>
                    </div>
                    <div onClick={handleLogout} title="Sign out" style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '4px' }}
                        onMouseOver={e => e.currentTarget.style.color = '#fff'}
                        onMouseOut={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                    </div>
                </div>
            </aside>

            {/* Main */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
                {/* Topbar */}
                <div style={{
                    background: '#fff', borderBottom: '1px solid #e5e7eb',
                    padding: isMobile ? '0 12px' : '0 24px', height: '56px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: '10px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        {isMobile && (
                            <button onClick={() => setSidebarOpen(true)} style={{
                                background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px',
                                width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', flexShrink: 0, color: '#111827',
                            }}>
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
                            </button>
                        )}
                        <div style={{
                            fontFamily: "'Syne',sans-serif", fontSize: isMobile ? '14.5px' : '16px', fontWeight: '700',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{title}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '10px', flexShrink: 0 }}>
                        {action && action}
                        <NotificationBell active={!!user} />
                    </div>
                </div>
                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 12px' : '22px 24px', background: '#f4f6f8' }}>
                    {children}
                </div>
            </div>
        </div>
    )
}