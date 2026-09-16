import { useState, useEffect, useCallback } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import { ipdAPI } from '../../api/ipd'
import { pharmacyAPI } from '../../api/pharmacy'
import toast from 'react-hot-toast'

/* ─── tokens ─────────────────────────────────────────────────────── */
const C = {
    b: '#1a6b5a', bm: '#2a8f76', bd: '#0f4a3d', bl: '#e6f5f1',
    bg: '#f0f4f3', s: '#fff', sb: '#0e2a24',
    t1: '#111827', t2: '#6b7280', t3: '#9ca3af', br: '#e5e7eb', br2: '#d1d5db',
    ok: '#16a34a', okB: '#f0fdf4', w: '#d97706', wB: '#fffbeb',
    d: '#dc2626', dB: '#fef2f2', i: '#2563eb', iB: '#eff6ff', p: '#7c3aed', pB: '#f5f3ff',
}
const card = (x = {}) => ({ background: C.s, borderRadius: '14px', border: `1px solid ${C.br}`, padding: '18px', ...x })
const inp = { width: '100%', padding: '9px 12px', borderRadius: '9px', border: `1px solid ${C.br2}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }
const lbl = (t) => <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: C.t2, marginBottom: '5px' }}>{t}</label>
const drfError = (e, fallback) => {
    const d = e?.response?.data
    if (!d) return fallback
    if (typeof d === 'string') return fallback
    if (d.detail) return d.detail
    const k = Object.keys(d)[0]
    if (k && Array.isArray(d[k])) return `${k}: ${d[k][0]}`
    return fallback
}
const unwrap = (x) => Array.isArray(x) ? x : (x?.results || [])
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })
const dayCount = (d) => d ? Math.max(1, Math.ceil((Date.now() - new Date(d).getTime()) / 86400000)) : 1
const fmt = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const inits = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?'

function Btn({ children, variant = 'primary', size = 'md', disabled, onClick }) {
    const base = {
        borderRadius: '9px', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600,
        border: '1px solid transparent', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap',
        padding: size === 'sm' ? '6px 12px' : '10px 16px', fontSize: size === 'sm' ? '12.5px' : '13.5px'
    }
    const v = {
        primary: { background: C.b, color: '#fff' }, success: { background: C.ok, color: '#fff' },
        outline: { background: '#fff', color: C.t1, border: `1px solid ${C.br2}` }, danger: { background: C.d, color: '#fff' },
        blue: { background: C.i, color: '#fff' }
    }[variant]
    return <button onClick={onClick} disabled={disabled} style={{ ...base, ...v }}>{children}</button>
}
function Tag({ children, color = C.t2, bg = '#f3f4f6' }) {
    return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, color, background: bg }}>{children}</span>
}

const BED_TIERS = [['General ward', '5000'], ['Semi-private', '12000'], ['Private room', '25000'], ['Amenity / VIP', '45000'], ['ICU / HDU', '60000']]
const BED = {
    available: { fill: '#dcfce7', bd: '#86efac', label: 'Available' },
    occupied: { fill: '#fee2e2', bd: '#fca5a5', label: 'Occupied' },
    reserved: { fill: '#fef9c3', bd: '#fde047', label: 'Reserved' },
    maintenance: { fill: '#f3f4f6', bd: '#d1d5db', label: 'Maintenance' },
}

/* ═══ STAT TILES ═══════════════════════════════════════════════════ */
function StatTiles({ d }) {
    const tiles = [
        { label: 'Available Beds', val: d.available_beds ?? '—', color: C.ok },
        { label: 'Occupied Beds', val: d.occupied_beds ?? '—', color: C.d },
        { label: 'Pending Requests', val: d.pending_requests ?? '—', color: C.w },
        { label: 'Active Inpatients', val: d.active_admissions ?? '—', color: C.b },
    ]
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '16px' }}>
            {tiles.map(t => (
                <div key={t.label} style={card({ padding: '16px 18px' })}>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: t.color }}>{t.val}</div>
                    <div style={{ fontSize: '12px', color: C.t2, marginTop: '2px' }}>{t.label}</div>
                </div>
            ))}
        </div>
    )
}

/* ═══ WARD & ROOM MAP ══════════════════════════════════════════════ */
function WardMap({ wards, admByBed, onPickBed, onAddWard, onAddBeds }) {
    return (
        <div style={card({ marginBottom: '16px' })}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700 }}>Ward &amp; Room Map <span style={{ fontSize: '11.5px', fontWeight: 400, color: C.t3 }}>· click any bed for full info &amp; MAR</span></span>
                <Btn size="sm" variant="outline" onClick={onAddWard}>+ Ward</Btn>
            </div>
            {wards.length === 0 ? <div style={{ textAlign: 'center', padding: '26px', color: C.t3, fontSize: '13px' }}>No wards yet — add one to start placing beds.</div> :
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {wards.map(w => {
                        const beds = (w.beds || []).slice().sort((a, b) => String(a.bed_number).localeCompare(String(b.bed_number), undefined, { numeric: true }))
                        return (
                            <div key={w.id}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 700 }}>{w.name}</span>
                                    <Tag color={C.t2} bg={C.bg}>{w.ward_type}</Tag>
                                    <span style={{ fontSize: '11.5px', color: C.t3 }}>{beds.filter(b => b.status === 'available').length}/{beds.length} free</span>
                                    <button onClick={() => onAddBeds(w)} style={{ marginLeft: 'auto', background: 'none', border: `1px dashed ${C.br2}`, borderRadius: '7px', padding: '4px 10px', color: C.b, fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Beds</button>
                                </div>
                                {beds.length === 0 ? <div style={{ fontSize: '12px', color: C.t3, paddingBottom: '4px' }}>No beds — add some.</div> :
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: '8px' }}>
                                        {beds.map(bed => {
                                            const m = BED[bed.status] || BED.available
                                            const adm = admByBed[bed.id]
                                            return (
                                                <button key={bed.id} onClick={() => onPickBed(bed, w, adm)}
                                                    style={{ textAlign: 'left', background: m.fill, border: `1.5px solid ${m.bd}`, borderRadius: '10px', padding: '10px', cursor: 'pointer', fontFamily: 'inherit', minHeight: '62px' }}>
                                                    <div style={{ fontSize: '12.5px', fontWeight: 800, color: C.t1 }}>{bed.bed_number}</div>
                                                    <div style={{ fontSize: '10.5px', color: C.t2, marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: bed.current_patient ? 700 : 400 }}>
                                                        {bed.current_patient || (adm ? adm.patient_name : m.label)}
                                                    </div>
                                                    {bed.price > 0 && <div style={{ fontSize: '9.5px', color: C.t3, marginTop: '1px' }}>{naira(bed.price)}/day</div>}
                                                </button>
                                            )
                                        })}
                                    </div>}
                            </div>
                        )
                    })}
                </div>}
            <div style={{ display: 'flex', gap: '14px', marginTop: '16px', fontSize: '11.5px', flexWrap: 'wrap' }}>
                {Object.values(BED).map(m => (
                    <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: m.fill, border: `1.5px solid ${m.bd}` }} />{m.label}
                    </div>
                ))}
            </div>
        </div>
    )
}

/* ═══ ADMISSION REQUESTS (from doctors → assign bed) ═══════════════ */
function RequestsCard({ requests, availBeds, onChanged }) {
    const [openId, setOpenId] = useState(null)
    const [bedId, setBedId] = useState('')
    const [type, setType] = useState('elective')
    const [busy, setBusy] = useState(false)

    const assign = async (req) => {
        if (!bedId) { toast.error('Select a bed'); return }
        try { setBusy(true); await ipdAPI.assignBed(req.id, { bed: bedId, admission_type: type }); toast.success('Bed assigned · admitted · bed-day billed'); setOpenId(null); setBedId(''); onChanged() }
        catch (e) { toast.error(e?.response?.data?.error || 'Assign failed') } finally { setBusy(false) }
    }
    const cancel = async (req) => {
        try { await ipdAPI.updateRequest(req.id, { status: 'cancelled' }); toast.success('Request cancelled'); onChanged() }
        catch { toast.error('Could not cancel') }
    }

    return (
        <div style={card()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700 }}>Admission Requests</span>
                {requests.length > 0 && <Tag color={C.d} bg={C.dB}>{requests.length} pending</Tag>}
            </div>
            {requests.length === 0 ? <div style={{ textAlign: 'center', padding: '24px', color: C.t3, fontSize: '13px' }}>No admission requests from doctors.</div> :
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {requests.map(req => (
                        <div key={req.id} style={{ borderLeft: `3px solid ${C.w}`, background: C.bg, borderRadius: '10px', padding: '12px 14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '13.5px' }}>{req.patient_name}</div>
                                    <div style={{ fontSize: '12px', color: C.t2, marginTop: '2px' }}>{req.admitting_diagnosis}</div>
                                    <div style={{ fontSize: '11.5px', color: C.t3, marginTop: '4px' }}>Dr. {req.doctor_name || '—'}{req.requested_ward_type ? ` · wants ${req.requested_ward_type}` : ''} · {fmt(req.admitted_at)}</div>
                                </div>
                                {openId === req.id
                                    ? <Btn size="sm" variant="outline" onClick={() => setOpenId(null)}>Cancel</Btn>
                                    : <div style={{ display: 'flex', gap: '6px' }}>
                                        <Btn size="sm" variant="outline" onClick={() => cancel(req)}>Decline</Btn>
                                        <Btn size="sm" onClick={() => { setOpenId(req.id); setBedId(''); setType(req.admission_type || 'elective') }}>Assign bed</Btn>
                                    </div>}
                            </div>
                            {openId === req.id && (
                                <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1.6fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                                    <div>{lbl('Available bed')}
                                        <select style={inp} value={bedId} onChange={e => setBedId(e.target.value)}>
                                            <option value="">Select bed…</option>
                                            {availBeds.map(b => <option key={b.id} value={b.id}>{b.ward_name} / {b.bed_number}</option>)}
                                        </select>
                                    </div>
                                    <div>{lbl('Type')}
                                        <select style={inp} value={type} onChange={e => setType(e.target.value)}>
                                            <option value="emergency">Emergency</option><option value="elective">Elective</option><option value="transfer">Transfer</option>
                                        </select>
                                    </div>
                                    <Btn size="sm" variant="success" disabled={busy} onClick={() => assign(req)}>{busy ? '…' : 'Admit'}</Btn>
                                </div>
                            )}
                        </div>
                    ))}
                </div>}
        </div>
    )
}

/* ═══ CURRENT INPATIENTS ═══════════════════════════════════════════ */
function InpatientsCard({ admissions, onOpen }) {
    return (
        <div style={card()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700 }}>Current Inpatients</span>
                <Tag color={C.i} bg={C.iB}>{admissions.length}</Tag>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead><tr style={{ textAlign: 'left', color: C.t2, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        {['Patient', 'Room', 'Doctor', 'Day', ''].map(h => <th key={h} style={{ padding: '9px 8px', borderBottom: `1px solid ${C.br}` }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                        {admissions.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: '28px', color: C.t3 }}>No active admissions.</td></tr> :
                            admissions.map(a => (
                                <tr key={a.id} onClick={() => onOpen(a)} style={{ cursor: 'pointer' }}>
                                    <td style={{ padding: '9px 8px', borderBottom: `1px solid ${C.br}`, fontWeight: 600 }}>{a.patient_name}</td>
                                    <td style={{ padding: '9px 8px', borderBottom: `1px solid ${C.br}`, color: C.t2 }}>{a.bed_detail ? `${a.bed_detail.ward_name} / ${a.bed_detail.bed_number}` : '—'}</td>
                                    <td style={{ padding: '9px 8px', borderBottom: `1px solid ${C.br}`, color: C.t2 }}>{a.doctor_name || '—'}</td>
                                    <td style={{ padding: '9px 8px', borderBottom: `1px solid ${C.br}` }}><Tag color={C.b} bg={C.bl}>Day {dayCount(a.admitted_at)}</Tag></td>
                                    <td style={{ padding: '9px 8px', borderBottom: `1px solid ${C.br}` }}><Btn size="sm" variant="outline" onClick={() => onOpen(a)}>Open room</Btn></td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

/* ═══ ROOM MODAL — patient · MAR · rounds · discharge ══════════════ */
const SHIFTS = [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['night', 'Night']]
function RoomModal({ admissionId, drugs, onClose, onChanged }) {
    const [adm, setAdm] = useState(null)
    const [loading, setLoading] = useState(true)
    const [med, setMed] = useState({ drug_id: '', quantity: 1, shift: 'morning', notes: '' })
    const [round, setRound] = useState({ shift: 'morning', notes: '' })
    const [discharge, setDischarge] = useState('')
    const [busy, setBusy] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        try { const r = await ipdAPI.getAdmission(admissionId); setAdm(r.data) }
        catch { toast.error('Could not load room') }
        finally { setLoading(false) }
    }, [admissionId])
    useEffect(() => { load() }, [load])
    const refresh = async () => { await load(); onChanged && onChanged() }

    const administer = async () => {
        if (!med.drug_id) { toast.error('Pick a medication'); return }
        try { setBusy('med'); await ipdAPI.addMedRecord({ admission: admissionId, drug_id: med.drug_id, quantity: Number(med.quantity) || 1, shift: med.shift, notes: med.notes }); toast.success('Administered · stock deducted · doctor notified'); setMed({ drug_id: '', quantity: 1, shift: med.shift, notes: '' }); await refresh() }
        catch (e) { toast.error(e?.response?.data?.error || 'Could not record') } finally { setBusy('') }
    }
    const addRound = async () => {
        if (!round.notes.trim()) { toast.error('Write a note'); return }
        try { setBusy('round'); await ipdAPI.createShift({ admission: admissionId, shift: round.shift, notes: round.notes }); toast.success('Round/note saved'); setRound({ shift: round.shift, notes: '' }); await refresh() }
        catch { toast.error('Could not save note') } finally { setBusy('') }
    }
    const [bedRate, setBedRate] = useState('')
    const postBedDay = async () => {
        try {
            setBusy('bedday')
            const { data } = await ipdAPI.postBedDay(admissionId, bedRate ? { price: parseFloat(bedRate) } : {})
            toast.success(data.message || 'Bed-days up to date'); setBedRate(''); await load(); onChanged && onChanged()
        }
        catch (e) { toast.error(e?.response?.data?.error || 'Could not post bed-day') } finally { setBusy('') }
    }
    const doDischarge = async () => {
        try { setBusy('disc'); await ipdAPI.update(admissionId, { status: 'discharged', discharge_summary: discharge }); toast.success('Patient discharged · bed freed'); onChanged && onChanged(); onClose() }
        catch (e) { toast.error(e?.response?.data?.error || 'Discharge failed') } finally { setBusy('') }
    }
    const billBedDay = async () => {
        try { setBusy('bedday'); const { data } = await ipdAPI.postBedDay(admissionId); toast.success(`Bed-day billed · ${naira(data.amount)}`); onChanged && onChanged() }
        catch (e) { toast.error(e?.response?.data?.error || 'Could not bill bed-day') } finally { setBusy('') }
    }

    const meds = []
    const rounds = []
    if (adm) (adm.records || []).forEach(rec => {
        (rec.medications || []).forEach(m => meds.push({ ...m, shift: rec.shift, nurse: rec.nurse_name }))
        if (rec.notes) rounds.push({ id: rec.id, shift: rec.shift, nurse: rec.nurse_name, notes: rec.notes, created_at: rec.created_at })
    })
    meds.sort((a, b) => new Date(b.administered_at) - new Date(a.administered_at))
    rounds.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '34px 16px', overflowY: 'auto' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: C.s, borderRadius: '16px', width: '100%', maxWidth: '760px', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
                {loading || !adm ? <div style={{ padding: '40px', textAlign: 'center', color: C.t3 }}>Loading…</div> : (
                    <>
                        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${C.br}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: C.bl, color: C.bd, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '15px' }}>{inits(adm.patient_name)}</div>
                                <div>
                                    <div style={{ fontSize: '16px', fontWeight: 800 }}>{adm.patient_name}</div>
                                    <div style={{ fontSize: '12px', color: C.t2, marginTop: '2px' }}>{adm.bed_detail ? `${adm.bed_detail.ward_name} / Bed ${adm.bed_detail.bed_number}` : 'No bed'} · Day {dayCount(adm.admitted_at)}</div>
                                </div>
                            </div>
                            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: C.t3 }}>×</button>
                        </div>

                        <div style={{ padding: '18px 20px' }}>
                            {/* admission details */}
                            <div style={{ background: C.bg, borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 18px', fontSize: '12.5px' }}>
                                <div><span style={{ color: C.t3 }}>Type:</span> <b style={{ textTransform: 'capitalize' }}>{adm.admission_type}</b></div>
                                <div><span style={{ color: C.t3 }}>Doctor:</span> <b>{adm.doctor_name || '—'}</b></div>
                                <div><span style={{ color: C.t3 }}>Admitted:</span> <b>{fmt(adm.admitted_at)}</b></div>
                                <div><span style={{ color: C.t3 }}>Diagnosis:</span> <b>{adm.admitting_diagnosis || '—'}</b></div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', padding: '10px 12px', background: C.bg, borderRadius: '10px' }}>
                                <span style={{ fontSize: '12.5px', color: C.t2 }}>Bed rate: <b style={{ color: C.t1 }}>{adm.bed_detail?.price > 0 ? `${naira(adm.bed_detail.price)}/day` : 'not set'}</b> · billing is manual</span>
                                <Btn size="sm" variant="outline" disabled={busy === 'bedday'} onClick={billBedDay}>{busy === 'bedday' ? 'Posting…' : '+ Post bed-day charge'}</Btn>
                            </div>

                            {/* MAR */}
                            <div style={{ fontSize: '11px', fontWeight: 700, color: C.t2, letterSpacing: '.05em', marginBottom: '8px' }}>MEDICATION ADMINISTRATION RECORD (MAR)</div>
                            <div style={{ background: C.bg, border: `1px solid ${C.br}`, borderRadius: '10px', padding: '12px', marginBottom: '10px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 0.8fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                                    <div>{lbl('Medication')}
                                        <select style={inp} value={med.drug_id} onChange={e => setMed(m => ({ ...m, drug_id: e.target.value }))}>
                                            <option value="">Select drug…</option>
                                            {drugs.map(d => <option key={d.id} value={d.id}>{d.name}{d.current_stock != null ? ` — ${d.current_stock} in stock` : ''}</option>)}
                                        </select>
                                    </div>
                                    <div>{lbl('Qty')}<input style={inp} type="number" min="1" value={med.quantity} onChange={e => setMed(m => ({ ...m, quantity: e.target.value }))} /></div>
                                    <div>{lbl('Shift')}<select style={inp} value={med.shift} onChange={e => setMed(m => ({ ...m, shift: e.target.value }))}>{SHIFTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                                    <Btn size="sm" disabled={busy === 'med'} onClick={administer}>💉 Administer</Btn>
                                </div>
                            </div>
                            {meds.length === 0 ? <div style={{ textAlign: 'center', padding: '12px', color: C.t3, fontSize: '12.5px', marginBottom: '16px' }}>No medications administered yet.</div> :
                                <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                        <thead><tr style={{ textAlign: 'left', color: C.t2, fontSize: '10px', textTransform: 'uppercase' }}>
                                            {['Time', 'Drug', 'Qty', 'Shift', 'By'].map(h => <th key={h} style={{ padding: '6px 8px', borderBottom: `1px solid ${C.br}` }}>{h}</th>)}
                                        </tr></thead>
                                        <tbody>
                                            {meds.map(m => (
                                                <tr key={m.id}>
                                                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.br}`, color: C.t3, whiteSpace: 'nowrap' }}>{fmt(m.administered_at)}</td>
                                                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.br}`, fontWeight: 600 }}>{m.drug_name}</td>
                                                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.br}` }}>{m.quantity}</td>
                                                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.br}`, textTransform: 'capitalize' }}>{m.shift}</td>
                                                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.br}`, color: C.t2 }}>{m.nurse || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>}

                            {/* Rounds & notes */}
                            <div style={{ fontSize: '11px', fontWeight: 700, color: C.t2, letterSpacing: '.05em', marginBottom: '8px' }}>WARD ROUNDS &amp; PROGRESS NOTES</div>
                            <div style={{ background: C.bg, border: `1px solid ${C.br}`, borderRadius: '10px', padding: '12px', marginBottom: '10px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr auto', gap: '8px', alignItems: 'end' }}>
                                    <div>{lbl('Shift')}<select style={inp} value={round.shift} onChange={e => setRound(r => ({ ...r, shift: e.target.value }))}>{SHIFTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                                    <div>{lbl('Observation / note')}<input style={inp} value={round.notes} onChange={e => setRound(r => ({ ...r, notes: e.target.value }))} placeholder="Progress, plan, response to treatment…" /></div>
                                    <Btn size="sm" variant="outline" disabled={busy === 'round'} onClick={addRound}>+ Save</Btn>
                                </div>
                            </div>
                            {rounds.length === 0 ? <div style={{ fontSize: '12.5px', color: C.t3, padding: '2px 0 14px' }}>No rounds recorded yet.</div> :
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                                    {rounds.slice(0, 6).map(r => (
                                        <div key={r.id} style={{ borderLeft: `3px solid ${C.i}`, background: C.bg, borderRadius: '6px', padding: '8px 12px', fontSize: '12.5px' }}>
                                            <b style={{ textTransform: 'capitalize' }}>{r.shift} round</b> · {r.nurse || '—'} <span style={{ color: C.t3 }}>({fmt(r.created_at)})</span><br />{r.notes}
                                        </div>
                                    ))}
                                </div>}

                            {/* Billing */}
                            <div style={{ borderTop: `1px solid ${C.br}`, paddingTop: '14px', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{ fontSize: '11px', fontWeight: 700, color: C.t2, letterSpacing: '.05em' }}>BILLING</div>
                                        <div style={{ fontSize: '12px', color: C.t2, marginTop: '4px' }}>
                                            {Number(adm.bed_detail?.price) > 0
                                                ? `Bed-days auto-bill daily at ${naira(adm.bed_detail.price)}/day while admitted.`
                                                : 'This bed has no daily rate yet — set one to start bed-day billing.'}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        {!(Number(adm.bed_detail?.price) > 0) && (
                                            <input style={{ ...inp, width: '120px' }} type="number" placeholder="₦/day" value={bedRate} onChange={e => setBedRate(e.target.value)} />
                                        )}
                                        <Btn size="sm" variant="outline" disabled={busy === 'bedday'} onClick={postBedDay}>{busy === 'bedday' ? 'Syncing…' : '↻ Sync bed-days'}</Btn>
                                    </div>
                                </div>
                            </div>

                            {/* Discharge */}
                            <div style={{ borderTop: `1px solid ${C.br}`, paddingTop: '14px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: C.t2, letterSpacing: '.05em', marginBottom: '8px' }}>DISCHARGE</div>
                                <textarea style={{ ...inp, minHeight: '52px', resize: 'vertical' }} value={discharge} onChange={e => setDischarge(e.target.value)} placeholder="Discharge summary (condition, instructions, follow-up)…" />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                                    <Btn variant="danger" disabled={busy === 'disc'} onClick={doDischarge}>{busy === 'disc' ? 'Discharging…' : 'Discharge patient'}</Btn>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

/* ═══ BED STATUS MODAL (non-occupied) ══════════════════════════════ */
function BedModal({ bed, ward, onClose, onChanged }) {
    const [busy, setBusy] = useState(false)
    const [price, setPrice] = useState(bed.price || '')
    const savePrice = async () => {
        try { setBusy(true); await ipdAPI.updateBed(bed.id, { price: parseFloat(price || 0) }); toast.success('Bed rate saved'); onChanged() }
        catch { toast.error('Could not save rate') } finally { setBusy(false) }
    }
    const setStatus = async (status) => {
        try { setBusy(true); await ipdAPI.updateBed(bed.id, { status }); toast.success(`Bed set to ${status}`); onChanged(); onClose() }
        catch { toast.error('Update failed') } finally { setBusy(false) }
    }
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: C.s, borderRadius: '16px', width: '100%', maxWidth: '400px', padding: '20px', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800 }}>{ward?.name} / Bed {bed.bed_number}</div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: C.t3 }}>×</button>
                </div>
                <div style={{ marginBottom: '14px' }}><Tag color={(BED[bed.status] || {}).bd ? C.t1 : C.t2} bg={(BED[bed.status] || BED.available).fill}>{(BED[bed.status] || BED.available).label}</Tag></div>
                <div style={{ fontSize: '12px', color: C.t2, marginBottom: '10px' }}>This bed is free. Beds are filled by assigning a doctor’s admission request. You can change its housekeeping status:</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    <Btn size="sm" variant="success" disabled={busy} onClick={() => setStatus('available')}>Available</Btn>
                    <Btn size="sm" variant="outline" disabled={busy} onClick={() => setStatus('reserved')}>Reserve</Btn>
                    <Btn size="sm" variant="outline" disabled={busy} onClick={() => setStatus('maintenance')}>Maintenance</Btn>
                </div>
                <div style={{ borderTop: `1px solid ${C.br}`, paddingTop: '12px' }}>
                    {lbl('Daily rate (₦/day) — used for bed-day billing')}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input style={inp} type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 15000" />
                        <Btn size="sm" disabled={busy} onClick={savePrice}>Save rate</Btn>
                    </div>
                </div>
            </div>
        </div>
    )
}

/* ═══ ADD WARD / ADD BEDS MODALS ═══════════════════════════════════ */
function AddWardModal({ onClose, onChanged }) {
    const [form, setForm] = useState({ name: '', ward_type: 'General', total_beds: 30 })
    const [busy, setBusy] = useState(false)
    const save = async () => {
        if (!form.name.trim()) { toast.error('Ward name required'); return }
        try { setBusy(true); await ipdAPI.createWard({ ...form, total_beds: Number(form.total_beds) || 30 }); toast.success('Ward created'); onChanged(); onClose() }
        catch (e) { toast.error(drfError(e, 'Could not create ward')) } finally { setBusy(false) }
    }
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: C.s, borderRadius: '16px', width: '100%', maxWidth: '420px', padding: '20px' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '14px' }}>New Ward</div>
                <div style={{ marginBottom: '10px' }}>{lbl('Ward name *')}<input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Male Medical Ward" /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                    <div>{lbl('Type')}<select style={inp} value={form.ward_type} onChange={e => setForm(f => ({ ...f, ward_type: e.target.value }))}>
                        {['General', 'ICU', 'Maternity', 'Pediatric', 'Surgical', 'Private', 'Isolation'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select></div>
                    <div>{lbl('Total beds')}<input style={inp} type="number" value={form.total_beds} onChange={e => setForm(f => ({ ...f, total_beds: e.target.value }))} /></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Create'}</Btn></div>
            </div>
        </div>
    )
}
function AddBedsModal({ ward, onClose, onChanged }) {
    const [form, setForm] = useState({ prefix: 'B', start: 1, count: 5, price: '' })
    const [busy, setBusy] = useState(false)
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
    const save = async () => {
        try {
            setBusy(true)
            const start = Number(form.start) || 1, count = Math.min(Number(form.count) || 1, 40)
            const price = parseFloat(form.price || 0)
            for (let i = 0; i < count; i++) { try { await ipdAPI.createBed({ ward: ward.id, bed_number: `${form.prefix}${start + i}`, status: 'available', price }) } catch { } }
            toast.success(`${count} bed(s) added at ${naira(price)}/day`); onChanged(); onClose()
        } catch { toast.error('Could not add beds') } finally { setBusy(false) }
    }
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: C.s, borderRadius: '16px', width: '100%', maxWidth: '440px', padding: '20px' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '4px' }}>Add Beds</div>
                <div style={{ fontSize: '12px', color: C.t2, marginBottom: '14px' }}>to {ward.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div>{lbl('Prefix')}<input style={inp} value={form.prefix} onChange={e => set('prefix', e.target.value)} /></div>
                    <div>{lbl('Start #')}<input style={inp} type="number" value={form.start} onChange={e => set('start', e.target.value)} /></div>
                    <div>{lbl('How many')}<input style={inp} type="number" value={form.count} onChange={e => set('count', e.target.value)} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px', marginBottom: '16px' }}>
                    <div>{lbl('Bed price tier')}
                        <select style={inp} value={form.price} onChange={e => set('price', e.target.value)}>
                            <option value="">Custom…</option>
                            {BED_TIERS.map(([l, v]) => <option key={v} value={v}>{l} — {naira(v)}/day</option>)}
                        </select>
                    </div>
                    <div>{lbl('Price / day (₦)')}<input style={inp} type="number" value={form.price} onChange={e => set('price', e.target.value)} placeholder="e.g. 15000" /></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn disabled={busy} onClick={save}>{busy ? 'Adding…' : 'Add beds'}</Btn></div>
            </div>
        </div>
    )
}

/* ═══ ROOT ═════════════════════════════════════════════════════════ */
export default function IPDPage() {
    const [dash, setDash] = useState({})
    const [wards, setWards] = useState([])
    const [requests, setRequests] = useState([])
    const [admissions, setAdmissions] = useState([])
    const [availBeds, setAvailBeds] = useState([])
    const [drugs, setDrugs] = useState([])
    const [loading, setLoading] = useState(true)
    const [roomAdm, setRoomAdm] = useState(null)
    const [bedModal, setBedModal] = useState(null)
    const [addWard, setAddWard] = useState(false)
    const [addBeds, setAddBeds] = useState(null)

    const load = useCallback(async () => {
        setLoading(true)
        const [d, w, rq, ad, ab, dr] = await Promise.allSettled([
            ipdAPI.dashboard(), ipdAPI.wards(), ipdAPI.requests({ status: 'pending' }),
            ipdAPI.admissions({ status: 'active' }), ipdAPI.beds({ status: 'available' }), pharmacyAPI.drugs(),
        ])
        if (d.status === 'fulfilled') setDash(d.value.data || {})
        if (w.status === 'fulfilled') setWards(unwrap(w.value.data))
        if (rq.status === 'fulfilled') setRequests(unwrap(rq.value.data))
        if (ad.status === 'fulfilled') setAdmissions(unwrap(ad.value.data))
        if (ab.status === 'fulfilled') setAvailBeds(unwrap(ab.value.data))
        if (dr.status === 'fulfilled') setDrugs(unwrap(dr.value.data))
        setLoading(false)
    }, [])
    useEffect(() => { load() }, [load])

    const admByBed = {}
    admissions.forEach(a => {
        const bid = a.bed_detail?.id || a.bed
        if (bid) admByBed[bid] = a
    })

    const pickBed = (bed, ward, adm) => {
        const admId = bed.current_admission_id || adm?.id
        if (bed.status === 'occupied' && admId) setRoomAdm(admId)
        else setBedModal({ bed, ward })
    }

    return (
        <AppLayout title="IPD / Beds" action={<Btn variant="outline" size="sm" onClick={load}>↺ Refresh</Btn>}>
            <StatTiles d={dash} />
            {loading ? <div style={{ textAlign: 'center', padding: '40px', color: C.t3 }}>Loading inpatient ward…</div> : (
                <>
                    <WardMap wards={wards} admByBed={admByBed} onPickBed={pickBed} onAddWard={() => setAddWard(true)} onAddBeds={(w) => setAddBeds(w)} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: '16px' }}>
                        <RequestsCard requests={requests} availBeds={availBeds} onChanged={load} />
                        <InpatientsCard admissions={admissions} onOpen={(a) => setRoomAdm(a.id)} />
                    </div>
                </>
            )}

            {roomAdm && <RoomModal admissionId={roomAdm} drugs={drugs} onClose={() => setRoomAdm(null)} onChanged={load} />}
            {bedModal && <BedModal bed={bedModal.bed} ward={bedModal.ward} onClose={() => setBedModal(null)} onChanged={load} />}
            {addWard && <AddWardModal onClose={() => setAddWard(false)} onChanged={load} />}
            {addBeds && <AddBedsModal ward={addBeds} onClose={() => setAddBeds(null)} onChanged={load} />}
        </AppLayout>
    )
}