import { useState, useEffect, useCallback, useMemo } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import { maternityAPI } from '../../api/maternity'
import api from '../../api/axios'
import toast from 'react-hot-toast'

const C = {
    b:'#1a6b5a', bl:'#e6f5f1', bd:'#0f4a3d', bg:'#f0f4f3', s:'#fff',
    t1:'#111827', t2:'#6b7280', t3:'#9ca3af', br:'#e5e7eb', br2:'#d1d5db',
    ok:'#16a34a', okB:'#f0fdf4', w:'#d97706', wB:'#fffbeb', d:'#dc2626', dB:'#fef2f2', i:'#2563eb', iB:'#eff6ff', p:'#7c3aed', pB:'#f5f3ff',
}
const card = (x={}) => ({ background:C.s, borderRadius:'14px', border:`1px solid ${C.br}`, padding:'18px', ...x })
const inp = { width:'100%', padding:'9px 12px', borderRadius:'9px', border:`1px solid ${C.br2}`, fontSize:'13px', fontFamily:'inherit', boxSizing:'border-box', outline:'none' }
const lbl = (t) => <label style={{display:'block',fontSize:'11.5px',fontWeight:600,color:C.t2,marginBottom:'5px'}}>{t}</label>
const unwrap = (x) => Array.isArray(x) ? x : (x?.results || [])
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'

function Btn({ children, variant='primary', size='md', disabled, onClick }) {
    const base = { borderRadius:'9px', cursor:disabled?'not-allowed':'pointer', fontFamily:'inherit', fontWeight:600, border:'1px solid transparent', opacity:disabled?0.55:1, whiteSpace:'nowrap', padding:size==='sm'?'6px 12px':'10px 16px', fontSize:size==='sm'?'12.5px':'13.5px' }
    const v = { primary:{background:C.b,color:'#fff'}, success:{background:C.ok,color:'#fff'}, outline:{background:'#fff',color:C.t1,border:`1px solid ${C.br2}`}, danger:{background:C.d,color:'#fff'} }[variant]
    return <button onClick={onClick} disabled={disabled} style={{...base,...v}}>{children}</button>
}
const Tag = ({ children, color=C.t2, bg='#f3f4f6' }) => <span style={{display:'inline-block',padding:'2px 9px',borderRadius:'20px',fontSize:'11px',fontWeight:700,color,background:bg}}>{children}</span>

const RISK = { low:{l:'Low risk',c:C.ok,b:C.okB}, high:{l:'High risk',c:C.d,b:C.dB} }
const STATUS = { active:{l:'Active',c:C.i,b:C.iB}, delivered:{l:'Delivered',c:C.ok,b:C.okB}, closed:{l:'Closed',c:C.t2,b:'#f3f4f6'} }
const MODE = { svd:'SVD', cs:'C-Section', assisted:'Assisted' }
const eddFromLmp = (lmp) => { if (!lmp) return null; const d = new Date(lmp); d.setDate(d.getDate()+280); return d }
const gaFromLmp = (lmp) => { if (!lmp) return null; const days = Math.floor((Date.now()-new Date(lmp).getTime())/86400000); return days>=0 ? (days/7).toFixed(1) : null }

/* ═══ ENROLL FORM ══════════════════════════════════════════════════ */
function EnrollCard({ patients, onChanged }) {
    const [form, setForm] = useState({ patient:'', q:'', lmp:'', gravida:1, para:0, risk_level:'low', risk_factors:'', tt_doses:0 })
    const [openList, setOpenList] = useState(false)
    const [busy, setBusy] = useState(false)
    const set = (k,v) => setForm(f=>({...f,[k]:v}))
    const edd = eddFromLmp(form.lmp), ga = gaFromLmp(form.lmp)

    const save = async () => {
        if (!form.patient) { toast.error('Select a patient'); return }
        if (!form.lmp) { toast.error('LMP is required'); return }
        try {
            setBusy(true)
            await maternityAPI.enroll({ patient:form.patient, lmp:form.lmp, gravida:Number(form.gravida)||1,
                para:Number(form.para)||0, risk_level:form.risk_level, risk_factors:form.risk_factors, tt_doses:Number(form.tt_doses)||0 })
            toast.success('ANC booking registered')
            setForm({ patient:'', q:'', lmp:'', gravida:1, para:0, risk_level:'low', risk_factors:'', tt_doses:0 })
            onChanged()
        } catch (e) { toast.error(e?.response?.data?.detail || 'Could not enroll') } finally { setBusy(false) }
    }

    return (
        <div style={card()}>
            <div style={{fontSize:'14px',fontWeight:700,marginBottom:'14px'}}>New ANC Booking</div>
            <div style={{marginBottom:'10px',position:'relative'}}>
                {lbl('Patient *')}
                <input style={inp} value={form.q}
                    onChange={e=>{set('q',e.target.value); set('patient',''); setOpenList(true)}}
                    onFocus={()=>setOpenList(true)} onBlur={()=>setTimeout(()=>setOpenList(false),150)}
                    placeholder="Type to search patients…"/>
                {openList && (
                    <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:50,background:'#fff',border:`1px solid ${C.br2}`,borderRadius:'10px',boxShadow:'0 10px 30px rgba(0,0,0,.12)',maxHeight:'220px',overflowY:'auto'}}>
                        {patients.filter(pt => { const n=(pt.full_name||'').toLowerCase(); return !form.q.trim()||n.includes(form.q.toLowerCase()) }).slice(0,25).map(pt => (
                            <div key={pt.id} onMouseDown={()=>{ set('patient',pt.id); set('q',pt.full_name); setOpenList(false) }}
                                style={{padding:'8px 12px',fontSize:'13px',cursor:'pointer',borderBottom:`1px solid ${C.br}`}}>
                                {pt.full_name} <span style={{color:C.t3,fontSize:'11px'}}>{pt.patient_id} · {pt.age??'—'}y</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'10px'}}>
                <div>{lbl('LMP *')}<input style={inp} type="date" value={form.lmp} onChange={e=>set('lmp',e.target.value)}/></div>
                <div>{lbl('Gravida')}<input style={inp} type="number" min="1" value={form.gravida} onChange={e=>set('gravida',e.target.value)}/></div>
                <div>{lbl('Para')}<input style={inp} type="number" min="0" value={form.para} onChange={e=>set('para',e.target.value)}/></div>
            </div>
            {form.lmp && (
                <div style={{background:C.bl,borderRadius:'9px',padding:'9px 12px',fontSize:'12.5px',marginBottom:'10px'}}>
                    <b>EDD:</b> {edd?.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} · <b>GA today:</b> {ga} weeks
                </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
                <div>{lbl('Risk level')}
                    <select style={inp} value={form.risk_level} onChange={e=>set('risk_level',e.target.value)}>
                        <option value="low">Low risk</option><option value="high">High risk</option>
                    </select>
                </div>
                <div>{lbl('TT doses given')}<input style={inp} type="number" min="0" max="5" value={form.tt_doses} onChange={e=>set('tt_doses',e.target.value)}/></div>
            </div>
            {form.risk_level==='high' && (
                <div style={{marginBottom:'10px'}}>{lbl('Risk factors')}
                    <textarea style={{...inp,minHeight:'48px'}} value={form.risk_factors} onChange={e=>set('risk_factors',e.target.value)} placeholder="e.g. previous CS, hypertension, age > 35, multiple gestation…"/>
                </div>
            )}
            <Btn disabled={busy} onClick={save}>{busy?'Saving…':'Register Booking'}</Btn>
        </div>
    )
}

/* ═══ VISIT MODAL ══════════════════════════════════════════════════ */
function VisitModal({ enrollment, onClose, onChanged }) {
    const [form, setForm] = useState({ weight_kg:'', systolic_bp:'', diastolic_bp:'', fundal_height_cm:'', fetal_heart_rate:'', urine_protein:'', complaints:'', plan:'', next_visit_date:'' })
    const [busy, setBusy] = useState(false)
    const set = (k,v) => setForm(f=>({...f,[k]:v}))
    const num = (v) => v===''?null:Number(v)
    const save = async () => {
        try {
            setBusy(true)
            await maternityAPI.addVisit({ enrollment:enrollment.id, weight_kg:num(form.weight_kg),
                systolic_bp:num(form.systolic_bp), diastolic_bp:num(form.diastolic_bp),
                fundal_height_cm:num(form.fundal_height_cm), fetal_heart_rate:num(form.fetal_heart_rate),
                urine_protein:form.urine_protein, complaints:form.complaints, plan:form.plan,
                next_visit_date:form.next_visit_date||null })
            toast.success('Visit recorded'); onChanged(); onClose()
        } catch (e) { toast.error(e?.response?.data?.detail||'Could not save visit') } finally { setBusy(false) }
    }
    return (
        <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,.45)',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'34px 16px',overflowY:'auto'}}>
            <div onClick={e=>e.stopPropagation()} style={{background:C.s,borderRadius:'16px',width:'100%',maxWidth:'560px',padding:'20px'}}>
                <div style={{fontSize:'16px',fontWeight:800}}>ANC Visit — {enrollment.patient_name}</div>
                <div style={{fontSize:'12px',color:C.t2,margin:'2px 0 14px'}}>GA {enrollment.gestational_age_weeks} wks · EDD {fmt(enrollment.edd)} · visit #{(enrollment.visit_count||0)+1}</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'10px'}}>
                    <div>{lbl('Weight (kg)')}<input style={inp} type="number" value={form.weight_kg} onChange={e=>set('weight_kg',e.target.value)}/></div>
                    <div>{lbl('BP systolic')}<input style={inp} type="number" value={form.systolic_bp} onChange={e=>set('systolic_bp',e.target.value)}/></div>
                    <div>{lbl('BP diastolic')}<input style={inp} type="number" value={form.diastolic_bp} onChange={e=>set('diastolic_bp',e.target.value)}/></div>
                    <div>{lbl('Fundal height (cm)')}<input style={inp} type="number" value={form.fundal_height_cm} onChange={e=>set('fundal_height_cm',e.target.value)}/></div>
                    <div>{lbl('FHR (bpm)')}<input style={inp} type="number" value={form.fetal_heart_rate} onChange={e=>set('fetal_heart_rate',e.target.value)}/></div>
                    <div>{lbl('Urine protein')}
                        <select style={inp} value={form.urine_protein} onChange={e=>set('urine_protein',e.target.value)}>
                            {['','neg','trace','1+','2+','3+'].map(v=><option key={v} value={v}>{v||'—'}</option>)}
                        </select>
                    </div>
                </div>
                <div style={{marginBottom:'10px'}}>{lbl('Complaints / findings')}<input style={inp} value={form.complaints} onChange={e=>set('complaints',e.target.value)}/></div>
                <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'10px',marginBottom:'16px'}}>
                    <div>{lbl('Plan')}<input style={inp} value={form.plan} onChange={e=>set('plan',e.target.value)} placeholder="e.g. routine, FBC + urinalysis, review 2/52"/></div>
                    <div>{lbl('Next visit')}<input style={inp} type="date" value={form.next_visit_date} onChange={e=>set('next_visit_date',e.target.value)}/></div>
                </div>
                <div style={{display:'flex',justifyContent:'flex-end',gap:'8px'}}>
                    <Btn variant="outline" onClick={onClose}>Cancel</Btn>
                    <Btn variant="success" disabled={busy} onClick={save}>{busy?'Saving…':'Save visit'}</Btn>
                </div>
            </div>
        </div>
    )
}

/* ═══ DELIVERY MODAL ═══════════════════════════════════════════════ */
function DeliveryModal({ enrollment, onClose, onChanged }) {
    const [form, setForm] = useState({ mode:'svd', outcome:'live', baby_sex:'female', birth_weight_kg:'', apgar_1min:'', apgar_5min:'', complications:'' })
    const [busy, setBusy] = useState(false)
    const set = (k,v) => setForm(f=>({...f,[k]:v}))
    const num = (v) => v===''?null:Number(v)
    const save = async () => {
        try {
            setBusy(true)
            await maternityAPI.addDelivery({ enrollment:enrollment.id, mode:form.mode, outcome:form.outcome,
                baby_sex:form.baby_sex, birth_weight_kg:num(form.birth_weight_kg),
                apgar_1min:num(form.apgar_1min), apgar_5min:num(form.apgar_5min), complications:form.complications })
            toast.success('Delivery recorded — pregnancy closed'); onChanged(); onClose()
        } catch (e) { toast.error(e?.response?.data?.detail||'Could not record delivery') } finally { setBusy(false) }
    }
    return (
        <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,.45)',display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
            <div onClick={e=>e.stopPropagation()} style={{background:C.s,borderRadius:'16px',width:'100%',maxWidth:'520px',padding:'20px'}}>
                <div style={{fontSize:'16px',fontWeight:800,marginBottom:'14px'}}>Record Delivery — {enrollment.patient_name}</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'10px'}}>
                    <div>{lbl('Mode')}<select style={inp} value={form.mode} onChange={e=>set('mode',e.target.value)}><option value="svd">SVD</option><option value="cs">C-Section</option><option value="assisted">Assisted</option></select></div>
                    <div>{lbl('Outcome')}<select style={inp} value={form.outcome} onChange={e=>set('outcome',e.target.value)}><option value="live">Live birth</option><option value="stillbirth">Stillbirth</option></select></div>
                    <div>{lbl('Sex')}<select style={inp} value={form.baby_sex} onChange={e=>set('baby_sex',e.target.value)}><option value="female">Female</option><option value="male">Male</option></select></div>
                    <div>{lbl('Weight (kg)')}<input style={inp} type="number" step="0.01" value={form.birth_weight_kg} onChange={e=>set('birth_weight_kg',e.target.value)}/></div>
                    <div>{lbl('APGAR 1 min')}<input style={inp} type="number" min="0" max="10" value={form.apgar_1min} onChange={e=>set('apgar_1min',e.target.value)}/></div>
                    <div>{lbl('APGAR 5 min')}<input style={inp} type="number" min="0" max="10" value={form.apgar_5min} onChange={e=>set('apgar_5min',e.target.value)}/></div>
                </div>
                <div style={{marginBottom:'16px'}}>{lbl('Complications')}<input style={inp} value={form.complications} onChange={e=>set('complications',e.target.value)} placeholder="e.g. PPH, none"/></div>
                <div style={{display:'flex',justifyContent:'flex-end',gap:'8px'}}>
                    <Btn variant="outline" onClick={onClose}>Cancel</Btn>
                    <Btn variant="success" disabled={busy} onClick={save}>{busy?'Recording…':'Record delivery'}</Btn>
                </div>
            </div>
        </div>
    )
}

/* ═══ ROOT ═════════════════════════════════════════════════════════ */
const TABS = [['register','ANC Register'],['visits','Antenatal Visits'],['deliveries','Delivery Register']]

export default function MaternityPage() {
    const [tab, setTab] = useState('register')
    const [dash, setDash] = useState({})
    const [enrollments, setEnrollments] = useState([])
    const [visits, setVisits] = useState([])
    const [deliveries, setDeliveries] = useState([])
    const [patients, setPatients] = useState([])
    const [loading, setLoading] = useState(true)
    const [visitFor, setVisitFor] = useState(null)
    const [deliveryFor, setDeliveryFor] = useState(null)

    const load = useCallback(async () => {
        setLoading(true)
        const [d, e, v, dl] = await Promise.allSettled([
            maternityAPI.dashboard(), maternityAPI.enrollments(), maternityAPI.visits(), maternityAPI.deliveries(),
        ])
        if (d.status==='fulfilled') setDash(d.value.data||{})
        if (e.status==='fulfilled') setEnrollments(unwrap(e.value.data))
        if (v.status==='fulfilled') setVisits(unwrap(v.value.data))
        if (dl.status==='fulfilled') setDeliveries(unwrap(dl.value.data))
        // patients for booking combobox (female patients ideally; show all, paginated)
        try {
            let page=1, all=[]
            for (let i=0;i<10;i++) {
                const r = await api.get('/patients/', { params:{ page, page_size:100 } })
                const batch = unwrap(r.data); all = all.concat(batch)
                if (!r.data?.next || batch.length===0) break
                page += 1
            }
            setPatients(all.filter(pt => (pt.gender||'').toLowerCase() !== 'male'))
        } catch {}
        setLoading(false)
    }, [])
    useEffect(() => { load() }, [load])

    const active = enrollments.filter(e => e.status==='active')
    const stats = [
        { label:'Active Pregnancies', val:dash.active_pregnancies ?? active.length, color:C.b },
        { label:'High Risk', val:dash.high_risk ?? active.filter(e=>e.risk_level==='high').length, color:C.d },
        { label:'Due This Month', val:dash.due_this_month ?? '—', color:C.w },
        { label:'Deliveries This Month', val:dash.deliveries_this_month ?? '—', color:C.ok },
    ]

    return (
        <AppLayout title="Maternity / ANC" action={<Btn variant="outline" size="sm" onClick={load}>↺ Refresh</Btn>}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'12px',marginBottom:'16px'}}>
                {stats.map(s => (
                    <div key={s.label} style={card({padding:'16px 18px'})}>
                        <div style={{fontSize:'24px',fontWeight:800,color:s.color}}>{s.val}</div>
                        <div style={{fontSize:'12px',color:C.t2,marginTop:'2px'}}>{s.label}</div>
                    </div>
                ))}
            </div>
            <div style={{display:'flex',gap:'4px',borderBottom:`1px solid ${C.br}`,marginBottom:'16px',overflowX:'auto'}}>
                {TABS.map(([id,label]) => (
                    <button key={id} onClick={()=>setTab(id)} style={{padding:'10px 16px',fontSize:'13px',fontWeight:tab===id?700:500,cursor:'pointer',background:'none',border:'none',borderBottom:`2px solid ${tab===id?C.b:'transparent'}`,color:tab===id?C.b:C.t2,whiteSpace:'nowrap',fontFamily:'inherit'}}>{label}</button>
                ))}
            </div>
            {loading ? <div style={{textAlign:'center',padding:'40px',color:C.t3}}>Loading maternity…</div> : (
                <>
                    {tab==='register' && (
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr',gap:'16px'}}>
                            <EnrollCard patients={patients} onChanged={load}/>
                            <div style={card()}>
                                <div style={{fontSize:'14px',fontWeight:700,marginBottom:'12px'}}>ANC Register <Tag color={C.i} bg={C.iB}>{enrollments.length}</Tag></div>
                                <div style={{overflowX:'auto'}}>
                                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
                                        <thead><tr style={{textAlign:'left',color:C.t2,fontSize:'10.5px',textTransform:'uppercase'}}>
                                            {['Patient','G/P','GA','EDD','Risk','Status',''].map(h=><th key={h} style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{h}</th>)}
                                        </tr></thead>
                                        <tbody>
                                            {enrollments.length===0 ? <tr><td colSpan={7} style={{textAlign:'center',padding:'24px',color:C.t3}}>No ANC bookings yet.</td></tr> :
                                            enrollments.map(e => {
                                                const rk = RISK[e.risk_level]||RISK.low, st = STATUS[e.status]||STATUS.active
                                                return (
                                                    <tr key={e.id}>
                                                        <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`,fontWeight:600}}>{e.patient_name}<div style={{fontSize:'10.5px',color:C.t3,fontWeight:400}}>{e.patient_pid} · {e.patient_age??'—'}y</div></td>
                                                        <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>G{e.gravida}P{e.para}</td>
                                                        <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{e.status==='active' ? `${e.gestational_age_weeks??'—'} wks` : '—'}</td>
                                                        <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{fmt(e.edd)}</td>
                                                        <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}><Tag color={rk.c} bg={rk.b}>{rk.l}</Tag></td>
                                                        <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}><Tag color={st.c} bg={st.b}>{st.l}</Tag></td>
                                                        <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>
                                                            {e.status==='active' && <div style={{display:'flex',gap:'6px'}}>
                                                                <Btn size="sm" variant="outline" onClick={()=>setVisitFor(e)}>+ Visit</Btn>
                                                                <Btn size="sm" onClick={()=>setDeliveryFor(e)}>Delivery</Btn>
                                                            </div>}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                    {tab==='visits' && (
                        <div style={card()}>
                            <div style={{fontSize:'14px',fontWeight:700,marginBottom:'12px'}}>Antenatal Visits <Tag color={C.i} bg={C.iB}>{visits.length}</Tag></div>
                            <div style={{overflowX:'auto'}}>
                                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
                                    <thead><tr style={{textAlign:'left',color:C.t2,fontSize:'10.5px',textTransform:'uppercase'}}>
                                        {['Date','Patient','GA','Weight','BP','Fundal ht','FHR','Urine','Next visit','Seen by'].map(h=><th key={h} style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{h}</th>)}
                                    </tr></thead>
                                    <tbody>
                                        {visits.length===0 ? <tr><td colSpan={10} style={{textAlign:'center',padding:'24px',color:C.t3}}>No visits recorded.</td></tr> :
                                        visits.map(v => {
                                            const enr = enrollments.find(e=>e.id===v.enrollment)
                                            const bpDanger = (v.systolic_bp>=140||v.diastolic_bp>=90)
                                            return (
                                                <tr key={v.id}>
                                                    <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{fmt(v.visit_date)}</td>
                                                    <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`,fontWeight:600}}>{enr?.patient_name||'—'}</td>
                                                    <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{v.ga_at_visit_weeks??'—'} wks</td>
                                                    <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{v.weight_kg??'—'}</td>
                                                    <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`,color:bpDanger?C.d:'inherit',fontWeight:bpDanger?700:400}}>{v.systolic_bp&&v.diastolic_bp?`${v.systolic_bp}/${v.diastolic_bp}`:'—'}</td>
                                                    <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{v.fundal_height_cm??'—'}</td>
                                                    <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{v.fetal_heart_rate??'—'}</td>
                                                    <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{v.urine_protein||'—'}</td>
                                                    <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{fmt(v.next_visit_date)}</td>
                                                    <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`,color:C.t2}}>{v.seen_by_name||'—'}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {tab==='deliveries' && (
                        <div style={card()}>
                            <div style={{fontSize:'14px',fontWeight:700,marginBottom:'12px'}}>Delivery Register <Tag color={C.ok} bg={C.okB}>{deliveries.length}</Tag></div>
                            <div style={{overflowX:'auto'}}>
                                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}}>
                                    <thead><tr style={{textAlign:'left',color:C.t2,fontSize:'10.5px',textTransform:'uppercase'}}>
                                        {['Date/time','Mother','Mode','Outcome','Sex','Weight','APGAR 1/5','Complications','Conducted by'].map(h=><th key={h} style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{h}</th>)}
                                    </tr></thead>
                                    <tbody>
                                        {deliveries.length===0 ? <tr><td colSpan={9} style={{textAlign:'center',padding:'24px',color:C.t3}}>No deliveries recorded.</td></tr> :
                                        deliveries.map(d => (
                                            <tr key={d.id}>
                                                <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{new Date(d.delivery_datetime).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
                                                <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`,fontWeight:600}}>{d.patient_name}</td>
                                                <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{MODE[d.mode]||d.mode}</td>
                                                <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{d.outcome==='live'?<Tag color={C.ok} bg={C.okB}>Live birth</Tag>:<Tag color={C.d} bg={C.dB}>Stillbirth</Tag>}</td>
                                                <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`,textTransform:'capitalize'}}>{d.baby_sex||'—'}</td>
                                                <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{d.birth_weight_kg?`${d.birth_weight_kg} kg`:'—'}</td>
                                                <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`}}>{d.apgar_1min??'—'}/{d.apgar_5min??'—'}</td>
                                                <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`,color:C.t2}}>{d.complications||'None'}</td>
                                                <td style={{padding:'8px',borderBottom:`1px solid ${C.br}`,color:C.t2}}>{d.conducted_by_name||'—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
            {visitFor && <VisitModal enrollment={visitFor} onClose={()=>setVisitFor(null)} onChanged={load}/>}
            {deliveryFor && <DeliveryModal enrollment={deliveryFor} onClose={()=>setDeliveryFor(null)} onChanged={load}/>}
        </AppLayout>
    )
}
