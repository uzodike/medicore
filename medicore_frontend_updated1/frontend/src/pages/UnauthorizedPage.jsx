import { useNavigate } from 'react-router-dom'

export default function UnauthorizedPage() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>🔒</div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>Access Denied</div>
        <div style={{ color: '#6b7280', marginBottom: '24px' }}>You don't have permission to view this page.</div>
        <button onClick={() => navigate('/dashboard')} style={{
          padding: '10px 24px', background: '#1a6b5a', color: '#fff',
          border: 'none', borderRadius: '10px', cursor: 'pointer',
          fontSize: '14px', fontWeight: '600', fontFamily: 'inherit',
        }}>Go to Dashboard</button>
      </div>
    </div>
  )
}
