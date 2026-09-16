import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import { patientsAPI } from '../../api/patients'
import toast from 'react-hot-toast'

const Input = ({ label, required, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#374151' }}>
      {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
    </label>
    <input {...props} style={{
      padding: '8px 11px', border: '1.5px solid #e5e7eb', borderRadius: '8px',
      fontSize: '13.5px', fontFamily: 'inherit', outline: 'none', transition: 'border 0.15s',
      ...(props.style || {})
    }}
      onFocus={e => e.target.style.borderColor = '#1a6b5a'}
      onBlur={e => e.target.style.borderColor = '#e5e7eb'}
    />
  </div>
)

const Select = ({ label, required, children, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#374151' }}>
      {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
    </label>
    <select {...props} style={{
      padding: '8px 11px', border: '1.5px solid #e5e7eb', borderRadius: '8px',
      fontSize: '13.5px', fontFamily: 'inherit', outline: 'none', background: '#fff',
    }}>{children}</select>
  </div>
)

const Section = ({ title, children }) => (
  <div style={{ marginBottom: '24px' }}>
    <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px', paddingBottom: '8px', borderBottom: '1px solid #e5e7eb' }}>
      {title}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
      {children}
    </div>
  </div>
)

export default function RegisterPatientPage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    first_name: '', last_name: '', date_of_birth: '', gender: '',
    phone: '', email: '', address: '',
    blood_group: '', genotype: '', allergies: '',
    insurance_provider: 'none', insurance_id: '', hmo_plan: '',
    emergency_name: '', emergency_relationship: '', emergency_phone: '',
  })

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.first_name || !form.last_name || !form.date_of_birth || !form.gender || !form.phone) {
      toast.error('Please fill in all required fields')
      return
    }
    setSubmitting(true)
    try {
      const { data } = await patientsAPI.create(form)
      toast.success(`Patient registered! ID: ${data.patient_id}`)
      navigate(`/patients/${data.patient_id}`)
    } catch (err) {
      const msg = err.response?.data ? JSON.stringify(err.response.data) : 'Registration failed'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppLayout title="Register Patient"
      action={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigate('/patients')} style={{ padding: '7px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting} style={{ padding: '7px 16px', background: submitting ? '#9ca3af' : '#1a6b5a', color: '#fff', border: 'none', borderRadius: '8px', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600', fontFamily: 'inherit' }}>
            {submitting ? 'Registering…' : 'Register Patient'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ maxWidth: '760px' }}>
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '16px' }}>
          <Section title="Personal Information">
            <Input label="First Name" required value={form.first_name} onChange={set('first_name')} placeholder="e.g. Amara" />
            <Input label="Last Name" required value={form.last_name} onChange={set('last_name')} placeholder="e.g. Mensah" />
            <Input label="Date of Birth" required type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
            <Select label="Gender" required value={form.gender} onChange={set('gender')}>
              <option value="">Select gender</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </Select>
            <Input label="Phone Number" required value={form.phone} onChange={set('phone')} placeholder="+234 800 000 0000" />
            <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="patient@email.com" />
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: '600', color: '#374151' }}>Address</label>
                <textarea value={form.address} onChange={set('address')} placeholder="Street, city, state…"
                  style={{ padding: '8px 11px', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '13.5px', fontFamily: 'inherit', outline: 'none', minHeight: '70px', resize: 'vertical' }}
                  onFocus={e => e.target.style.borderColor = '#1a6b5a'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>
            </div>
          </Section>
        </div>

        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '16px' }}>
          <Section title="Medical Information">
            <Select label="Blood Group" value={form.blood_group} onChange={set('blood_group')}>
              <option value="">Unknown</option>
              {['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(b => <option key={b} value={b}>{b}</option>)}
            </Select>
            <Select label="Genotype" value={form.genotype} onChange={set('genotype')}>
              <option value="">Unknown</option>
              {['AA','AS','SS','AC'].map(g => <option key={g} value={g}>{g}</option>)}
            </Select>
            <div style={{ gridColumn: '1 / -1' }}>
              <Input label="Known Allergies" value={form.allergies} onChange={set('allergies')} placeholder="e.g. Penicillin, Sulpha drugs (comma separated)" />
            </div>
          </Section>
        </div>

        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '24px', marginBottom: '16px' }}>
          <Section title="Insurance">
            <Select label="Insurance Provider" value={form.insurance_provider} onChange={set('insurance_provider')}>
              <option value="none">None / Self-Pay</option>
              <option value="nhis">NHIS</option>
              <option value="axa">AXA Mansard</option>
              <option value="hygeia">Hygeia HMO</option>
              <option value="aiico">AIICO</option>
              <option value="other">Other</option>
            </Select>
            <Input label="Insurance ID" value={form.insurance_id} onChange={set('insurance_id')} placeholder="e.g. NHIS-00234456" />
            <Select label="HMO Plan" value={form.hmo_plan} onChange={set('hmo_plan')}>
              <option value="">Select plan</option>
              <option value="Gold">Gold</option>
              <option value="Silver">Silver</option>
              <option value="Bronze">Bronze</option>
            </Select>
          </Section>
        </div>

        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '24px' }}>
          <Section title="Emergency Contact">
            <Input label="Contact Name" value={form.emergency_name} onChange={set('emergency_name')} placeholder="Full name" />
            <Select label="Relationship" value={form.emergency_relationship} onChange={set('emergency_relationship')}>
              <option value="">Select</option>
              <option value="Spouse">Spouse</option>
              <option value="Parent">Parent</option>
              <option value="Sibling">Sibling</option>
              <option value="Child">Child</option>
              <option value="Other">Other</option>
            </Select>
            <Input label="Contact Phone" value={form.emergency_phone} onChange={set('emergency_phone')} placeholder="+234 800 000 0000" />
          </Section>
        </div>
      </form>
    </AppLayout>
  )
}
