import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import { patientsAPI } from '../../api/patients'
import toast from 'react-hot-toast'

const Field = ({ label, value }) => (
  <div style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
    <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', marginBottom: '2px' }}>{label}</div>
    <div style={{ fontSize: '13.5px', color: value ? '#111827' : '#d1d5db', fontWeight: '500' }}>{value || '—'}</div>
  </div>
)

const INSURANCE_LABELS = { none: 'None / Self-Pay', nhis: 'NHIS', axa: 'AXA Mansard', hygeia: 'Hygeia HMO', aiico: 'AIICO', other: 'Other' }

export default function PatientDetailPage() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const [patient, setPatient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await patientsAPI.get(patientId)
        setPatient(data)
      } catch {
        toast.error('Patient not found')
        navigate('/patients')
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [patientId])

  // Lazily load the full clinical record when a data tab is first opened
  useEffect(() => {
    if ((activeTab === 'appointments' || activeTab === 'billing') && !report && !reportLoading) {
      setReportLoading(true)
      patientsAPI.report(patientId)
        .then(({ data }) => setReport(data))
        .catch(() => toast.error('Could not load records'))
        .finally(() => setReportLoading(false))
    }
  }, [activeTab, report, reportLoading, patientId])

  if (loading) return (
    <AppLayout title="Patient Detail">
      <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>Loading…</div>
    </AppLayout>
  )

  if (!patient) return null

  const initials = `${patient.first_name?.[0]||''}${patient.last_name?.[0]||''}`.toUpperCase()
  const avatarColors = ['#1a6b5a','#2563eb','#7c3aed','#dc2626','#d97706']
  const color = avatarColors[patient.patient_id?.charCodeAt(0) % avatarColors.length]

  const TABS = ['overview', 'medical history', 'appointments', 'billing']

  return (
    <AppLayout title="Patient Detail"
      action={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigate('/patients')} style={{ padding: '7px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>
            ← Back
          </button>
          <button onClick={() => navigate(`/patients/${patient.patient_id}/report`)} style={{ padding: '7px 14px', border: '1px solid #1a6b5a', borderRadius: '8px', background: '#fff', color: '#1a6b5a', cursor: 'pointer', fontSize: '13px', fontWeight: '600', fontFamily: 'inherit' }}>
            📄 Full Report
          </button>
          <button onClick={() => navigate(`/appointments/new?patient=${patient.patient_id}`)} style={{ padding: '7px 14px', background: '#1a6b5a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', fontFamily: 'inherit' }}>
            + Book Appointment
          </button>
        </div>
      }
    >
      <div style={{ maxWidth: '900px' }}>
        {/* Header card */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '22px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '700', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>
              {patient.first_name} {patient.last_name}
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12.5px', color: '#6b7280' }}>
              <span>📋 {patient.patient_id}</span>
              <span>🎂 {patient.age} years</span>
              <span>⚧ {patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : 'Other'}</span>
              <span>📞 {patient.phone}</span>
              {patient.blood_group && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '1px 8px', borderRadius: '12px', fontWeight: '700' }}>🩸 {patient.blood_group}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>Insurance</div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a6b5a' }}>
              {INSURANCE_LABELS[patient.insurance_provider] || '—'}
            </div>
            {patient.insurance_id && <div style={{ fontSize: '12px', color: '#6b7280' }}>{patient.insurance_id}</div>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', borderBottom: '2px solid #e5e7eb', marginBottom: '18px' }}>
          {TABS.map(tab => (
            <div key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '9px 16px', fontSize: '13px', fontWeight: activeTab === tab ? '600' : '500',
              color: activeTab === tab ? '#1a6b5a' : '#6b7280',
              borderBottom: activeTab === tab ? '2px solid #1a6b5a' : '2px solid transparent',
              marginBottom: '-2px', cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.15s',
            }}>{tab}</div>
          ))}
        </div>

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '18px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Personal Details</div>
              <Field label="Full Name" value={`${patient.first_name} ${patient.last_name}`} />
              <Field label="Date of Birth" value={patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' }) : null} />
              <Field label="Phone" value={patient.phone} />
              <Field label="Email" value={patient.email} />
              <Field label="Address" value={patient.address} />
            </div>
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '18px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Medical Info</div>
              <Field label="Blood Group" value={patient.blood_group} />
              <Field label="Genotype" value={patient.genotype} />
              <Field label="Known Allergies" value={patient.allergies} />
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '16px', marginBottom: '4px' }}>Emergency Contact</div>
              <Field label="Name" value={patient.emergency_name} />
              <Field label="Relationship" value={patient.emergency_relationship} />
              <Field label="Phone" value={patient.emergency_phone} />
            </div>
          </div>
        )}

        {/* Medical history tab */}
        {activeTab === 'medical history' && (
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
            {patient.medical_history ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {[
                  ['Chronic Conditions', patient.medical_history.chronic_conditions],
                  ['Past Surgeries', patient.medical_history.past_surgeries],
                  ['Family History', patient.medical_history.family_history],
                  ['Current Medications', patient.medical_history.current_medications],
                  ['Vaccination History', patient.medical_history.vaccination_history],
                  ['Notes', patient.medical_history.notes],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{label}</div>
                    <div style={{ fontSize: '13.5px', color: value ? '#111827' : '#d1d5db', background: '#f9fafb', borderRadius: '8px', padding: '10px 12px', minHeight: '48px' }}>
                      {value || 'None recorded'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>No medical history recorded</div>
            )}
          </div>
        )}

        {/* Appointments tab — live */}
        {activeTab === 'appointments' && (
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '18px 20px' }}>
            {reportLoading ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>Loading…</div>
            ) : !report?.appointments?.length ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>No appointments on record.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Date', 'Type', 'Doctor', 'Complaint', 'Status'].map(h => (
                  <th key={h} style={{ padding: '9px 11px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}</tr></thead>
                <tbody>{report.appointments.map((a, i) => (
                  <tr key={i}>
                    <td style={{ padding: '10px 11px', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}>{a.date}</td>
                    <td style={{ padding: '10px 11px', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}>{a.type}</td>
                    <td style={{ padding: '10px 11px', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}>{a.doctor}</td>
                    <td style={{ padding: '10px 11px', borderBottom: '1px solid #f3f4f6', fontSize: '12.5px', color: '#6b7280' }}>{a.chief_complaint || '—'}</td>
                    <td style={{ padding: '10px 11px', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: a.status === 'completed' ? '#f0fdf4' : a.status === 'cancelled' ? '#fef2f2' : '#eff6ff', color: a.status === 'completed' ? '#16a34a' : a.status === 'cancelled' ? '#dc2626' : '#2563eb' }}>{a.status_label}</span>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}

        {/* Billing tab — live */}
        {activeTab === 'billing' && (
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '18px 20px' }}>
            {reportLoading ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>Loading…</div>
            ) : !report?.invoices?.length ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>No invoices on record.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Invoice', 'Date', 'Total', 'Paid', 'Balance', 'Status'].map(h => (
                  <th key={h} style={{ padding: '9px 11px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}</tr></thead>
                <tbody>{report.invoices.map((v, i) => (
                  <tr key={i}>
                    <td style={{ padding: '10px 11px', borderBottom: '1px solid #f3f4f6', fontSize: '12.5px', fontFamily: 'monospace' }}>{v.invoice_number}</td>
                    <td style={{ padding: '10px 11px', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}>{v.date}</td>
                    <td style={{ padding: '10px 11px', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}>₦{v.total.toLocaleString()}</td>
                    <td style={{ padding: '10px 11px', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}>₦{v.paid.toLocaleString()}</td>
                    <td style={{ padding: '10px 11px', borderBottom: '1px solid #f3f4f6', fontSize: '13px', fontWeight: '600', color: v.balance > 0 ? '#dc2626' : '#16a34a' }}>₦{v.balance.toLocaleString()}</td>
                    <td style={{ padding: '10px 11px', borderBottom: '1px solid #f3f4f6', fontSize: '13px', textTransform: 'capitalize' }}>{v.status}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
