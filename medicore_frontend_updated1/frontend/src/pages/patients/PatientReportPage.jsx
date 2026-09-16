import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import { patientsAPI } from '../../api/patients'
import toast from 'react-hot-toast'

const FLAG = {
    H: { t: 'High', c: '#d97706' }, L: { t: 'Low', c: '#2563eb' },
    HH: { t: 'Crit High', c: '#dc2626' }, LL: { t: 'Crit Low', c: '#dc2626' },
    A: { t: 'Abnormal', c: '#d97706' }, P: { t: 'Positive', c: '#dc2626' }, N: { t: 'Negative', c: '#16a34a' },
}
const TRIAGE = { red: '#dc2626', yellow: '#d97706', green: '#16a34a' }
const STATUS_PILL = {
    completed: { bg: '#f0fdf4', c: '#16a34a' }, dispensed: { bg: '#f0fdf4', c: '#16a34a' },
    cancelled: { bg: '#fef2f2', c: '#dc2626' }, pending: { bg: '#fffbeb', c: '#d97706' },
    paid: { bg: '#f0fdf4', c: '#16a34a' }, partial: { bg: '#fffbeb', c: '#d97706' },
}

const th = { padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb' }
const td = { padding: '11px 12px', fontSize: '13px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' }

const Card = ({ children }) => (
    <div className="pr-card" style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '18px 20px', marginBottom: '16px' }}>{children}</div>
)
const Head = ({ title, count, countColor }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontSize: '14px', fontWeight: '700' }}>{title}</span>
        {count != null && <span style={{ ...countColor, padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' }}>{count}</span>}
    </div>
)
const B = { info: { background: '#eff6ff', color: '#2563eb' }, success: { background: '#f0fdf4', color: '#16a34a' }, brand: { background: '#e6f5f1', color: '#0f4a3d' }, warn: { background: '#fffbeb', color: '#d97706' } }
const empty = (t) => <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: '13px' }}>{t}</div>

const Tile = ({ label, value, unit, color }) => (
    <div style={{ background: '#f4f6f8', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', color: '#9ca3af' }}>{label}</div>
        <div style={{ fontSize: '18px', fontWeight: '700', color: color || '#111827' }}>{value}</div>
        {unit && <div style={{ fontSize: '10px', color: color || '#9ca3af' }}>{unit}</div>}
    </div>
)

export default function PatientReportPage() {
    const { patientId } = useParams()
    const navigate = useNavigate()
    const [r, setR] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        patientsAPI.report(patientId)
            .then(({ data }) => setR(data))
            .catch(() => { toast.error('Could not load report'); navigate(`/patients/${patientId}`) })
            .finally(() => setLoading(false))
    }, [patientId])

    if (loading) return <AppLayout title="Patient Report"><div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>Loading report…</div></AppLayout>
    if (!r) return null

    const d = r.demographics
    const initials = `${d.first_name?.[0] || ''}${d.last_name?.[0] || ''}`.toUpperCase()

    // latest vitals (list is newest-first)
    const lv = r.vitals[0] || null
    const sys = lv?.bp ? parseInt(lv.bp.split('/')[0], 10) : null
    const bpC = sys == null ? '#111827' : sys > 140 ? '#dc2626' : sys < 90 ? '#2563eb' : '#16a34a'
    const spo2C = lv?.spo2 != null && lv.spo2 < 95 ? '#dc2626' : '#16a34a'
    const sugarC = lv?.blood_sugar != null && lv.blood_sugar > 140 ? '#d97706' : '#111827'

    const demoFields = [
        ['Date of Birth', d.date_of_birth], ['Gender', d.gender],
        ['Blood Group', d.blood_group || 'Unknown'], ['Genotype', d.genotype || 'Unknown'],
        ['Allergies', d.allergies || 'None known', d.allergies ? '#dc2626' : null],
        ['Insurance', `${d.insurance_label}${d.insurance_id ? ' · ' + d.insurance_id : ''}`],
        ['Phone', d.phone], ['Email', d.email],
        ['Address', d.address || '—', null, true],
        ['Emergency Contact', d.emergency_name], ['Emergency Phone', d.emergency_phone],
    ]

    const action = (
        <div className="no-print" style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => navigate(`/patients/${patientId}`)} style={{ padding: '7px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>← Back</button>
            <button onClick={() => window.print()} style={{ padding: '7px 16px', background: '#1a6b5a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', fontFamily: 'inherit' }}>🖨 Print / Export</button>
        </div>
    )

    return (
        <AppLayout title="Patient Report" action={action}>
            <style>{`@media print {
        body * { visibility: hidden !important; }
        #patient-report, #patient-report * { visibility: visible !important; }
        #patient-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
        .no-print { display: none !important; }
        #patient-report .pr-card { break-inside: avoid; box-shadow: none !important; }
      }`}</style>

            <div id="patient-report" style={{ maxWidth: '960px' }}>
                {/* Header banner */}
                <div className="pr-card" style={{ background: 'linear-gradient(135deg,#0f4a3d,#1a6b5a)', borderRadius: '14px', padding: '22px 24px', color: '#fff', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '700', flexShrink: 0 }}>{initials}</div>
                        <div>
                            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: '22px', fontWeight: '700' }}>{d.full_name}</div>
                            <div style={{ fontSize: '13px', opacity: .8, marginTop: '3px' }}>{d.patient_id} · {d.age}y · {d.gender} · {d.phone}</div>
                            <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {d.blood_group && <span style={{ background: 'rgba(255,255,255,.2)', padding: '3px 9px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>🩸 {d.blood_group}</span>}
                                {d.genotype && <span style={{ background: 'rgba(255,255,255,.2)', padding: '3px 9px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>{d.genotype}</span>}
                                {d.allergies && <span style={{ background: '#fef2f2', color: '#dc2626', padding: '3px 9px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>⚠ Allergy: {d.allergies}</span>}
                                <span style={{ background: 'rgba(255,255,255,.2)', padding: '3px 9px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>{d.insurance_label}</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '12px', opacity: .75 }}>
                        <div style={{ fontWeight: '700', fontSize: '13px', opacity: 1 }}>MediCore HMS</div>
                        <div style={{ marginTop: '3px' }}>Generated {r.generated_at}</div>
                        <div>Registered {d.registered_on}</div>
                    </div>
                </div>

                {/* 2-col summary: Demographics + Latest Vitals */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div className="pr-card" style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '18px 20px', margin: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px' }}>Demographics</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                            {demoFields.map(([label, value, color, full]) => (
                                <div key={label} style={full ? { gridColumn: '1/-1' } : undefined}>
                                    <span style={{ color: '#9ca3af', fontSize: '12px' }}>{label}</span>
                                    <div style={{ fontWeight: '600', color: color || '#111827' }}>{value || '—'}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pr-card" style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '18px 20px', margin: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
                            <span style={{ fontSize: '14px', fontWeight: '700' }}>Latest Vitals</span>
                            {lv && <span style={{ fontSize: '11px', color: '#9ca3af' }}>· Recorded {lv.recorded_at}</span>}
                        </div>
                        {lv ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                                <Tile label="BP" value={lv.bp || '—'} unit="mmHg" color={bpC} />
                                <Tile label="Heart Rate" value={lv.heart_rate ?? '—'} unit="bpm" />
                                <Tile label="Temp" value={lv.temperature != null ? lv.temperature : '—'} unit="°C" />
                                <Tile label="SpO₂" value={lv.spo2 != null ? `${lv.spo2}%` : '—'} color={spo2C} />
                                <Tile label="Weight" value={lv.weight_kg != null ? lv.weight_kg : '—'} unit="kg" />
                                <Tile label="Sugar" value={lv.blood_sugar ?? '—'} unit="mg/dL" color={sugarC} />
                            </div>
                        ) : empty('No vitals recorded yet.')}
                    </div>
                </div>

                {/* Appointments */}
                <Card>
                    <Head title="Appointments" count={r.appointments.length} countColor={B.info} />
                    {r.appointments.length === 0 ? empty('No appointments on record.') : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr>{['Date / Time', 'Doctor', 'Type', 'Triage', 'Status', 'Complaint'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                            <tbody>{r.appointments.map((a, i) => {
                                const sp = STATUS_PILL[a.status] || { bg: '#eff6ff', c: '#2563eb' }
                                return (
                                    <tr key={i}>
                                        <td style={td}>{a.date}</td>
                                        <td style={td}>{a.doctor}</td>
                                        <td style={td}>{a.type}</td>
                                        <td style={td}><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: TRIAGE[a.triage] || '#9ca3af' }} /></td>
                                        <td style={td}><span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: sp.bg, color: sp.c }}>{a.status_label}</span></td>
                                        <td style={{ ...td, color: '#6b7280' }}>{a.chief_complaint || '—'}</td>
                                    </tr>
                                )
                            })}</tbody>
                        </table>
                    )}
                </Card>

                {/* Clinical Notes (SOAP) */}
                <Card>
                    <Head title="Clinical Notes (SOAP)" count={r.consultations.length} countColor={B.success} />
                    {r.consultations.length === 0 ? empty('No consultation notes.') : r.consultations.map((c, i) => (
                        <div key={i} style={{ borderLeft: '3px solid #1a6b5a', paddingLeft: '12px', marginBottom: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ fontSize: '13px', fontWeight: '700' }}>{c.doctor || 'Doctor'}</span><span style={{ fontSize: '11.5px', color: '#9ca3af' }}>{c.date}</span></div>
                            {c.chief_complaint && <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>Complaint: {c.chief_complaint}</div>}
                            {[['S', c.subjective], ['O', c.objective], ['A', c.assessment], ['P', c.plan]].filter(([, v]) => v).map(([k, v]) => (
                                <div key={k} style={{ fontSize: '12.5px', marginBottom: '3px' }}><b style={{ color: '#1a6b5a' }}>{k}:</b> {v}</div>
                            ))}
                        </div>
                    ))}
                </Card>

                {/* Prescriptions */}
                <Card>
                    <Head title="Prescriptions" count={r.prescriptions.length} countColor={B.brand} />
                    {r.prescriptions.length === 0 ? empty('No prescriptions.') : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr>{['Rx #', 'Drugs', 'Doctor', 'Date', 'Status'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                            <tbody>{r.prescriptions.map((p, i) => {
                                const sp = STATUS_PILL[p.status] || { bg: '#fffbeb', c: '#d97706' }
                                return (
                                    <tr key={i}>
                                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>{p.prescription_id}</td>
                                        <td style={td}>{p.items.map(it => it.drug).filter(Boolean).join(', ') || '—'}</td>
                                        <td style={td}>{p.doctor}</td>
                                        <td style={td}>{p.date}</td>
                                        <td style={td}><span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: sp.bg, color: sp.c, textTransform: 'capitalize' }}>{p.status}</span></td>
                                    </tr>
                                )
                            })}</tbody>
                        </table>
                    )}
                </Card>

                {/* Lab & Radiology Orders */}
                <Card>
                    <Head title="Lab & Radiology Orders" count={r.lab_orders.length} countColor={B.info} />
                    {r.lab_orders.length === 0 ? empty('No lab orders.') : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr>{['Order #', 'Tests', 'Doctor', 'Date', 'Status'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                            <tbody>{r.lab_orders.map((o, i) => (
                                <tr key={i}>
                                    <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>{o.order_number}</td>
                                    <td style={td}>{o.items.map(it => it.test).filter(Boolean).join(', ') || '—'}</td>
                                    <td style={td}>{o.doctor}</td>
                                    <td style={td}>{o.date}</td>
                                    <td style={{ ...td, textTransform: 'capitalize' }}>{o.status}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    )}
                </Card>

                {/* Detailed lab results (only if any results captured) */}
                {r.lab_orders.some(o => o.items.some(it => it.result)) && (
                    <Card>
                        <Head title="Lab Results" />
                        {r.lab_orders.filter(o => o.items.some(it => it.result)).map((o, i) => (
                            <div key={i} style={{ marginBottom: '12px' }}>
                                <div style={{ fontSize: '12.5px', fontWeight: '700', marginBottom: '6px' }}>{o.order_number} · {o.date}</div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead><tr>{['Test', 'Result', 'Unit', 'Range', 'Flag'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                                    <tbody>{o.items.filter(it => it.result).map((it, j) => {
                                        const f = FLAG[it.flag]; return (
                                            <tr key={j}><td style={td}>{it.test}</td><td style={{ ...td, fontWeight: '600' }}>{it.result}</td><td style={td}>{it.unit}</td><td style={td}>{it.reference_range || '—'}</td><td style={td}>{f ? <span style={{ color: f.c, fontWeight: '700' }}>{f.t}</span> : '—'}</td></tr>
                                        )
                                    })}</tbody>
                                </table>
                            </div>
                        ))}
                    </Card>
                )}

                {/* Vitals History */}
                <Card>
                    <Head title="Vitals History" count={r.vitals.length} countColor={B.success} />
                    {r.vitals.length === 0 ? empty('No vitals recorded.') : (
                        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr>{['Recorded', 'BP', 'HR', 'Temp', 'SpO₂', 'RR', 'Weight', 'Sugar', 'Pain'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                            <tbody>{r.vitals.map((v, i) => (
                                <tr key={i}><td style={td}>{v.recorded_at}</td><td style={td}>{v.bp || '—'}</td><td style={td}>{v.heart_rate ?? '—'}</td><td style={td}>{v.temperature != null ? `${v.temperature}°` : '—'}</td><td style={td}>{v.spo2 != null ? `${v.spo2}%` : '—'}</td><td style={td}>{v.respiratory_rate ?? '—'}</td><td style={td}>{v.weight_kg != null ? `${v.weight_kg}kg` : '—'}</td><td style={td}>{v.blood_sugar ?? '—'}</td><td style={td}>{v.pain_score ?? '—'}</td></tr>
                            ))}</tbody>
                        </table></div>
                    )}
                </Card>

                {/* Billing */}
                <Card>
                    <Head title="Billing — Statement" count={r.invoices.length} countColor={B.warn} />
                    {r.invoices.length === 0 ? empty('No invoices.') : (
                        <>
                            {(() => {
                                const tot = r.invoices.reduce((s, v) => s + v.total, 0)
                                const paid = r.invoices.reduce((s, v) => s + v.paid, 0)
                                const bal = r.invoices.reduce((s, v) => s + v.balance, 0)
                                return (
                                    <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                                        <div style={{ flex: 1, background: '#f4f6f8', borderRadius: '8px', padding: '10px 12px' }}><div style={{ fontSize: '11px', color: '#9ca3af' }}>Total Billed</div><div style={{ fontSize: '16px', fontWeight: '700' }}>₦{tot.toLocaleString()}</div></div>
                                        <div style={{ flex: 1, background: '#f0fdf4', borderRadius: '8px', padding: '10px 12px' }}><div style={{ fontSize: '11px', color: '#9ca3af' }}>Paid</div><div style={{ fontSize: '16px', fontWeight: '700', color: '#16a34a' }}>₦{paid.toLocaleString()}</div></div>
                                        <div style={{ flex: 1, background: bal > 0 ? '#fef2f2' : '#f4f6f8', borderRadius: '8px', padding: '10px 12px' }}><div style={{ fontSize: '11px', color: '#9ca3af' }}>Balance</div><div style={{ fontSize: '16px', fontWeight: '700', color: bal > 0 ? '#dc2626' : '#111827' }}>₦{bal.toLocaleString()}</div></div>
                                    </div>
                                )
                            })()}
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr>{['Invoice', 'Date', 'Total', 'Paid', 'Balance', 'Status'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                                <tbody>{r.invoices.map((v, i) => (
                                    <tr key={i}>
                                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>{v.invoice_number}</td>
                                        <td style={td}>{v.date}</td>
                                        <td style={td}>₦{v.total.toLocaleString()}</td>
                                        <td style={td}>₦{v.paid.toLocaleString()}</td>
                                        <td style={{ ...td, fontWeight: '600', color: v.balance > 0 ? '#dc2626' : '#16a34a' }}>₦{v.balance.toLocaleString()}</td>
                                        <td style={{ ...td, textTransform: 'capitalize' }}>{v.status}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </>
                    )}
                </Card>

                {/* Admissions / IPD */}
                <Card>
                    <Head title="Admissions / IPD" count={r.admissions.length} countColor={B.brand} />
                    {r.admissions.length === 0 ? empty('No admissions.') : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr>{['Date', 'Type', 'Ward', 'Bed', 'Diagnosis', 'Status'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                            <tbody>{r.admissions.map((a, i) => (
                                <tr key={i}><td style={td}>{a.date}</td><td style={td}>{a.type}</td><td style={td}>{a.ward || '—'}</td><td style={td}>{a.bed || '—'}</td><td style={td}>{a.diagnosis || '—'}</td><td style={{ ...td, textTransform: 'capitalize' }}>{a.status}</td></tr>
                            ))}</tbody>
                        </table>
                    )}
                </Card>

                <div style={{ textAlign: 'center', fontSize: '11px', color: '#9ca3af', padding: '8px 0 20px' }}>
                    MediCore HMS · Confidential clinical record · Generated {r.generated_at}
                </div>
            </div>
        </AppLayout>
    )
}