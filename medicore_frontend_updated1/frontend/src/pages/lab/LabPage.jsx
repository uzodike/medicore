import { useState, useEffect, useCallback } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import { labAPI } from '../../api/lab'
import LabAIScreen from '../../components/lab/LabAIScreen'
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
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })
// Detects malaria tests under any common naming variant used in Nigerian labs —
// not just the literal word "malaria". A test named "MP" or "Blood Film for MP"
// (both common clinical shorthand for Malaria Parasites) would otherwise never
// trigger the AI panel even though it's clearly the same test.
const AI_TEST_PATTERNS = [
    ['malaria', /malaria|\bmp\b|blood\s*film/i],
    ['sickle_cell', /sickle/i],
    ['tb_smear', /\btb\b|tuberculosis|\bafb\b|sputum.*smear|ziehl/i],
    ['microfilariae', /microfilaria|\bmf\b|filaria|elephantiasis/i],
]
function getAITestType(testName) {
    if (!testName) return null
    const match = AI_TEST_PATTERNS.find(([, pattern]) => pattern.test(testName))
    return match ? match[0] : null
}

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
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const IMAGING = ['imaging', 'ecg']

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

const PRIORITY = { routine: { l: 'Routine', c: C.t2, b: '#f3f4f6' }, urgent: { l: 'Urgent', c: C.w, b: C.wB }, stat: { l: 'STAT', c: C.d, b: C.dB } }
const FLAG = { H: { l: 'High', c: C.d }, HH: { l: 'Crit High', c: C.d }, L: { l: 'Low', c: C.i }, LL: { l: 'Crit Low', c: C.i }, A: { l: 'Abnormal', c: C.w }, P: { l: 'Positive', c: C.d }, N: { l: 'Negative', c: C.ok } }
const FLAG_OPTIONS = [['', 'Normal'], ['H', 'High'], ['L', 'Low'], ['HH', 'Critical High'], ['LL', 'Critical Low'], ['A', 'Abnormal'], ['P', 'Positive'], ['N', 'Negative']]

// v8 status machine: Ordered -> Sample Collected -> Processing -> Finalized
function deriveStatus(o) {
    if (o.status === 'cancelled') return { l: 'Cancelled', c: C.t2, b: '#f3f4f6' }
    if (o.status === 'completed') return { l: 'Finalized', c: C.ok, b: C.okB }
    if (o.status === 'in_progress') return { l: 'Processing', c: C.b, b: C.bl }
    if ((o.items || []).some(i => i.sample_status === 'collected')) return { l: 'Sample Collected', c: C.w, b: C.wB }
    return { l: 'Ordered', c: C.i, b: C.iB }
}

/* ═══ STAT CARDS ═══════════════════════════════════════════════════ */
function StatCards({ d }) {
    const cards = [
        { label: 'Active Tests', val: d.total_tests ?? '—', color: C.t1 },
        { label: 'Pending Results', val: d.pending ?? '—', color: C.w },
        { label: 'Completed Today', val: d.completed_today ?? '—', color: C.ok },
        { label: 'Revenue Today', val: naira(d.revenue_today), color: C.b },
    ]
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' }}>
            {cards.map(c => (
                <div key={c.label} style={card({ padding: '16px 18px' })}>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: c.color }}>{c.val}</div>
                    <div style={{ fontSize: '12px', color: C.t2, marginTop: '2px' }}>{c.label}</div>
                </div>
            ))}
        </div>
    )
}

/* ═══ ORDERS VIEW (queue + register) — v8 Lab Orders ══════════════ */
function OrdersView({ orders, onChanged, onEnterResult, imagingOnly, emptyLabel }) {
    const [busy, setBusy] = useState(null)
    const [q, setQ] = useState('')

    const match = (o) => {
        const cats = (o.items || []).map(i => i.test_category)
        const hasImg = cats.some(c => IMAGING.includes(c))
        const hasLab = cats.some(c => !IMAGING.includes(c))
        return imagingOnly ? hasImg : (hasLab || cats.length === 0)
    }
    const scoped = orders.filter(match)
    const active = scoped.filter(o => { const l = deriveStatus(o).l; return l !== 'Finalized' && l !== 'Cancelled' })
    const filtered = scoped.filter(o => !q || `${o.order_number} ${o.patient_name} ${o.patient_pid}`.toLowerCase().includes(q.toLowerCase()))

    const collect = async (o) => {
        const pend = (o.items || []).filter(i => i.sample_status === 'pending')
        try {
            setBusy(o.id)
            for (const it of pend) { try { await labAPI.collectSample(it.id, { sample_type: it.test_specimen || '' }) } catch { } }
            toast.success('Sample collected · doctor notified'); onChanged()
        } catch { toast.error('Collection failed') } finally { setBusy(null) }
    }
    const setStatus = async (o, status, label) => {
        try { setBusy(o.id); await labAPI.updateOrder(o.id, { status }); toast.success(label); onChanged() }
        catch (e) { toast.error(e?.response?.data?.detail || 'Update failed') } finally { setBusy(null) }
    }

    return (
        <>
            {/* Orders from Doctors */}
            <div style={card({ marginBottom: '16px' })}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700 }}>Orders from Doctors</span>
                    {active.length > 0 && <Tag color={C.d} bg={C.dB}>{active.length} pending</Tag>}
                </div>
                {active.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '22px', color: C.t3, fontSize: '13px' }}>{emptyLabel || 'No lab orders from doctors yet.'}</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {active.map(o => {
                            const st = deriveStatus(o)
                            const collected = (o.items || []).every(i => i.sample_status === 'collected')
                            return (
                                <div key={o.id} style={{ borderLeft: `3px solid ${C.b}`, background: C.bg, borderRadius: '10px', padding: '14px 16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, fontSize: '14px' }}>{o.patient_name} <span style={{ fontWeight: 500, color: C.t3, fontSize: '12.5px' }}>{o.order_number}</span></div>
                                            <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                {(o.items || []).map(it => (
                                                    <span key={it.id} style={{ fontSize: '11.5px', fontWeight: 600, color: IMAGING.includes(it.test_category) ? C.p : C.b, background: '#fff', border: `1px solid ${C.br}`, borderRadius: '8px', padding: '3px 8px' }}>🧪 {it.test_name}</span>
                                                ))}
                                            </div>
                                            {o.clinical_info && <div style={{ marginTop: '8px', fontSize: '12px', color: C.t2, fontStyle: 'italic' }}>📋 {o.clinical_info}</div>}
                                            <div style={{ marginTop: '6px', fontSize: '11.5px', color: C.t3 }}>Dr. {o.doctor_name || '—'} · {fmtDateTime(o.order_date)}</div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Tag color={st.c} bg={st.b}>{st.l}</Tag>
                                            {!collected
                                                ? <Btn size="sm" variant="outline" disabled={busy === o.id} onClick={() => collect(o)}>Collect</Btn>
                                                : <Btn size="sm" variant="blue" onClick={() => onEnterResult(o.id)}>Enter result</Btn>}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Order Register */}
            <div style={card()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '12px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700 }}>Order Register <Tag color={C.i} bg={C.iB}>{scoped.length}</Tag></span>
                    <input style={{ ...inp, maxWidth: '240px' }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search order / patient…" />
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead><tr style={{ textAlign: 'left', color: C.t2, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                            {['Order #', 'Patient', 'Tests', 'Status', 'Action'].map(h => <th key={h} style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}` }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {filtered.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: '26px', color: C.t3 }}>No orders.</td></tr> :
                                filtered.map(o => {
                                    const st = deriveStatus(o)
                                    const finalized = st.l === 'Finalized'
                                    const hasPending = (o.items || []).some(i => i.sample_status === 'pending')
                                    return (
                                        <tr key={o.id}>
                                            <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}`, fontWeight: 600, color: C.b }}>{o.order_number}</td>
                                            <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}` }}>{o.patient_name}<div style={{ fontSize: '11px', color: C.t3 }}>{o.patient_pid}</div></td>
                                            <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}`, color: C.t2, maxWidth: '240px' }}>{(o.items || []).map(i => i.test_name).join(', ')}</td>
                                            <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}` }}><Tag color={st.c} bg={st.b}>{st.l}</Tag></td>
                                            <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}` }}>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                    {!finalized && hasPending && <Btn size="sm" variant="outline" disabled={busy === o.id} onClick={() => collect(o)}>Sample</Btn>}
                                                    {!finalized && <Btn size="sm" variant="outline" disabled={busy === o.id} onClick={() => setStatus(o, 'in_progress', 'Processing')}>Processing</Btn>}
                                                    <Btn size="sm" onClick={() => onEnterResult(o.id)}>{finalized ? 'View result' : 'Enter result'}</Btn>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    )
}

/* ═══ RESULTS & UPLOAD — v8 form + released panel ══════════════════ */
function ResultsUploadPane({ orders, preselectId, onChanged }) {
    const [selectedId, setSelectedId] = useState(preselectId || '')
    const [order, setOrder] = useState(null)
    const [rows, setRows] = useState([])
    const [releasedBy, setReleasedBy] = useState('')
    const [attachFile, setAttachFile] = useState(null)
    const [busy, setBusy] = useState(false)
    const [loading, setLoading] = useState(false)

    useEffect(() => { if (preselectId) setSelectedId(preselectId) }, [preselectId])

    useEffect(() => {
        if (!selectedId) { setOrder(null); setRows([]); return }
        let cancel = false
        setLoading(true)
        labAPI.getOrder(selectedId).then(r => {
            if (cancel) return
            const o = r.data; setOrder(o)
            setRows((o.items || []).map(it => ({
                item_id: it.id, name: it.test_name,
                result: it.result_value || '',
                unit: it.unit || it.test_unit || '',
                ref: (it.reference_range_low != null && it.reference_range_high != null) ? `${it.reference_range_low}-${it.reference_range_high}`
                    : (it.test_ref_low != null && it.test_ref_high != null ? `${it.test_ref_low}-${it.test_ref_high}` : ''),
                flag: it.flag || '',
            })))
        }).catch(() => toast.error('Could not load order')).finally(() => { if (!cancel) setLoading(false) })
        return () => { cancel = true }
    }, [selectedId])

    const finalized = order && (order.items || []).length > 0 && (order.items || []).every(i => i.result_status === 'approved')
    const setRow = (i, k, v) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
    const addRow = () => setRows(rs => [...rs, { item_id: null, name: '', result: '', unit: '', ref: '', flag: '' }])
    // Malaria AI confirmation -> pre-fill the result row. Still requires
    // the scientist to click 'Release Results' themselves; nothing here
    // writes directly to the official result.
    const onAIConfirmed = (i) => (screen) => {
        if (screen.status === 'confirmed_positive') { setRow(i, 'result', 'Positive'); setRow(i, 'flag', 'P') }
        else if (screen.status === 'confirmed_negative') { setRow(i, 'result', 'Negative'); setRow(i, 'flag', 'N') }
    }
    const removeRow = (i) => setRows(rs => rs.filter((_, idx) => idx !== i))
    const parseRef = (ref) => {
        const m = String(ref || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)\s*$/)
        return m ? { low: parseFloat(m[1]), high: parseFloat(m[2]) } : { low: null, high: null }
    }

    const release = async () => {
        const real = rows.filter(r => r.item_id && r.result !== '')
        if (!real.length) { toast.error('Enter at least one result'); return }
        try {
            setBusy(true)
            for (const r of real) {
                const { low, high } = parseRef(r.ref)
                const num = parseFloat(r.result)
                await labAPI.enterResult(r.item_id, {
                    result_value: r.result, result_numeric: isNaN(num) ? null : num,
                    reference_range_low: low, reference_range_high: high,
                    unit: r.unit, flag: r.flag,
                    remarks: releasedBy ? `Released by ${releasedBy}` : '',
                })
                await labAPI.approveResult(r.item_id)
            }
            if (attachFile) {
                try { await labAPI.attachReport(order.id, attachFile) }
                catch { toast.error('Report file could not be uploaded') }
            }
            toast.success('Results released — order finalized · doctor notified')
            setSelectedId(''); setOrder(null); setRows([]); setReleasedBy(''); setAttachFile(null); onChanged()
        } catch (e) { toast.error(e?.response?.data?.error || 'Release failed') }
        finally { setBusy(false) }
    }

    const selectable = orders.filter(o => { const l = deriveStatus(o).l; return l !== 'Finalized' && l !== 'Cancelled' })
    const released = orders.filter(o => deriveStatus(o).l === 'Finalized')

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '16px', alignItems: 'start' }}>
            {/* Enter / Upload */}
            <div style={card()}>
                <div style={{ fontSize: '15px', fontWeight: 800, marginBottom: '14px' }}>Enter / Upload Results</div>
                {lbl('Select Order *')}
                <select style={{ ...inp, marginBottom: '16px' }} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                    <option value="">Choose an order…</option>
                    {selectable.map(o => <option key={o.id} value={o.id}>{o.order_number} — {o.patient_name} ({(o.items || []).map(i => i.test_name).join(', ')})</option>)}
                    {order && finalized && <option value={order.id}>{order.order_number} — {order.patient_name} (released)</option>}
                </select>

                {!selectedId ? (
                    <div style={{ textAlign: 'center', padding: '44px 10px', color: C.t3, fontSize: '13px' }}>Select an order above to enter or upload its results.</div>
                ) : loading ? (
                    <div style={{ textAlign: 'center', padding: '30px', color: C.t3 }}>Loading…</div>
                ) : (
                    <>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: C.t2, letterSpacing: '.05em', margin: '4px 0 10px' }}>RESULT PARAMETERS</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {rows.map((r, i) => (
                                <div key={i}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.75fr 1fr 1.05fr auto', gap: '6px', alignItems: 'center' }}>
                                        <input style={inp} value={r.name} onChange={e => setRow(i, 'name', e.target.value)} placeholder="Parameter" readOnly={!!r.item_id} disabled={finalized} />
                                        <input style={inp} value={r.result} onChange={e => setRow(i, 'result', e.target.value)} placeholder="Result" disabled={finalized} />
                                        <input style={inp} value={r.unit} onChange={e => setRow(i, 'unit', e.target.value)} placeholder="Unit" disabled={finalized} />
                                        <input style={inp} value={r.ref} onChange={e => setRow(i, 'ref', e.target.value)} placeholder="Ref range" disabled={finalized} />
                                        <select style={inp} value={r.flag} onChange={e => setRow(i, 'flag', e.target.value)} disabled={finalized}>
                                            {FLAG_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                        </select>
                                        {(!finalized && !r.item_id)
                                            ? <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: C.d, cursor: 'pointer', fontSize: '16px' }}>×</button>
                                            : <span style={{ width: '14px' }} />}
                                    </div>
                                    
                                    {!finalized && r.item_id && getAITestType(r.name) && (
                                        <div style={{ marginTop: '8px', marginBottom: '4px' }}>
                                            <LabAIScreen
                                                testType={getAITestType(r.name)}
                                                patientId={order.patient}
                                                patientName={order.patient_name}
                                                orderItemId={r.item_id}
                                                onConfirmed={onAIConfirmed(i)}
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        {!finalized && <button onClick={addRow} style={{ marginTop: '10px', background: 'none', border: `1px dashed ${C.br2}`, borderRadius: '8px', padding: '7px 12px', color: C.b, fontWeight: 600, fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit' }}>+ Add parameter</button>}

                        <div style={{ marginTop: '16px' }}>
                            {lbl('Attach report file (PDF / image — optional)')}
                            <label style={{ display: 'block', border: `2px dashed ${C.br2}`, borderRadius: '10px', padding: '26px', textAlign: 'center', color: C.t3, fontSize: '12.5px', cursor: finalized ? 'default' : 'pointer' }}>
                                {attachFile ? `📎 ${attachFile.name}` : '⬆ Click to attach a scanned report or result sheet'}
                                <input type="file" accept="application/pdf,image/*" disabled={finalized} style={{ display: 'none' }} onChange={e => setAttachFile(e.target.files?.[0] || null)} />
                            </label>
                        </div>

                        <div style={{ marginTop: '14px' }}>
                            {lbl('Verified / released by')}
                            <input style={inp} value={releasedBy} onChange={e => setReleasedBy(e.target.value)} placeholder="e.g. Adaeze Lawal, Lab Scientist" disabled={finalized} />
                        </div>

                        {!finalized
                            ? <div style={{ marginTop: '16px' }}><Btn disabled={busy} onClick={release}>{busy ? 'Releasing…' : 'Release Results'}</Btn></div>
                            : <div style={{ marginTop: '16px' }}><Tag color={C.ok} bg={C.okB}>✓ Released &amp; finalized</Tag></div>}
                    </>
                )}
            </div>

            {/* Released Results */}
            <div style={card()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 800 }}>Released Results</span>
                    <Tag color={C.ok} bg={C.okB}>{released.length}</Tag>
                </div>
                {released.length === 0 ? <div style={{ textAlign: 'center', padding: '44px 10px', color: C.t3, fontSize: '13px' }}>No results released yet.</div> :
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '600px', overflowY: 'auto' }}>
                        {released.map(o => (
                            <div key={o.id} style={{ border: `1px solid ${C.br}`, borderRadius: '12px', padding: '12px 14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <div style={{ fontWeight: 700, fontSize: '13.5px' }}>{o.patient_name} <span style={{ fontWeight: 500, color: C.t3, fontSize: '12px' }}>{o.order_number}</span></div>
                                    <div style={{ fontSize: '11px', color: C.t3 }}>{fmtDateTime(o.order_date)}</div>
                                </div>
                                {o.report_file && <a href={o.report_file} target="_blank" rel="noreferrer" style={{ fontSize: '11.5px', color: C.i, fontWeight: 600, textDecoration: 'none' }}>📎 View attached report</a>}
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '8px' }}>
                                    <thead><tr style={{ textAlign: 'left', color: C.t2, fontSize: '10px', textTransform: 'uppercase' }}>
                                        {['Parameter', 'Result', 'Unit', 'Ref range', 'Flag'].map(h => <th key={h} style={{ padding: '5px 6px', borderBottom: `1px solid ${C.br}` }}>{h}</th>)}
                                    </tr></thead>
                                    <tbody>
                                        {(o.items || []).map(it => {
                                            const fl = FLAG[it.flag]; return (
                                                <tr key={it.id}>
                                                    <td style={{ padding: '5px 6px', borderBottom: `1px solid ${C.br}`, fontWeight: 600 }}>{it.test_name}</td>
                                                    <td style={{ padding: '5px 6px', borderBottom: `1px solid ${C.br}` }}>{it.result_value || '—'}</td>
                                                    <td style={{ padding: '5px 6px', borderBottom: `1px solid ${C.br}` }}>{it.unit || it.test_unit || '—'}</td>
                                                    <td style={{ padding: '5px 6px', borderBottom: `1px solid ${C.br}`, color: C.t3 }}>{it.reference_range_low != null ? `${it.reference_range_low}-${it.reference_range_high}` : (it.test_ref_low != null ? `${it.test_ref_low}-${it.test_ref_high}` : '—')}</td>
                                                    <td style={{ padding: '5px 6px', borderBottom: `1px solid ${C.br}` }}>{fl ? <Tag color={fl.c} bg="#fff">{fl.l}</Tag> : <Tag color={C.ok} bg={C.okB}>Normal</Tag>}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>}
            </div>
        </div>
    )
}

/* ═══ INVENTORY & STOCK (test catalogue + usage) ═══════════════════ */
const TEST_CATEGORIES = [['hematology', 'Hematology'], ['biochemistry', 'Biochemistry'], ['microbiology', 'Microbiology'], ['serology', 'Serology'], ['urinalysis', 'Urinalysis'], ['histopathology', 'Histopathology'], ['imaging', 'Imaging/Radiology'], ['ecg', 'ECG'], ['other', 'Other']]
function InventoryPane({ tests, onChanged }) {
    const [form, setForm] = useState({ name: '', category: 'hematology', specimen_type: 'blood_edta', unit: '', price: '', reference_range_low: '', reference_range_high: '', turnaround_time_hours: '24' })
    const [saving, setSaving] = useState(false)
    const [q, setQ] = useState('')
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
    const add = async () => {
        if (!form.name.trim()) { toast.error('Test name required'); return }
        try {
            setSaving(true)
            await labAPI.createTest({
                name: form.name.trim(), category: form.category, specimen_type: form.specimen_type, unit: form.unit.trim(),
                price: parseFloat(form.price || 0), reference_range_low: form.reference_range_low === '' ? null : parseFloat(form.reference_range_low),
                reference_range_high: form.reference_range_high === '' ? null : parseFloat(form.reference_range_high), turnaround_time_hours: parseInt(form.turnaround_time_hours || 24, 10), is_active: true
            })
            toast.success('Test added'); setForm({ name: '', category: 'hematology', specimen_type: 'blood_edta', unit: '', price: '', reference_range_low: '', reference_range_high: '', turnaround_time_hours: '24' }); onChanged()
        } catch (e) { toast.error(drfError(e, 'Could not add test')) } finally { setSaving(false) }
    }
    const filtered = tests.filter(t => !q || `${t.name} ${t.category}`.toLowerCase().includes(q.toLowerCase()))
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '16px' }}>
            <div style={card()}>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px' }}>Add Test / Service</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ gridColumn: '1 / -1' }}>{lbl('Test name *')}<input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full Blood Count" /></div>
                    <div>{lbl('Category')}<select style={inp} value={form.category} onChange={e => set('category', e.target.value)}>{TEST_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                    <div>{lbl('Specimen')}<select style={inp} value={form.specimen_type} onChange={e => set('specimen_type', e.target.value)}>
                        {[['blood_edta', 'Blood (EDTA)'], ['blood_plain', 'Blood (Plain)'], ['blood_fluoride', 'Blood (Fluoride)'], ['urine', 'Urine'], ['stool', 'Stool'], ['swab', 'Swab'], ['sputum', 'Sputum'], ['csf', 'CSF'], ['tissue', 'Tissue'], ['none', 'None / Imaging']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select></div>
                    <div>{lbl('Unit')}<input style={inp} value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="g/dL" /></div>
                    <div>{lbl('Price (₦)')}<input style={inp} type="number" value={form.price} onChange={e => set('price', e.target.value)} /></div>
                    <div>{lbl('Ref low')}<input style={inp} type="number" value={form.reference_range_low} onChange={e => set('reference_range_low', e.target.value)} /></div>
                    <div>{lbl('Ref high')}<input style={inp} type="number" value={form.reference_range_high} onChange={e => set('reference_range_high', e.target.value)} /></div>
                </div>
                <Btn disabled={saving} onClick={add}>{saving ? 'Adding…' : 'Add to Catalogue'}</Btn>
            </div>
            <div style={card()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '12px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700 }}>Test Catalogue &amp; Usage</span>
                    <input style={{ ...inp, maxWidth: '200px' }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" />
                </div>
                <div style={{ overflowX: 'auto', maxHeight: '440px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <thead><tr style={{ textAlign: 'left', color: C.t2, fontSize: '10.5px', textTransform: 'uppercase' }}>
                            {['Test', 'Category', 'Price', 'Performed'].map(h => <th key={h} style={{ padding: '7px 8px', borderBottom: `1px solid ${C.br}`, position: 'sticky', top: 0, background: C.s }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {filtered.length === 0 ? <tr><td colSpan={4} style={{ textAlign: 'center', padding: '22px', color: C.t3 }}>No tests.</td></tr> :
                                filtered.map(t => (
                                    <tr key={t.id}>
                                        <td style={{ padding: '7px 8px', borderBottom: `1px solid ${C.br}`, fontWeight: 600 }}>{t.name}</td>
                                        <td style={{ padding: '7px 8px', borderBottom: `1px solid ${C.br}`, textTransform: 'capitalize' }}>{t.category}</td>
                                        <td style={{ padding: '7px 8px', borderBottom: `1px solid ${C.br}` }}>{naira(t.price)}</td>
                                        <td style={{ padding: '7px 8px', borderBottom: `1px solid ${C.br}` }}>{t.times_performed ?? 0}×</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

/* ═══ QC / CALIBRATION (placeholder — needs backend model) ═════════ */
function QCPane() {
    return (
        <div style={card({ textAlign: 'center', padding: '40px' })}>
            <div style={{ fontSize: '34px', marginBottom: '10px' }}>🧰</div>
            <div style={{ fontSize: '15px', fontWeight: 700 }}>QC / Calibration log</div>
            <div style={{ fontSize: '13px', color: C.t2, maxWidth: '440px', margin: '8px auto 0' }}>
                Daily QC runs and instrument calibration logging aren’t wired to a backend model yet. This needs a small <code>QCRecord</code> model (analyte, level, expected/observed, Westgard rule, operator). Say the word and I’ll add it with the same v8 layout.
            </div>
        </div>
    )
}

/* ═══ ROOT ═════════════════════════════════════════════════════════ */
const TABS = [['orders', 'Lab Orders'], ['results', 'Results & Upload'], ['radiology', 'Radiology'], ['inventory', 'Inventory & Stock'], ['qc', 'QC / Calibration']]

export default function LabPage() {
    const [tab, setTab] = useState('orders')
    const [dash, setDash] = useState({})
    const [orders, setOrders] = useState([])
    const [tests, setTests] = useState([])
    const [loading, setLoading] = useState(true)
    const [resultOrderId, setResultOrderId] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        const [d, o, t] = await Promise.allSettled([labAPI.dashboard(), labAPI.orders(), labAPI.tests()])
        if (d.status === 'fulfilled') setDash(d.value.data || {})
        if (o.status === 'fulfilled') setOrders(unwrap(o.value.data))
        if (t.status === 'fulfilled') setTests(unwrap(t.value.data))
        setLoading(false)
    }, [])
    useEffect(() => { load() }, [load])

    const goToResults = (orderId) => { setResultOrderId(orderId); setTab('results') }

    return (
        <AppLayout title="Laboratory & Radiology" action={<Btn variant="outline" size="sm" onClick={load}>↺ Refresh</Btn>}>
            <StatCards d={dash} />
            <div style={{ display: 'flex', gap: '4px', borderBottom: `1px solid ${C.br}`, marginBottom: '16px', overflowX: 'auto' }}>
                {TABS.map(([id, label]) => (
                    <button key={id} onClick={() => setTab(id)} style={{ padding: '10px 16px', fontSize: '13px', fontWeight: tab === id ? 700 : 500, cursor: 'pointer', background: 'none', border: 'none', borderBottom: `2px solid ${tab === id ? C.b : 'transparent'}`, color: tab === id ? C.b : C.t2, whiteSpace: 'nowrap', fontFamily: 'inherit' }}>{label}</button>
                ))}
            </div>
            {loading ? <div style={{ textAlign: 'center', padding: '40px', color: C.t3 }}>Loading laboratory…</div> : (
                <>
                    {tab === 'orders' && <OrdersView orders={orders} onChanged={load} onEnterResult={goToResults} imagingOnly={false} emptyLabel="No lab orders from doctors yet." />}
                    {tab === 'results' && <ResultsUploadPane orders={orders} preselectId={resultOrderId} onChanged={load} />}
                    {tab === 'radiology' && <OrdersView orders={orders} onChanged={load} onEnterResult={goToResults} imagingOnly={true} emptyLabel="No imaging/ECG orders awaiting action." />}
                    {tab === 'inventory' && <InventoryPane tests={tests} onChanged={load} />}
                    {tab === 'qc' && <QCPane />}
                </>
            )}
        </AppLayout>
    )
}