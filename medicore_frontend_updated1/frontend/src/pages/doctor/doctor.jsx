// src/pages/doctor/DoctorWorkbench.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import { notificationsAPI } from '../../api/notifications'
import { doctorAPI } from '../../api/doctor'
import { teleAPI } from '../../api/telemedicine'
import { useAuthStore } from '../../store/authStore'
import { createTeleRTC, teleWsUrl } from '../../lib/teleRTC'
import toast from 'react-hot-toast'

/* ─── Design tokens ─────────────────────────────────────────────── */
const C = {
    b: '#1a6b5a', bm: '#2a8f76', bd: '#0f4a3d', bl: '#e6f5f1', bg: '#f0f4f3',
    sb: '#0e2a24', sa: '#2a6b5a', s: '#fff',
    t1: '#111827', t2: '#6b7280', t3: '#9ca3af',
    br: '#e5e7eb', br2: '#d1d5db',
    ok: '#16a34a', okB: '#f0fdf4',
    w: '#d97706', wB: '#fffbeb',
    d: '#dc2626', dB: '#fef2f2',
    i: '#2563eb', iB: '#eff6ff',
    p: '#7c3aed', pB: '#f5f3ff',
}

const TRIAGE_META = {
    red: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', label: 'Critical' },
    yellow: { bg: '#fffbeb', color: '#d97706', border: '#fde68a', label: 'Urgent' },
    green: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', label: 'Routine' },
}

/* ─── Tiny shared pieces ────────────────────────────────────────── */
const inp = {
    width: '100%', padding: '8px 11px', border: `1.5px solid ${C.br}`,
    borderRadius: '8px', fontSize: '13.5px', fontFamily: 'inherit',
    outline: 'none', color: C.t1, background: C.s, boxSizing: 'border-box',
}
const card = (extra = {}) => ({
    background: C.s, borderRadius: '14px', border: `1px solid ${C.br}`,
    padding: '18px', ...extra,
})
const lbl = txt => (
    <div style={{
        fontSize: '11px', fontWeight: 700, color: C.t2, textTransform: 'uppercase',
        letterSpacing: '.06em', marginBottom: '5px'
    }}>{txt}</div>
)
const Divider = () => <div style={{ height: '1px', background: C.br, margin: '14px 0' }} />

function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, style: s = {} }) {
    const base = {
        display: 'inline-flex', alignItems: 'center', gap: '6px', border: 'none',
        borderRadius: '8px', cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 600, fontFamily: 'inherit', opacity: disabled ? .5 : 1,
        fontSize: size === 'sm' ? '12px' : '13px',
        padding: size === 'sm' ? '5px 12px' : '9px 18px',
        transition: 'opacity .15s',
    }
    const v = {
        primary: { background: C.b, color: '#fff' },
        success: { background: C.ok, color: '#fff' },
        warning: { background: C.w, color: '#fff' },
        danger: { background: C.d, color: '#fff' },
        outline: { background: '#fff', color: C.t2, border: `1px solid ${C.br2}` },
        ghost: { background: 'transparent', color: C.t2 },
        blue: { background: C.i, color: '#fff' },
        purple: { background: C.p, color: '#fff' },
    }
    return (
        <button onClick={disabled ? undefined : onClick}
            style={{ ...base, ...v[variant], ...s }}>
            {children}
        </button>
    )
}

function Tag({ children, color = C.b, bg = C.bl }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '2px 9px',
            borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: bg, color
        }}>
            {children}
        </span>
    )
}

function VitalChip({ label, value, unit, status }) {
    const colors = { normal: C.ok, low: C.w, high: C.d, elevated: C.d }
    const col = colors[status] || C.t1
    return (
        <div style={{ textAlign: 'center', padding: '10px', background: C.bg, borderRadius: '10px' }}>
            <div style={{ fontSize: '11px', color: C.t2, marginBottom: '4px' }}>{label}</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: col, lineHeight: 1 }}>
                {value ?? '—'}
            </div>
            {unit && <div style={{ fontSize: '10px', color: C.t3, marginTop: '2px' }}>{unit}</div>}
        </div>
    )
}

function Empty({ text }) {
    return <div style={{ padding: '24px', textAlign: 'center', color: C.t3, fontSize: '13px' }}>{text}</div>
}

/* ═══════════════════════════════════════════════════════════════════
   DRUG SEARCH INPUT — autocomplete from pharmacy registry
═══════════════════════════════════════════════════════════════════ */
function DrugSearchInput({ value, onSelect, placeholder = 'Search drug registry…' }) {
    const [query, setQuery] = useState(value || '')
    const [suggestions, setSuggestions] = useState([])
    const [open, setOpen] = useState(false)
    const [searching, setSearching] = useState(false)
    const timer = useRef(null)
    const ref = useRef(null)

    // Close on outside click
    useEffect(() => {
        const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const search = useCallback(async q => {
        if (q.length < 2) { setSuggestions([]); return }
        setSearching(true)
        try {
            const { data } = await doctorAPI.drugSearch(q)
            setSuggestions(data)
            setOpen(true)
        } catch {
            setSuggestions([])
        } finally { setSearching(false) }
    }, [])

    const handleChange = e => {
        const q = e.target.value
        setQuery(q)
        onSelect({ drug_name: q, drug_id: null })   // free text fallback
        clearTimeout(timer.current)
        timer.current = setTimeout(() => search(q), 300)
    }

    const pick = drug => {
        setQuery(drug.name)
        setOpen(false)
        setSuggestions([])
        onSelect({
            drug_name: drug.name,
            drug_id: drug.id,
            dose_hint: drug.strength || '',
        })
    }

    return (
        <div ref={ref} style={{ position: 'relative', width: '100%' }}>
            <input
                value={query}
                onChange={handleChange}
                onFocus={() => query.length >= 2 && setOpen(true)}
                placeholder={placeholder}
                style={{ ...inp, paddingRight: searching ? '32px' : inp.padding }}
            />
            {searching && (
                <div style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    fontSize: '11px', color: C.t3
                }}>…</div>
            )}
            {open && suggestions.length > 0 && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: '#fff', border: `1px solid ${C.br}`,
                    borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.12)',
                    zIndex: 200, maxHeight: '220px', overflowY: 'auto',
                }}>
                    {suggestions.map(drug => (
                        <div key={drug.id} onClick={() => pick(drug)}
                            style={{
                                padding: '9px 14px', cursor: 'pointer', borderBottom: `1px solid #f3f4f6`,
                                transition: 'background .1s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = C.bg}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, fontSize: '13px' }}>{drug.name}</span>
                                <span style={{ fontSize: '11px', color: C.b, fontWeight: 700 }}>
                                    ₦{Number(drug.unit_price).toLocaleString()}
                                </span>
                            </div>
                            <div style={{ fontSize: '11.5px', color: C.t3, marginTop: '2px', display: 'flex', gap: '8px' }}>
                                {drug.strength && <span>{drug.strength}</span>}
                                {drug.dosage_form && <span>· {drug.dosage_form}</span>}
                                <span style={{ color: drug.stock > 0 ? C.ok : C.d, fontWeight: 600 }}>
                                    · Stock: {drug.stock}
                                </span>
                                {drug.requires_prescription && (
                                    <span style={{ color: C.w }}>· Rx required</span>
                                )}
                            </div>
                        </div>
                    ))}
                    {/* Free-text option */}
                    <div onClick={() => { setOpen(false); onSelect({ drug_name: query, drug_id: null }) }}
                        style={{
                            padding: '9px 14px', cursor: 'pointer', background: '#f9fafb',
                            fontSize: '12.5px', color: C.t2
                        }}>
                        Use <strong>"{query}"</strong> as free text →
                    </div>
                </div>
            )}
        </div>
    )
}

/* ═══════════════════════════════════════════════════════════════════
   QUEUE PANEL
═══════════════════════════════════════════════════════════════════ */
function QueueBar({ queue, selected, onSelect, loading }) {
    const waiting = queue.filter(a => ['scheduled', 'confirmed'].includes(a.status)).length
    const consulting = queue.filter(a => a.status === 'in_progress').length
    return (
        <div style={{ ...card(), marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700 }}>My Appointment Queue</span>
                <span style={{ fontSize: '12px', color: C.t2 }}>
                    <b style={{ color: C.w }}>{waiting}</b> waiting{' · '}<b style={{ color: C.i }}>{consulting}</b> consulting
                </span>
            </div>
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px', minHeight: '84px', alignItems: 'stretch' }}>
                {loading && <div style={{ color: C.t3, fontSize: '13px', padding: '24px' }}>Loading queue…</div>}
                {!loading && queue.length === 0 && (
                    <div style={{ color: C.t3, fontSize: '13px', padding: '24px' }}>No appointments in your queue. Book one in Appointments.</div>
                )}
                {queue.map(appt => {
                    const pt = appt.patient_detail || {}
                    const tm = TRIAGE_META[appt.triage] || TRIAGE_META.green
                    const sel = selected?.id === appt.id
                    const tele = appt.appointment_type === 'telemedicine'
                    return (
                        <div key={appt.id} onClick={() => onSelect(appt)} style={{
                            minWidth: '205px', cursor: 'pointer', borderRadius: '12px', padding: '12px 14px',
                            border: `1.5px solid ${sel ? C.b : C.br}`, background: sel ? C.bl : C.s,
                            boxShadow: `inset 4px 0 0 ${tm.color}`, transition: 'all .15s',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                <span style={{ fontWeight: 700, fontSize: '13.5px', color: C.t1 }}>{pt.first_name} {pt.last_name}</span>
                                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '8px', background: tm.bg, color: tm.color }}>{tm.label}</span>
                            </div>
                            <div style={{ fontSize: '11.5px', color: C.t2 }}>{pt.pid} · {pt.gender} · {pt.age}y</div>
                            {appt.chief_complaint && (
                                <div style={{ fontSize: '11px', color: C.t3, marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{appt.chief_complaint}</div>
                            )}
                            <div style={{ marginTop: '6px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                                <span style={{
                                    fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '8px',
                                    background: appt.status === 'in_progress' ? C.iB : appt.status === 'completed' ? C.okB : C.wB,
                                    color: appt.status === 'in_progress' ? C.i : appt.status === 'completed' ? C.ok : C.w
                                }}>{appt.status.replace('_', ' ')}</span>
                                {tele && <span style={{ fontSize: '10px', fontWeight: 700, color: C.i, background: C.iB, padding: '2px 6px', borderRadius: '8px' }}>🎥 Tele</span>}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

/* ═══════════════════════════════════════════════════════════════════
   VITALS STRIP
═══════════════════════════════════════════════════════════════════ */
function VitalsStrip({ vitals }) {
    if (!vitals?.length) {
        return (
            <div style={{ padding: '14px', background: C.bg, borderRadius: '10px', color: C.t3, fontSize: '13px' }}>
                ⚠ No vitals recorded yet. Ask nurse to record vitals before consultation.
            </div>
        )
    }
    const v = vitals[0]
    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: '8px' }}>
                <VitalChip label="SBP" value={v.systolic} unit="mmHg" status={v.bp_status} />
                <VitalChip label="DBP" value={v.diastolic} unit="mmHg" status={v.bp_status} />
                <VitalChip label="HR" value={v.heart_rate} unit="bpm" status={v.hr_status} />
                <VitalChip label="Temp" value={v.temperature} unit="°C" status={v.temp_status} />
                <VitalChip label="SpO₂" value={v.spo2} unit="%" status={v.spo2_status} />
                <VitalChip label="Weight" value={v.weight} unit="kg" />
                <VitalChip label="Sugar" value={v.blood_sugar} unit="mg/dL" status={v.sugar_status} />
                <VitalChip label="Pain" value={v.pain_score} unit="/10" />
            </div>
            {v.notes && (
                <div style={{
                    marginTop: '8px', padding: '8px 12px', background: C.wB, borderRadius: '8px',
                    fontSize: '12.5px', color: '#854d0e'
                }}>
                    ⚠ Nurse note: {v.notes}
                </div>
            )}
            <div style={{ marginTop: '4px', fontSize: '11px', color: C.t3, textAlign: 'right' }}>
                Recorded: {new Date(v.recorded_at).toLocaleString()}
            </div>
        </div>
    )
}

/* ═══════════════════════════════════════════════════════════════════
   SOAP NOTE FORM
═══════════════════════════════════════════════════════════════════ */
function SOAPForm({ patient, appointmentId, existingNote, onSaved }) {
    const [form, setForm] = useState({
        subjective: existingNote?.subjective || '',
        objective: existingNote?.objective || '',
        assessment: existingNote?.assessment || '',
        plan: existingNote?.plan || '',
    })
    const [icd10Input, setIcd10Input] = useState('')
    const [icd10List, setIcd10List] = useState(existingNote?.icd10_codes || [])
    const [saving, setSaving] = useState(false)
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

    const addIcd = () => {
        const code = icd10Input.trim().toUpperCase()
        if (!code || icd10List.includes(code)) return
        setIcd10List(p => [...p, code])
        setIcd10Input('')
    }

    const handleSave = async () => {
        if (!form.subjective && !form.assessment)
            return toast.error('Fill at minimum Subjective and Assessment')
        setSaving(true)
        try {
            const payload = {
                patient: patient.id,
                appointment: appointmentId || null,
                ...form,
            }
            if (existingNote?.id) {
                await doctorAPI.updateNote(existingNote.id, payload)
                toast.success('Note updated')
            } else {
                await doctorAPI.createNote(payload)
                toast.success('SOAP note saved')
            }
            onSaved()
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Failed to save note')
        } finally { setSaving(false) }
    }

    const soapFields = [
        { key: 'subjective', label: "S — Subjective (Chief Complaint)", placeholder: "Patient's reported symptoms and history…", rows: 3 },
        { key: 'objective', label: "O — Objective (Clinical Findings)", placeholder: "Examination findings, vitals, test results…", rows: 3 },
        { key: 'assessment', label: "A — Assessment / Diagnosis (ICD-10)", placeholder: "e.g. I10 Essential Hypertension, R51 Headache", rows: 2 },
        { key: 'plan', label: "P — Plan", placeholder: "Management plan, follow-up instructions…", rows: 3 },
    ]

    return (
        <div>
            {soapFields.map(({ key, label, placeholder, rows }) => (
                <div key={key} style={{ marginBottom: '12px' }}>
                    {lbl(label)}
                    <textarea value={form[key]} onChange={e => set(key, e.target.value)}
                        placeholder={placeholder} rows={rows}
                        style={{ ...inp, resize: 'vertical', minHeight: `${rows * 28}px` }} />
                </div>
            ))}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <Btn onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : existingNote ? '✓ Update & Sign' : '✓ Save & Sign Notes'}
                </Btn>
            </div>
        </div>
    )
}

/* ═══════════════════════════════════════════════════════════════════
   PRESCRIPTION WRITER  — with drug search
═══════════════════════════════════════════════════════════════════ */
const FREQS = ['OD', 'BD', 'TDS', 'QDS', 'Nocte', 'PRN', 'Stat', 'Weekly']

function PrescriptionWriter({ patient, appointmentId, onSaved }) {
    const emptyItem = () => ({
        drug_name: '', drug_id: null,
        dose: '', frequency: 'BD', duration_days: 7, quantity: 0, instructions: '',
        dispense_source: 'pharmacy',
    })
    const [items, setItems] = useState([emptyItem()])
    const [notes, setNotes] = useState('')
    const [priority, setPriority] = useState('normal')
    const [saving, setSaving] = useState(false)

    const upd = (i, k, v) => setItems(p => { const a = [...p]; a[i] = { ...a[i], [k]: v }; return a })

    const handleDrugSelect = (i, selected) => {
        setItems(p => {
            const a = [...p]
            a[i] = {
                ...a[i],
                drug_name: selected.drug_name,
                drug_id: selected.drug_id || null,
                dose: selected.dose_hint || a[i].dose,
            }
            return a
        })
    }

    const handleSave = async () => {
        const valid = items.filter(it => it.drug_name.trim())
        if (!valid.length) return toast.error('Add at least one drug')
        if (valid.some(it => !it.dose.trim())) return toast.error('Fill dose for all drugs')
        setSaving(true)
        try {
            await doctorAPI.createPrescription({
                patient: patient.id,
                appointment: appointmentId || null,
                priority,
                notes,
                items: valid.map(it => ({
                    drug_name: it.drug_name,
                    dose: it.dose,
                    frequency: it.frequency,
                    duration_days: it.duration_days,
                    quantity_prescribed: it.quantity || 0,
                    instructions: it.instructions,
                    dispense_source: it.dispense_source,
                })),
            })
            toast.success(`💊 Prescription sent to pharmacy for ${patient.first_name}`)
            setItems([emptyItem()]); setNotes(''); setPriority('normal')
            onSaved()
        } catch (e) {
            const err = e.response?.data
            toast.error(typeof err === 'object' ? JSON.stringify(err) : 'Failed to write prescription')
        } finally { setSaving(false) }
    }

    const pColors = { normal: C.b, urgent: C.w, stat: C.d }

    return (
        <div>
            {/* Priority selector */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                {['normal', 'urgent', 'stat'].map(p => (
                    <button key={p} onClick={() => setPriority(p)} style={{
                        padding: '6px 14px', borderRadius: '8px',
                        border: `1.5px solid ${priority === p ? pColors[p] : C.br}`,
                        background: priority === p ? pColors[p] : '#fff',
                        color: priority === p ? '#fff' : C.t2,
                        fontSize: '12px', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase',
                    }}>{p}</button>
                ))}
            </div>

            {/* Drug rows */}
            {items.map((item, i) => (
                <div key={i} style={{
                    background: C.bg, borderRadius: '10px', padding: '12px',
                    marginBottom: '8px', border: `1px solid ${C.br}`
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: C.t2 }}>Drug {i + 1}</span>
                        {items.length > 1 && (
                            <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: C.d, fontSize: '12px'
                                }}>Remove</button>
                        )}
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                        {lbl('Drug Name *')}
                        <DrugSearchInput
                            value={item.drug_name}
                            onSelect={sel => handleDrugSelect(i, sel)}
                            placeholder="Search pharmacy registry or type name…"
                        />
                        {item.drug_id && (
                            <div style={{ fontSize: '11px', color: C.ok, marginTop: '3px' }}>
                                ✓ Linked to pharmacy registry
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px', gap: '8px', marginBottom: '8px' }}>
                        <div>
                            {lbl('Dose *')}
                            <input value={item.dose} onChange={e => upd(i, 'dose', e.target.value)}
                                placeholder="e.g. 5mg" style={inp} />
                        </div>
                        <div>
                            {lbl('Frequency')}
                            <select value={item.frequency} onChange={e => upd(i, 'frequency', e.target.value)} style={inp}>
                                {FREQS.map(f => <option key={f}>{f}</option>)}
                            </select>
                        </div>
                        <div>
                            {lbl('Days')}
                            <input type="number" min={1} value={item.duration_days}
                                onChange={e => upd(i, 'duration_days', Number(e.target.value))} style={inp} />
                        </div>
                        <div>
                            {lbl('Qty')}
                            <input type="number" min={0} value={item.quantity}
                                onChange={e => upd(i, 'quantity', Number(e.target.value))} style={inp} />
                        </div>
                    </div>
                    <div>
                        {lbl('Instructions')}
                        <input value={item.instructions}
                            onChange={e => upd(i, 'instructions', e.target.value)}
                            placeholder="e.g. Take with food, avoid alcohol" style={inp} />
                    </div>
                    <div style={{ marginTop: '8px' }}>
                        {lbl('Where will the patient get it?')}
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {[['pharmacy', '🏥 In-house pharmacy'], ['external', '🛒 Patient buys outside']].map(([val, txt]) => (
                                <button key={val} type="button" onClick={() => upd(i, 'dispense_source', val)} style={{
                                    flex: 1, padding: '7px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                                    cursor: 'pointer', transition: 'all .15s',
                                    border: `1.5px solid ${item.dispense_source === val ? C.b : C.br}`,
                                    background: item.dispense_source === val ? C.bl : '#fff',
                                    color: item.dispense_source === val ? C.bd : C.t2,
                                }}>{txt}</button>
                            ))}
                        </div>
                        {item.dispense_source === 'external' && (
                            <div style={{ fontSize: '11px', color: C.t3, marginTop: '4px' }}>
                                Won’t be dispensed here — printed on the prescription for the patient to buy outside.
                            </div>
                        )}
                    </div>
                </div>
            ))}

            <button onClick={() => setItems(p => [...p, emptyItem()])} style={{
                width: '100%', background: 'none', border: `1.5px dashed ${C.b}`,
                borderRadius: '8px', color: C.b, padding: '8px',
                cursor: 'pointer', fontSize: '13px', fontWeight: 600, marginBottom: '12px',
            }}>+ Add Drug</button>

            {lbl('Notes to Pharmacist')}
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
                rows={2} placeholder="Overall prescription instructions, special notes…"
                style={{ ...inp, resize: 'vertical', marginBottom: '12px' }} />

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Btn onClick={handleSave} disabled={saving}>
                    {saving ? 'Sending…' : `💊 Send to Pharmacy (${items.filter(i => i.drug_name).length} drug${items.length > 1 ? 's' : ''})`}
                </Btn>
            </div>
        </div>
    )
}

/* ═══════════════════════════════════════════════════════════════════
   LAB ORDER WRITER
═══════════════════════════════════════════════════════════════════ */
const COMMON_TESTS = [
    'FBC', 'U/E/Cr', 'LFT', 'Lipid Profile', 'Fasting Blood Sugar', 'HbA1c',
    'Thyroid Function', 'Urinalysis', 'Urine MCS', 'Blood Culture',
    'Hepatitis B/C', 'HIV Screen', 'Malaria RDT', 'Widal Test',
    'Chest X-Ray', 'ECG', 'Echocardiography', 'Abdominal Ultrasound',
    'CD4 Count', 'Sputum AFB', 'Troponin I', 'D-Dimer', 'CRP', 'ESR',
]

function LabOrderWriter({ patient, appointmentId, onSaved }) {
    const [selected, setSelected] = useState([])
    const [custom, setCustom] = useState('')
    const [notes, setNotes] = useState('')
    const [priority, setPriority] = useState('routine')
    const [saving, setSaving] = useState(false)
    const [labTests, setLabTests] = useState([]) // from catalogue if available

    // Try to load lab test catalogue
    useEffect(() => {
        import('../../api/lab').then(mod => {
            mod.labAPI.tests().then(r => setLabTests(r.data.results || r.data)).catch(() => { })
        })
    }, [])

    const toggle = test => setSelected(p => p.includes(test) ? p.filter(t => t !== test) : [...p, test])

    const addCustom = () => {
        const t = custom.trim()
        if (!t) return
        if (!selected.includes(t)) setSelected(p => [...p, t])
        setCustom('')
    }

    const handleSave = async () => {
        if (!selected.length) return toast.error('Select at least one test')

        // Map selected names to real catalogue IDs
        const testIds = labTests
            .filter(t => selected.includes(t.name))
            .map(t => t.id)

        // Anything selected that ISN'T in the catalogue would silently never
        // become a real LabOrderItem — the backend only accepts test_ids, so a
        // "fallback" to sending free-text names was never actually functional.
        // This is exactly what broke Malaria RDT before: the AI panel in
        // LabPage.jsx checks item.test_name, but no LabOrderItem was ever
        // created for it, so there was nothing to flag.
        const unmatched = selected.filter(name => !labTests.some(t => t.name === name))
        if (unmatched.length) {
            toast.error(
                `"${unmatched.join('", "')}" ${unmatched.length > 1 ? 'are' : 'is'} not in the Lab test catalogue yet. ` +
                `Ask Lab/Admin to add ${unmatched.length > 1 ? 'them' : 'it'} before ordering.`
            )
            return
        }

        setSaving(true)
        try {
            await doctorAPI.createLabOrder({
                patient: patient.id,
                priority,
                clinical_info: notes,
                test_ids: testIds,
            })
            toast.success(`🧪 Lab order sent — ${selected.length} test(s)`)
            setSelected([]); setNotes('')
            onSaved()
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Failed to place lab order')
        } finally { setSaving(false) }
    }

    // Merge common tests with catalogue names
    const displayTests = labTests.length
        ? [...new Set([...labTests.map(t => t.name), ...COMMON_TESTS])]
        : COMMON_TESTS

    return (
        <div>
            {/* Priority */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                {['routine', 'urgent', 'stat'].map(p => (
                    <button key={p} onClick={() => setPriority(p)} style={{
                        padding: '5px 14px', borderRadius: '8px',
                        border: `1.5px solid ${priority === p ? C.i : C.br}`,
                        background: priority === p ? C.i : '#fff',
                        color: priority === p ? '#fff' : C.t2,
                        fontSize: '12px', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase',
                    }}>{p}</button>
                ))}
            </div>

            {/* Quick-pick grid */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                {displayTests.map(t => {
                    const on = selected.includes(t)
                    const inCat = labTests.some(lt => lt.name === t)
                    return (
                        <button key={t} onClick={() => toggle(t)} title={inCat ? '' : 'Not in Lab catalogue yet — ask Lab/Admin to add this test before ordering'} style={{
                            padding: '5px 10px', borderRadius: '20px',
                            fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                            border: `1.5px solid ${on ? C.i : inCat ? C.br : '#fca5a5'}`,
                            background: on ? C.i : inCat ? C.iB : '#fef2f2',
                            color: on ? '#fff' : inCat ? C.i : '#b91c1c',
                            transition: 'all .1s',
                        }}>
                            {on ? '✓ ' : inCat ? '' : '⚠ '}{t}
                        </button>
                    )
                })}
            </div>

            {/* Custom test input */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input value={custom} onChange={e => setCustom(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustom()}
                    placeholder="Custom test (press Enter or Add)…"
                    style={{ ...inp, flex: 1 }} />
                <Btn onClick={addCustom} variant="outline" size="sm">Add</Btn>
            </div>

            {/* Selected summary */}
            {selected.length > 0 && (
                <div style={{ padding: '10px 14px', background: C.bl, borderRadius: '10px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: C.bd, marginBottom: '6px' }}>
                        Selected ({selected.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {selected.map(t => (
                            <span key={t} style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                padding: '3px 8px', borderRadius: '12px',
                                background: C.i, color: '#fff', fontSize: '12px', fontWeight: 600
                            }}>
                                {t}
                                <button onClick={() => toggle(t)}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'rgba(255,255,255,.7)', fontSize: '14px', lineHeight: 1, padding: 0
                                    }}>×</button>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {lbl('Clinical Notes / Reason for Tests')}
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
                rows={2} placeholder="Reason for tests, clinical context, relevant history…"
                style={{ ...inp, resize: 'vertical', marginBottom: '12px' }} />

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Btn onClick={handleSave} disabled={saving || !selected.length} variant="blue">
                    {saving ? 'Sending…' : `🧪 Send to Lab (${selected.length} test${selected.length !== 1 ? 's' : ''})`}
                </Btn>
            </div>
        </div>
    )
}

/* ═══════════════════════════════════════════════════════════════════
   IPD ADMISSION REQUEST
   Doctor creates a REQUEST — nurse converts it to an actual Admission
═══════════════════════════════════════════════════════════════════ */
function AdmitForm({ patient, onSaved }) {
    const [wards, setWards] = useState([])
    const [wardId, setWardId] = useState('')
    const [diagnosis, setDiagnosis] = useState('')
    const [admType, setAdmType] = useState('emergency')
    const [urgency, setUrgency] = useState('urgent')
    const [special, setSpecial] = useState('')
    const [summary, setSummary] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        doctorAPI.ipdBeds()
            .then(r => {
                // Group by ward
                const beds = r.data.results ?? r.data
                const wardMap = {}
                beds.filter(b => b.status === 'available').forEach(b => {
                    if (!wardMap[b.ward_name]) wardMap[b.ward_name] = { name: b.ward_name, id: b.ward, count: 0 }
                    wardMap[b.ward_name].count++
                })
                setWards(Object.values(wardMap))
            })
            .catch(() => { })
    }, [])

    const handleSubmit = async () => {
        if (!diagnosis.trim()) return toast.error('Enter admitting diagnosis')
        setSaving(true)
        try {
            await doctorAPI.admitRequest({
                patient: patient.id,
                requested_by: 'Doctor',
                preferred_ward: wardId || null,
                admission_type: admType,
                admitting_diagnosis: diagnosis,
                clinical_summary: summary,
                special_requirements: special,
                urgency,
            })
            toast.success(`🏥 Admission request sent for ${patient.first_name}`)
            onSaved()
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Admission request failed')
        } finally { setSaving(false) }
    }

    return (
        <div>
            <div style={{
                background: C.wB, border: `1px solid #fde68a`, borderRadius: '10px',
                padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#854d0e'
            }}>
                ℹ The nurse will receive this request and assign a bed.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                    {lbl('Preferred Ward')}
                    <select value={wardId} onChange={e => setWardId(e.target.value)} style={inp}>
                        <option value="">No preference</option>
                        {wards.map(w => (
                            <option key={w.name} value={w.id}>
                                {w.name} ({w.count} bed{w.count !== 1 ? 's' : ''} available)
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    {lbl('Admission Type')}
                    <select value={admType} onChange={e => setAdmType(e.target.value)} style={inp}>
                        <option value="emergency">Emergency</option>
                        <option value="elective">Elective</option>
                        <option value="transfer">Transfer</option>
                    </select>
                </div>
                <div>
                    {lbl('Urgency')}
                    <select value={urgency} onChange={e => setUrgency(e.target.value)} style={inp}>
                        <option value="routine">Routine</option>
                        <option value="urgent">Urgent</option>
                        <option value="emergency">Emergency</option>
                    </select>
                </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
                {lbl('Admitting Diagnosis *')}
                <textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)}
                    rows={3} placeholder="Primary diagnosis for admission…"
                    style={{ ...inp, resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: '12px' }}>
                {lbl('Clinical Summary')}
                <textarea value={summary} onChange={e => setSummary(e.target.value)}
                    rows={2} placeholder="Brief clinical course, relevant history…"
                    style={{ ...inp, resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: '16px' }}>
                {lbl('Special Requirements')}
                <input value={special} onChange={e => setSpecial(e.target.value)}
                    placeholder="e.g. Oxygen, isolation precautions, cardiac monitor…"
                    style={inp} />
            </div>

            <Btn onClick={handleSubmit} disabled={saving || !diagnosis} variant="warning"
                style={{ width: '100%', justifyContent: 'center' }}>
                {saving ? 'Sending…' : '🏥 Send Admission Request to Nursing'}
            </Btn>
        </div>
    )
}

/* ═══════════════════════════════════════════════════════════════════
   HISTORY PANEL
═══════════════════════════════════════════════════════════════════ */
function HistoryPanel({ summary }) {
    const [tab, setTab] = useState('notes')

    const tabs = [
        ['notes', `Notes (${summary.notes?.length || 0})`],
        ['rx', `Rx (${summary.prescriptions?.length || 0})`],
        ['labs', `Labs (${summary.lab_orders?.length || 0})`],
        ['admissions', `Admissions (${summary.admissions?.length || 0})`],
    ]

    return (
        <div>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                {tabs.map(([id, label]) => (
                    <button key={id} onClick={() => setTab(id)} style={{
                        padding: '5px 12px', borderRadius: '6px', border: 'none',
                        fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                        background: tab === id ? C.sa : C.bg, color: tab === id ? '#fff' : C.t2,
                    }}>{label}</button>
                ))}
            </div>

            {tab === 'notes' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                    {!(summary.notes || []).length && <Empty text="No clinical notes" />}
                    {(summary.notes || []).map(n => (
                        <div key={n.id} style={{
                            background: C.bg, borderRadius: '10px', padding: '12px',
                            borderLeft: `3px solid ${C.b}`
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontWeight: 700, fontSize: '12px', color: C.b }}>Dr. {n.doctor_name}</span>
                                <span style={{ fontSize: '11px', color: C.t3 }}>{new Date(n.created_at).toLocaleDateString()}</span>
                            </div>
                            {[['S', n.subjective], ['O', n.objective], ['A', n.assessment], ['P', n.plan]].map(([k, v]) => v ? (
                                <div key={k} style={{ marginBottom: '5px', fontSize: '12.5px' }}>
                                    <strong style={{ color: C.t2 }}>{k}: </strong>{v}
                                </div>
                            ) : null)}
                            {n.icd10_codes?.length > 0 && (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                                    {n.icd10_codes.map(c => (
                                        <span key={c} style={{
                                            padding: '2px 7px', borderRadius: '10px',
                                            background: C.iB, color: C.i, fontSize: '11px', fontWeight: 700
                                        }}>
                                            {c}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {tab === 'rx' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                    {!(summary.prescriptions || []).length && <Empty text="No prescriptions" />}
                    {(summary.prescriptions || []).map(rx => (
                        <div key={rx.id} style={{
                            background: C.bg, borderRadius: '10px', padding: '12px',
                            borderLeft: `3px solid ${C.p}`
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontWeight: 700, fontSize: '12px' }}>{rx.prescription_id}</span>
                                <Tag color={rx.status === 'dispensed' ? C.ok : C.w}
                                    bg={rx.status === 'dispensed' ? C.okB : C.wB}>{rx.status}</Tag>
                            </div>
                            <div style={{ fontSize: '11.5px', color: C.t3, marginBottom: '6px' }}>
                                {new Date(rx.created_at).toLocaleDateString()} · Dr. {rx.doctor_name}
                            </div>
                            {rx.items?.map((it, i) => (
                                <div key={i} style={{ fontSize: '12.5px', color: C.t1 }}>
                                    • {it.drug_name} — {it.dose} {it.frequency} × {it.duration_days}d
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            {tab === 'labs' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                    {!(summary.lab_orders || []).length && <Empty text="No lab orders" />}
                    {(summary.lab_orders || []).map(lo => (
                        <div key={lo.id} style={{
                            background: C.bg, borderRadius: '10px', padding: '12px',
                            borderLeft: `3px solid ${C.i}`
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontWeight: 700, fontSize: '12px' }}>{lo.order_num}</span>
                                <Tag color={C.i} bg={C.iB}>{lo.status}</Tag>
                            </div>
                            <div style={{ fontSize: '11.5px', color: C.t3, marginBottom: '6px' }}>
                                {new Date(lo.created_at).toLocaleDateString()}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {lo.tests?.map((t, i) => (
                                    <span key={i} style={{
                                        fontSize: '11px', padding: '2px 7px', borderRadius: '10px',
                                        background: C.iB, color: C.i, fontWeight: 600
                                    }}>{t.name}</span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'admissions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                    {!(summary.admissions || []).length && <Empty text="No admissions" />}
                    {(summary.admissions || []).map(a => (
                        <div key={a.id} style={{
                            background: C.bg, borderRadius: '10px', padding: '12px',
                            borderLeft: `3px solid ${C.w}`
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontWeight: 700, fontSize: '12px' }}>Bed {a.bed_number}</span>
                                <Tag color={a.status === 'discharged' ? C.ok : C.w}
                                    bg={a.status === 'discharged' ? C.okB : C.wB}>{a.status}</Tag>
                            </div>
                            <div style={{ fontSize: '12px', color: C.t2 }}>{a.diagnosis}</div>
                            <div style={{ fontSize: '11px', color: C.t3, marginTop: '3px' }}>
                                Admitted {new Date(a.admitted_at).toLocaleDateString()}
                                {a.days_admitted ? ` · ${a.days_admitted}d` : ''}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

/* ═══════════════════════════════════════════════════════════════════
   PATIENT INFO BANNER
═══════════════════════════════════════════════════════════════════ */
function PatientBanner({ pt }) {
    return (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {[
                { label: 'Blood', value: pt.blood_group || '—' },
                { label: 'Genotype', value: pt.genotype || '—' },
                { label: 'Insurance', value: pt.insurance || '—' },
                { label: 'Phone', value: pt.phone || '—' },
            ].map(f => (
                <div key={f.label} style={{ fontSize: '12px', color: C.t2 }}>
                    <strong style={{ color: C.t1 }}>{f.label}:</strong> {f.value}
                </div>
            ))}
            {pt.allergies && (
                <div style={{
                    padding: '4px 10px', background: C.dB,
                    border: '1px solid #fecaca', borderRadius: '8px',
                    fontSize: '12px', color: C.d, fontWeight: 700
                }}>
                    ⚠ Allergies: {pt.allergies}
                </div>
            )}
        </div>
    )
}

/* ═══════════════════════════════════════════════════════════════════
   CONSULTATION PANEL — right side
═══════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════
   CHARGE FORM — doctor raises a billable charge (e.g. consultation fee)
═══════════════════════════════════════════════════════════════════ */
function ChargeForm({ patient, appointmentId, onSaved }) {
    const [description, setDescription] = useState('Consultation fee')
    const [amount, setAmount] = useState('')
    const [category, setCategory] = useState('consultation')
    const [saving, setSaving] = useState(false)

    const QUICK = [
        { label: 'Consultation', desc: 'Consultation fee', cat: 'consultation' },
        { label: 'Procedure', desc: 'Procedure fee', cat: 'procedure' },
        { label: 'Review', desc: 'Follow-up review fee', cat: 'consultation' },
        { label: 'Other', desc: '', cat: 'other' },
    ]

    const submit = async () => {
        const amt = Number(amount)
        if (!amt || amt <= 0) return toast.error('Enter a valid amount')
        if (!description.trim()) return toast.error('Enter a description')
        setSaving(true)
        try {
            const { data } = await doctorAPI.raiseCharge({
                patient: patient.id,
                appointment: appointmentId || null,
                description: description.trim(),
                category,
                amount: amt,
            })
            toast.success(`Charge added to ${data.invoice_number} · balance ₦${data.balance_due.toLocaleString()}`)
            setAmount(''); setDescription('Consultation fee'); setCategory('consultation')
            onSaved && onSaved()
        } catch (e) {
            const err = e.response?.data
            toast.error(typeof err === 'object' ? (err.detail || JSON.stringify(err)) : 'Could not raise charge')
        } finally { setSaving(false) }
    }

    return (
        <div>
            <div style={{ fontSize: '13px', color: C.t2, marginBottom: '12px' }}>
                Post a charge to this patient’s bill. It’s added to their open invoice (a new one is opened if none exists).
            </div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {QUICK.map(q => (
                    <button key={q.label} type="button"
                        onClick={() => { setDescription(q.desc); setCategory(q.cat) }}
                        style={{
                            padding: '6px 12px', borderRadius: '8px', border: `1.5px solid ${C.br}`,
                            background: '#fff', color: C.t2, fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                        }}>
                        {q.label}
                    </button>
                ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '10px', marginBottom: '12px' }}>
                <div>
                    {lbl('Description')}
                    <input value={description} onChange={e => setDescription(e.target.value)}
                        placeholder="e.g. Consultation fee" style={inp} />
                </div>
                <div>
                    {lbl('Amount (₦)')}
                    <input type="number" min={0} value={amount}
                        onChange={e => setAmount(e.target.value)} placeholder="0" style={inp} />
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Btn variant="success" onClick={submit} disabled={saving}>
                    {saving ? 'Posting…' : '💳 Add to Bill'}
                </Btn>
            </div>
        </div>
    )
}

const winBtn = {
    width: '24px', height: '24px', borderRadius: '6px', border: 'none', cursor: 'pointer',
    background: 'rgba(255,255,255,.2)', color: '#fff', fontSize: '12px', lineHeight: 1, fontFamily: 'inherit'
}
function dCtrl(on) {
    return {
        width: '34px', height: '34px', borderRadius: '8px', border: 'none', cursor: 'pointer',
        fontSize: '14px', background: on ? '#e6f5f1' : '#f3f4f6'
    }
}

/* ═══════════════════════════════════════════════════════════════════
   TELEMEDICINE CALL WINDOW — floating, draggable, minimizable.
   Pops up on Start; the doctor keeps charting underneath.
═══════════════════════════════════════════════════════════════════ */
function TeleCallWindow({ tele, patientName, onClose }) {
    const medium = tele.consult_type || 'video'    // video | voice | async
    const isVideo = medium === 'video'
    const isVoice = medium === 'voice'
    const isAsync = medium === 'async'

    const [micOn, setMicOn] = useState(true)
    const [camOn, setCamOn] = useState(isVideo)
    const [elapsed, setElapsed] = useState(0)
    const [messages, setMessages] = useState([])
    const [draft, setDraft] = useState('')
    const [showChat, setShowChat] = useState(isAsync)
    const [minimized, setMinimized] = useState(false)
    const [busy, setBusy] = useState(false)
    const [peerState, setPeerState] = useState('connecting')   // connecting | connected | disconnected | left
    const [pos, setPos] = useState(() => ({
        left: Math.max(16, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 392),
        top: Math.max(16, (typeof window !== 'undefined' ? window.innerHeight : 800) - 480),
    }))
    const videoRef = useRef(null)   // local (PiP)
    const remoteRef = useRef(null)   // remote (patient)
    const streamRef = useRef(null)
    const remoteStream = useRef(null)
    const rtcRef = useRef(null)
    const chatEndRef = useRef(null)
    const startedAt = useRef(Date.now())
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const inviteLink = tele.join_url || `${origin}${tele.join_path}`

    // local media + WebRTC (doctor = initiator). Skipped for async/chat.
    useEffect(() => {
        if (isAsync) return
        let cancelled = false
        navigator.mediaDevices?.getUserMedia({ video: isVideo, audio: true })
            .then(stream => {
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
                streamRef.current = stream
                if (videoRef.current) videoRef.current.srcObject = stream

                if (tele.room_name) {
                    rtcRef.current = createTeleRTC({
                        wsUrl: teleWsUrl(tele.room_name),
                        initiator: true,
                        localStream: stream,
                        onRemote: (rs) => { remoteStream.current = rs; if (remoteRef.current) remoteRef.current.srcObject = rs; setPeerState('connected') },
                        onStatus: (st) => { if (st === 'connected') setPeerState('connected'); else if (st === 'failed' || st === 'disconnected') setPeerState('disconnected') },
                        onPeerLeft: () => { setPeerState('left'); remoteStream.current = null; if (remoteRef.current) remoteRef.current.srcObject = null },
                    })
                }
            })
            .catch(() => toast.error('Camera/mic unavailable — check browser permissions'))
        return () => {
            cancelled = true
            rtcRef.current?.close()
            streamRef.current?.getTracks().forEach(t => t.stop())
        }
    }, [])

    // re-attach streams after expand / chat toggle (video elements remount)
    useEffect(() => {
        if (minimized) return
        if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current
        if (remoteRef.current && remoteStream.current) remoteRef.current.srcObject = remoteStream.current
    }, [minimized, showChat])

    // timer
    useEffect(() => {
        const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000)
        return () => clearInterval(id)
    }, [])

    // chat polling
    const loadMessages = useCallback(() => {
        teleAPI.messages(tele.id).then(({ data }) => setMessages(data.results || data)).catch(() => { })
    }, [tele.id])
    useEffect(() => { loadMessages(); const id = setInterval(loadMessages, 4000); return () => clearInterval(id) }, [loadMessages])
    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, showChat])

    const toggleMic = () => { const t = streamRef.current?.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; setMicOn(t.enabled) } }
    const toggleCam = () => { const t = streamRef.current?.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; setCamOn(t.enabled) } }

    const endCall = async () => {
        setBusy(true)
        try { await teleAPI.end(tele.id, {}) } catch { }
        rtcRef.current?.close()
        streamRef.current?.getTracks().forEach(t => t.stop())
        setBusy(false); toast.success('Session ended'); onClose && onClose()
    }
    const send = async () => {
        if (!draft.trim()) return
        const text = draft.trim(); setDraft('')
        try { await teleAPI.sendMessage(tele.id, { sender_label: 'doctor', message: text }); loadMessages() }
        catch { toast.error('Message failed'); setDraft(text) }
    }
    const copyInvite = () => navigator.clipboard?.writeText(inviteLink).then(() => toast.success('Invite link copied')).catch(() => { })

    // drag by header
    const onDragStart = (e) => {
        const startX = e.clientX, startY = e.clientY, orig = { ...pos }
        const move = (ev) => setPos({
            left: Math.min(Math.max(0, orig.left + ev.clientX - startX), window.innerWidth - 120),
            top: Math.min(Math.max(0, orig.top + ev.clientY - startY), window.innerHeight - 56),
        })
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
        window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
    }

    const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    const width = minimized ? 240 : (isVoice ? 300 : 360)
    const icon = isVideo ? '🎥' : isVoice ? '📞' : '💬'

    const header = (
        <div onMouseDown={onDragStart} style={{
            cursor: 'move', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px', background: C.sb, color: '#fff',
            borderTopLeftRadius: '14px', borderTopRightRadius: '14px',
            borderBottomLeftRadius: minimized ? '14px' : 0, borderBottomRightRadius: minimized ? '14px' : 0
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: C.ok, flexShrink: 0 }} />
                <span style={{ fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {icon} {patientName} · {fmt(elapsed)}
                </span>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button onClick={() => setMinimized(m => !m)} title={minimized ? 'Expand' : 'Minimize'} style={winBtn}>{minimized ? '▢' : '—'}</button>
                <button onClick={endCall} disabled={busy} title="End session" style={{ ...winBtn, background: C.d }}>✕</button>
            </div>
        </div>
    )

    if (minimized) {
        return <div style={{
            position: 'fixed', left: pos.left, top: pos.top, width, zIndex: 950,
            borderRadius: '14px', boxShadow: '0 12px 40px rgba(0,0,0,.3)'
        }}>{header}</div>
    }

    return (
        <div style={{
            position: 'fixed', left: pos.left, top: pos.top, width, zIndex: 950, background: '#fff',
            borderRadius: '14px', boxShadow: '0 12px 40px rgba(0,0,0,.3)', overflow: 'hidden', display: 'flex', flexDirection: 'column'
        }}>
            {header}

            {!isAsync && (
                <div style={{
                    position: 'relative', background: C.sb, height: isVoice ? '140px' : '200px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    {isVideo ? (
                        <>
                            {/* remote (patient) video fills the area */}
                            <video ref={remoteRef} autoPlay playsInline
                                style={{
                                    position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                                    background: '#000', opacity: peerState === 'connected' ? 1 : 0
                                }} />
                            {peerState !== 'connected' && (
                                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.6)', zIndex: 1 }}>
                                    <div style={{ fontSize: '13px', color: '#fff', fontWeight: 600 }}>{patientName}</div>
                                    <div style={{ fontSize: '11px', marginTop: '3px' }}>
                                        {peerState === 'left' ? 'Patient left the call'
                                            : peerState === 'disconnected' ? 'Connection lost — retrying…'
                                                : 'Waiting for patient to join…'}
                                    </div>
                                </div>
                            )}
                            {/* local PiP */}
                            <div style={{
                                position: 'absolute', bottom: '10px', right: '10px', width: '104px', height: '72px', zIndex: 2,
                                borderRadius: '9px', overflow: 'hidden', border: '2px solid rgba(255,255,255,.2)', background: '#000'
                            }}>
                                <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                                {!camOn && <div style={{ position: 'absolute', inset: 0, background: '#1a3d33', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.6)', fontSize: '10px' }}>Cam off</div>}
                            </div>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', color: '#fff' }}>
                            {/* hidden element carries the remote audio for voice calls */}
                            <video ref={remoteRef} autoPlay playsInline style={{ display: 'none' }} />
                            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto 8px' }}>📞</div>
                            <div style={{ fontSize: '13px', fontWeight: 600 }}>Voice call</div>
                            <div style={{ fontSize: '11px', opacity: .6 }}>
                                {peerState === 'connected' ? `Connected · ${patientName}`
                                    : peerState === 'left' ? 'Patient left'
                                        : `Calling ${patientName}…`}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', borderBottom: showChat ? `1px solid ${C.br}` : 'none' }}>
                {!isAsync && <button onClick={toggleMic} style={dCtrl(micOn)}>{micOn ? '🎙' : '🔇'}</button>}
                {isVideo && <button onClick={toggleCam} style={dCtrl(camOn)}>{camOn ? '🎥' : '📷'}</button>}
                <button onClick={() => setShowChat(c => !c)} style={dCtrl(showChat)} title="Chat">💬</button>
                <button onClick={copyInvite} style={{ flex: 1, fontSize: '11.5px', border: `1px solid ${C.br}`, background: '#fff', color: C.i, borderRadius: '8px', padding: '8px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>🔗 Invite</button>
                <button onClick={endCall} disabled={busy} style={{ fontSize: '11.5px', border: 'none', background: C.d, color: '#fff', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' }}>End</button>
            </div>

            {showChat && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '180px' }}>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {messages.length === 0
                            ? <div style={{ color: C.t3, fontSize: '11.5px', textAlign: 'center', marginTop: '12px' }}>No messages yet.</div>
                            : messages.map((m, i) => {
                                const mine = m.sender_label === 'doctor'; return (
                                    <div key={m.id || i} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                                        <div style={{ background: mine ? C.b : '#f3f4f6', color: mine ? '#fff' : C.t1, padding: '6px 9px', borderRadius: '10px', fontSize: '12px' }}>{m.message}</div>
                                    </div>)
                            })}
                        <div ref={chatEndRef} />
                    </div>
                    <div style={{ padding: '8px', borderTop: `1px solid ${C.br}`, display: 'flex', gap: '6px' }}>
                        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
                            placeholder="Message patient…" style={{ ...inp, fontSize: '12px', padding: '7px 9px' }} />
                        <Btn size="sm" onClick={send}>Send</Btn>
                    </div>
                </div>
            )}
        </div>
    )
}


/* ═══════════════════════════════════════════════════════════════════
   CONSULTATION PANEL
═══════════════════════════════════════════════════════════════════ */
function PatientAlerts({ patientId }) {
    const [alerts, setAlerts] = useState([])
    useEffect(() => {
        if (!patientId) { setAlerts([]); return }
        let on = true
        const load = () => notificationsAPI.list({ patient: patientId })
            .then(r => { if (on) setAlerts((Array.isArray(r.data) ? r.data : (r.data?.results || [])).slice(0, 5)) })
            .catch(() => { })
        load()
        const id = setInterval(load, 30000)
        return () => { on = false; clearInterval(id) }
    }, [patientId])
    if (!alerts.length) return null
    const dismiss = async (a) => {
        try { await notificationsAPI.markRead(a.id) } catch { }
        setAlerts(list => list.filter(x => x.id !== a.id))
    }
    return (
        <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {alerts.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: a.is_read ? '#f9fafb' : C.iB, border: `1px solid ${a.is_read ? C.br : '#bfdbfe'}`, borderRadius: '10px', padding: '9px 12px' }}>
                    <span style={{ fontSize: '14px' }}>{a.category === 'lab' ? '🧪' : a.category === 'pharmacy' ? '💊' : a.category === 'admission' ? '🛏️' : '🔔'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 700 }}>{a.title}</div>
                        <div style={{ fontSize: '12px', color: C.t2 }}>{a.message}</div>
                    </div>
                    <span style={{ fontSize: '10.5px', color: C.t3, whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                    <button onClick={() => dismiss(a)} style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer', fontSize: '15px', lineHeight: 1 }}>×</button>
                </div>
            ))}
        </div>
    )
}

function ConsultationPanel({ appointment, onStatusChange, onPrev, onNext, hasPrev, hasNext }) {
    const [summary, setSummary] = useState(null)
    const [loading, setLoading] = useState(false)
    const [tab, setTab] = useState('soap')
    const [editNote, setEditNote] = useState(null)
    const [callOpen, setCallOpen] = useState(false)
    const [teleSession, setTeleSession] = useState(null)

    const load = useCallback(async () => {
        if (!appointment?.patient) return
        setLoading(true)
        try {
            const { data } = await doctorAPI.consultation(appointment.patient)
            setSummary(data)
            const linked = data.notes?.find(n => n.appointment === appointment.id)
            setEditNote(linked || null)
        } catch { toast.error('Failed to load patient data') }
        finally { setLoading(false) }
    }, [appointment])

    useEffect(() => { setTab('soap'); setCallOpen(false); setTeleSession(appointment?.tele || null); load() }, [load])

    if (!appointment) {
        return (
            <div style={{
                ...card(), display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', minHeight: '420px'
            }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>👨‍⚕️</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: C.t2 }}>Select a patient from the queue</div>
                <div style={{ fontSize: '13px', color: C.t3, marginTop: '6px' }}>Click any appointment above to begin consultation</div>
            </div>
        )
    }

    const pt = summary?.patient
    const pd = appointment.patient_detail || {}
    const name = pt ? `${pt.first_name} ${pt.last_name}` : `${pd.first_name || ''} ${pd.last_name || ''}`.trim()
    const initials = (name.split(' ').map(x => x[0]).join('').slice(0, 2) || '??').toUpperCase()
    const tm = TRIAGE_META[appointment.triage] || TRIAGE_META.green
    const v = summary?.vitals?.[0]
    const tele = appointment.appointment_type === 'telemedicine'

    const TABS = [
        ['soap', 'SOAP Notes', null],
        ['rx', 'Prescriptions', summary?.prescriptions?.length || 0],
        ['lab', 'Lab Orders', summary?.lab_orders?.length || 0],
        ['admit', 'Admit', null],
        ['charge', 'Charge', null],
        ['history', 'Clinical History', null],
    ]

    return (
        <div>
            <PatientAlerts patientId={appointment.patient} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div style={card()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '48px', height: '48px', borderRadius: '50%', background: C.b, color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', fontWeight: 700, flexShrink: 0
                            }}>{initials}</div>
                            <div>
                                <div style={{ fontSize: '17px', fontWeight: 700 }}>{name}</div>
                                <div style={{ fontSize: '13px', color: C.t2 }}>{pt?.patient_id || pd.pid} · {pt?.gender || pd.gender} · {pt?.age || pd.age}y</div>
                                <div style={{ marginTop: '5px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    <Tag color={tm.color} bg={tm.bg}>{tm.label}</Tag>
                                    {pt?.blood_group && <Tag>{pt.blood_group}</Tag>}
                                    {tele && <Tag color={C.i} bg={C.iB}>🎥 Telemedicine</Tag>}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <Btn size="sm" variant="outline" onClick={onPrev} disabled={!hasPrev}>← Prev</Btn>
                                <Btn size="sm" variant="outline" onClick={onNext} disabled={!hasNext}>Next →</Btn>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                {['scheduled', 'confirmed'].includes(appointment.status) && (
                                    <Btn size="sm" variant="blue" onClick={() => onStatusChange(appointment.id, 'in_progress')}>▶ Start</Btn>
                                )}
                                {appointment.status === 'in_progress' && (
                                    <Btn size="sm" variant="success" onClick={() => onStatusChange(appointment.id, 'completed')}>✓ Conclude</Btn>
                                )}
                                <Btn size="sm" variant="outline" onClick={() => onStatusChange(appointment.id, 'cancelled')}>Cancel</Btn>
                            </div>
                        </div>
                    </div>
                    {pt
                        ? <PatientBanner pt={pt} />
                        : <div style={{ color: C.t3, fontSize: '12px' }}>Loading patient…</div>}
                    {appointment.chief_complaint && (
                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${C.br}`, fontSize: '12.5px' }}>
                            <span style={{ color: C.t3 }}>Chief complaint: </span>{appointment.chief_complaint}
                        </div>
                    )}
                </div>

                <div style={card()}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700 }}>Vitals from Nurse</span>
                        {v && <Tag color={C.bd} bg={C.bl}>{new Date(v.recorded_at).toLocaleString()}</Tag>}
                    </div>
                    {loading ? <div style={{ color: C.t3, fontSize: '12px' }}>Loading…</div> : <VitalsStrip vitals={summary?.vitals || []} />}
                </div>
            </div>

            {tele && (
                <div style={{
                    ...card(), marginBottom: '16px', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: C.i }}>
                            {teleSession?.consult_type === 'voice' ? '📞' : teleSession?.consult_type === 'async' ? '💬' : '🎥'} Telemedicine{teleSession ? ` · ${teleSession.consult_type}` : ''}
                        </span>
                        <span style={{ fontSize: '12px', color: C.t2 }}>The call floats on top — keep charting while it runs.</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {teleSession && (
                            <Btn size="sm" variant="outline" onClick={() =>
                                navigator.clipboard?.writeText(teleSession.join_url || `${window.location.origin}${teleSession.join_path}`)
                                    .then(() => toast.success('Invite link copied')).catch(() => { })
                            }>🔗 Copy invite</Btn>
                        )}
                        {!callOpen
                            ? <Btn size="sm" variant="success" onClick={async () => {
                                try {
                                    let sess = teleSession
                                    if (!sess) {
                                        const { data } = await teleAPI.ensureForAppointment(appointment.id, { start: true })
                                        sess = data; setTeleSession(data)
                                    } else if (sess.status !== 'live') {
                                        await teleAPI.start(sess.id)
                                    }
                                    setCallOpen(true)
                                } catch (e) {
                                    const code = e?.response?.status
                                    const detail = e?.response?.data?.detail || e?.message || 'see console'
                                    console.error('Start call failed:', code, e?.response?.data || e)
                                    toast.error(code === 404
                                        ? 'Call endpoint not found (404) — ensure_session route not wired on the backend'
                                        : `Could not start the call (${code || 'network'}: ${detail})`)
                                }
                            }}>▶ Start &amp; open call</Btn>
                            : <Btn size="sm" variant="outline" onClick={() => setCallOpen(true)}>Show call</Btn>}
                    </div>
                </div>
            )}

            <div style={card()}>
                <div style={{ display: 'flex', gap: '2px', borderBottom: `1px solid ${C.br}`, marginBottom: '16px', overflowX: 'auto' }}>
                    {TABS.map(([id, label, count]) => (
                        <button key={id} onClick={() => setTab(id)} style={{
                            padding: '10px 16px', fontSize: '13px', fontWeight: tab === id ? 700 : 500, cursor: 'pointer',
                            background: 'none', border: 'none', borderBottom: `2px solid ${tab === id ? C.b : 'transparent'}`,
                            color: tab === id ? C.b : C.t2, whiteSpace: 'nowrap', fontFamily: 'inherit',
                        }}>
                            {label}{count != null && count > 0 && (
                                <span style={{ marginLeft: '5px', fontSize: '10px', fontWeight: 700, background: C.okB, color: C.ok, padding: '1px 6px', borderRadius: '10px' }}>{count}</span>
                            )}
                        </button>
                    ))}
                </div>

                {!summary ? <div style={{ color: C.t3, fontSize: '13px', padding: '12px' }}>Loading…</div> : (
                    <>
                        {tab === 'soap' && <SOAPForm patient={summary.patient} appointmentId={appointment.id} existingNote={editNote} onSaved={load} />}
                        {tab === 'rx' && <PrescriptionWriter patient={summary.patient} appointmentId={appointment.id} onSaved={load} />}
                        {tab === 'lab' && <LabOrderWriter patient={summary.patient} appointmentId={appointment.id} onSaved={load} />}
                        {tab === 'admit' && <AdmitForm patient={summary.patient} onSaved={load} />}
                        {tab === 'charge' && <ChargeForm patient={summary.patient} appointmentId={appointment.id} onSaved={load} />}
                        {tab === 'history' && <HistoryPanel summary={summary} />}
                    </>
                )}
            </div>

            {/* Floating telemedicine call — stays on top while charting */}
            {tele && callOpen && teleSession && (
                <TeleCallWindow
                    tele={teleSession}
                    patientName={name}
                    onClose={() => setCallOpen(false)}
                />
            )}
        </div>
    )
}

/* ═══════════════════════════════════════════════════════════════════
   ROOT PAGE
═══════════════════════════════════════════════════════════════════ */
export default function DoctorWorkbench() {
    const [queue, setQueue] = useState([])
    const [qLoading, setQLoading] = useState(true)
    const [selected, setSelected] = useState(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const { user } = useAuthStore()

    const loadQueue = useCallback(async () => {
        setQLoading(true)
        try {
            const { data } = await doctorAPI.queue({ doctor_id: user?.id })
            setQueue(data)
        } catch { toast.error('Failed to load queue') }
        finally { setQLoading(false) }
    }, [user])

    useEffect(() => { loadQueue() }, [loadQueue, refreshKey])

    const handleStatusChange = async (id, newStatus) => {
        try {
            const { data } = await doctorAPI.updateStatus(id, newStatus)
            if (selected?.id === id) setSelected(data)
            setRefreshKey(k => k + 1)
            toast.success(`Status → ${newStatus}`)
        } catch { toast.error('Status update failed') }
    }

    const idx = selected ? queue.findIndex(a => a.id === selected.id) : -1
    const goPrev = () => { if (idx > 0) setSelected(queue[idx - 1]) }
    const goNext = () => { if (idx >= 0 && idx < queue.length - 1) setSelected(queue[idx + 1]) }

    return (
        <AppLayout title="Doctor's Workbench"
            action={<Btn variant="outline" size="sm" onClick={loadQueue}>↺ Refresh Queue</Btn>}>
            <QueueBar queue={queue} selected={selected} onSelect={setSelected} loading={qLoading} />
            <ConsultationPanel
                appointment={selected}
                onStatusChange={handleStatusChange}
                onPrev={goPrev}
                onNext={goNext}
                hasPrev={idx > 0}
                hasNext={idx >= 0 && idx < queue.length - 1}
            />
        </AppLayout>
    )
}