import { useState, useEffect } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import { nursingAPI } from '../../api/nursing'
import { patientsAPI } from '../../api/patients'
import toast from 'react-hot-toast'
import { sendVitals } from '../../utils/vitals/vitalsChannel'

export default function NursingPage() {
  const [vitals, setVitals] = useState([])
  const [loading, setLoading] = useState(true)
  const [patients, setPatients] = useState([])
  const [patientSearch, setPatientSearch] = useState('')
  const [form, setForm] = useState({ patient:'', systolic_bp:'', diastolic_bp:'', heart_rate:'', temperature:'', respiratory_rate:'', spo2:'', weight_kg:'', blood_sugar:'', pain_score:'', notes:'' })
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    try { const { data } = await nursingAPI.vitals(); setVitals(data.results || data) }
    catch { toast.error('Failed to load vitals') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const searchPatients = async (q) => {
    if (q.length < 2) return
    const { data } = await patientsAPI.list({ search: q })
    setPatients(data.results || data)
  }

  const handleRecord = async (e) => {
    e.preventDefault()
    if (!form.patient) { toast.error('Select a patient'); return }
    setSubmitting(true)
    try {
      // NursingPage.jsx – inside handleRecord, after successful API call
      const payload = Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== '' && k !== 'patient_search'))
      await nursingAPI.recordVitals(payload)

        // ★ Broadcast to all other tabs (doctor) immediately
        sendVitals({
            patientId: form.patient,
            systolic_bp: form.systolic_bp,
            diastolic_bp: form.diastolic_bp,
            heart_rate: form.heart_rate,
            temperature: form.temperature,
            respiratory_rate: form.respiratory_rate,
            spo2: form.spo2,
            weight_kg: form.weight_kg,
            blood_sugar: form.blood_sugar,
            pain_score: form.pain_score,
            notes: form.notes,
            recordedAt: new Date().toISOString(),
            recordedBy: 'Nurse',
        })

        toast.success('Vitals recorded!')
        // … reset form …
        setForm({ patient:'', systolic_bp:'', diastolic_bp:'', heart_rate:'', temperature:'', respiratory_rate:'', spo2:'', weight_kg:'', blood_sugar:'', pain_score:'', notes:'' })
        setPatientSearch(''); load()
    } catch { toast.error('Failed to record vitals') }
    finally { setSubmitting(false) }
  }

  const getFlag = (val, low, high) => {
    if (!val) return null
    if (val < low) return { color:'#2563eb', label:'Low' }
    if (val > high) return { color:'#dc2626', label:'High' }
    return { color:'#16a34a', label:'Normal' }
  }

  const VITALS_CONFIG = [
    { label:'Systolic BP', field:'systolic_bp', unit:'mmHg', low:90, high:140 },
    { label:'Diastolic BP', field:'diastolic_bp', unit:'mmHg', low:60, high:90 },
    { label:'Heart Rate', field:'heart_rate', unit:'bpm', low:60, high:100 },
    { label:'Temperature', field:'temperature', unit:'°C', low:36.1, high:37.5 },
    { label:'Resp. Rate', field:'respiratory_rate', unit:'br/min', low:12, high:20 },
    { label:'SpO₂', field:'spo2', unit:'%', low:95, high:100 },
    { label:'Weight', field:'weight_kg', unit:'kg', low:0, high:999 },
    { label:'Blood Sugar', field:'blood_sugar', unit:'mg/dL', low:70, high:140 },
    { label:'Pain Score', field:'pain_score', unit:'/10', low:0, high:3 },
  ]

  return (
    <AppLayout title="Nursing Station">
      <div style={{ display:'grid', gridTemplateColumns:'380px 1fr', gap:'18px' }}>
        {/* Record Vitals Form */}
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e5e7eb', padding:'20px' }}>
          <div style={{ fontSize:'11px', fontWeight:'700', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'16px' }}>Record Vitals</div>
          <form onSubmit={handleRecord}>
            <div style={{ marginBottom:'14px', position:'relative' }}>
              <label style={{ fontSize:'11.5px', fontWeight:'600', color:'#374151', display:'block', marginBottom:'5px' }}>Patient *</label>
              <input value={patientSearch} onChange={e=>{setPatientSearch(e.target.value);searchPatients(e.target.value)}} placeholder="Search patient…"
                style={{ width:'100%', padding:'8px 11px', border:'1.5px solid #e5e7eb', borderRadius:'8px', fontSize:'13.5px', fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
              {patients.length>0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, border:'1px solid #e5e7eb', borderRadius:'8px', marginTop:'4px', background:'#fff', boxShadow:'0 4px 12px rgba(0,0,0,0.08)', zIndex:10 }}>
                  {patients.slice(0,4).map(p=>(
                    <div key={p.id} onClick={()=>{setForm(f=>({...f,patient:p.id}));setPatientSearch(`${p.first_name} ${p.last_name}`);setPatients([])}}
                      style={{ padding:'9px 12px', cursor:'pointer', fontSize:'13px', borderBottom:'1px solid #f3f4f6' }}
                      onMouseOver={e=>e.currentTarget.style.background='#f9fafb'}
                      onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                      <strong>{p.first_name} {p.last_name}</strong> <span style={{ color:'#9ca3af' }}>{p.patient_id}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'14px' }}>
              {VITALS_CONFIG.map(({ label, field, unit }) => (
                <div key={field}>
                  <label style={{ fontSize:'11px', fontWeight:'600', color:'#374151', display:'block', marginBottom:'4px' }}>{label} <span style={{ color:'#9ca3af', fontWeight:'400' }}>({unit})</span></label>
                  <input type="number" value={form[field]} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))} placeholder="—"
                    style={{ width:'100%', padding:'7px 10px', border:'1.5px solid #e5e7eb', borderRadius:'8px', fontSize:'13px', fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
                </div>
              ))}
            </div>
            <div style={{ marginBottom:'14px' }}>
              <label style={{ fontSize:'11.5px', fontWeight:'600', color:'#374151', display:'block', marginBottom:'5px' }}>Nursing Notes</label>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Observations…"
                style={{ width:'100%', padding:'8px 11px', border:'1.5px solid #e5e7eb', borderRadius:'8px', fontSize:'13px', fontFamily:'inherit', outline:'none', resize:'vertical', boxSizing:'border-box' }} />
            </div>
            <button type="submit" disabled={submitting} style={{ width:'100%', padding:'10px', background:submitting?'#9ca3af':'#1a6b5a', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'600', fontFamily:'inherit' }}>
              {submitting ? 'Saving…' : 'Save Vitals'}
            </button>
          </form>
        </div>

        {/* Vitals History */}
        <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #e5e7eb', overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #e5e7eb', fontSize:'13px', fontWeight:'700', color:'#374151' }}>Recent Vitals</div>
          {loading ? <div style={{ padding:'48px', textAlign:'center', color:'#9ca3af' }}>Loading…</div> : vitals.length === 0 ? (
            <div style={{ padding:'48px', textAlign:'center' }}>
              <div style={{ fontSize:'32px', marginBottom:'10px' }}>💉</div>
              <div style={{ fontWeight:'600', color:'#374151' }}>No vitals recorded yet</div>
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ borderBottom:'1px solid #e5e7eb' }}>
                {['Patient','BP','HR','Temp','SpO₂','Sugar','Time'].map(h=>(
                  <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:'11px', fontWeight:'700', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.04em' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {vitals.map((v,i)=>{
                  const bpFlag = getFlag(v.systolic_bp, 90, 140)
                  return (
                    <tr key={v.id} style={{ borderBottom:i<vitals.length-1?'1px solid #f3f4f6':'none' }}>
                      <td style={{ padding:'10px 12px', fontWeight:'600', fontSize:'13px' }}>{v.patient_detail ? `${v.patient_detail.first_name} ${v.patient_detail.last_name}` : v.patient}</td>
                      <td style={{ padding:'10px 12px', fontSize:'13px', color:bpFlag?.color, fontWeight:'600' }}>{v.systolic_bp}/{v.diastolic_bp}</td>
                      <td style={{ padding:'10px 12px', fontSize:'13px', color:getFlag(v.heart_rate,60,100)?.color }}>{v.heart_rate}</td>
                      <td style={{ padding:'10px 12px', fontSize:'13px', color:getFlag(v.temperature,36.1,37.5)?.color }}>{v.temperature}</td>
                      <td style={{ padding:'10px 12px', fontSize:'13px', color:getFlag(v.spo2,95,100)?.color }}>{v.spo2}%</td>
                      <td style={{ padding:'10px 12px', fontSize:'13px', color:getFlag(v.blood_sugar,70,140)?.color }}>{v.blood_sugar}</td>
                      <td style={{ padding:'10px 12px', fontSize:'12px', color:'#9ca3af' }}>{new Date(v.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
