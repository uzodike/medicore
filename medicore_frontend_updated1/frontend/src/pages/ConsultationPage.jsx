import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import { onVitalsReceived } from '../utils/vitals/vitalsChannel'

export default function ConsultationPage() {
  const { patientId } = useParams()
  const [vitals, setVitals] = useState([])

  useEffect(() => {
    const unsubscribe = onVitalsReceived((newVital) => {
      // Only show vitals belonging to the current patient
      if (newVital.patientId === patientId) {
        setVitals(prev => [newVital, ...prev])
      }
    })
    return unsubscribe
  }, [patientId])

  return (
    <AppLayout title="Patient Vitals (Real‑time)">
      {vitals.length === 0 ? (
        <div style={{ padding:'48px', textAlign:'center', color:'#9ca3af' }}>
          No vitals recorded yet for this patient.
        </div>
      ) : (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid #e5e7eb' }}>
              {['Time','BP','HR','Temp','SpO₂','Sugar','Notes'].map(h => (
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'11px', fontWeight:'700', color:'#6b7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vitals.map((v, i) => (
              <tr key={i} style={{ borderBottom:i<vitals.length-1?'1px solid #f3f4f6':'none' }}>
                <td>{new Date(v.recordedAt).toLocaleTimeString()}</td>
                <td>{v.systolic_bp}/{v.diastolic_bp}</td>
                <td>{v.heart_rate}</td>
                <td>{v.temperature}</td>
                <td>{v.spo2}%</td>
                <td>{v.blood_sugar}</td>
                <td style={{ fontSize:'12px', color:'#6b7280' }}>{v.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AppLayout>
  )
}