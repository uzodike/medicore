import { useState, useEffect, useRef, useCallback } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import { pharmacyAPI } from '../../api/pharmacy'
import { patientsAPI } from '../../api/patients'
import { useAuthStore } from '../../store/authStore'           // adjust to your auth hook
import toast from 'react-hot-toast'

/* ─── Design tokens (mirror the HMS palette) ─────────────────────────── */
const C = {
    b: '#1a6b5a', bm: '#2a8f76', bd: '#0f4a3d', bl: '#e6f5f1',
    bg: '#f0f4f3', s: '#fff', sb: '#0e2a24', sh: '#1a3d33', sa: '#2a6b5a',
    t1: '#111827', t2: '#6b7280', t3: '#9ca3af',
    br: '#e5e7eb', br2: '#d1d5db',
    ok: '#16a34a', okB: '#f0fdf4',
    w: '#d97706', wB: '#fffbeb',
    d: '#dc2626', dB: '#fef2f2',
    i: '#2563eb', iB: '#eff6ff',
    p: '#7c3aed', pB: '#f5f3ff',
}

const STOCK_META = {
    good: { bg: C.okB, color: C.ok, label: 'Good' },
    low: { bg: C.wB, color: C.w, label: 'Low Stock' },
    critical: { bg: C.dB, color: C.d, label: 'Critical' },
    out_of_stock: { bg: '#f3f4f6', color: C.t2, label: 'Out of Stock' },
}

/* ─── Tiny shared components ─────────────────────────────────────────── */
const Badge = ({ status }) => {
    const m = STOCK_META[status] || STOCK_META.good
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '2px 9px',
            borderRadius: '20px', fontSize: '11px', fontWeight: 700,
            background: m.bg, color: m.color,
        }}>{m.label}</span>
    )
}

const Btn = ({ children, onClick, variant = 'primary', size = 'md', disabled, style = {} }) => {
    const base = {
        display: 'inline-flex', alignItems: 'center', gap: '6px', border: 'none',
        borderRadius: '8px', cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 600, fontFamily: 'inherit', transition: 'opacity .15s',
        opacity: disabled ? .5 : 1,
        fontSize: size === 'sm' ? '12px' : '13px',
        padding: size === 'sm' ? '5px 12px' : '9px 18px',
    }
    const variants = {
        primary: { background: C.b, color: '#fff' },
        success: { background: C.ok, color: '#fff' },
        danger: { background: C.d, color: '#fff' },
        outline: { background: '#fff', color: C.t2, border: `1px solid ${C.br2}` },
        ghost: { background: 'transparent', color: C.t2 },
    }
    return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant], ...style }}>{children}</button>
}

const inp = {
    width: '100%', padding: '8px 11px', border: `1.5px solid ${C.br}`, borderRadius: '8px',
    fontSize: '13.5px', fontFamily: 'inherit', outline: 'none', color: C.t1,
    background: C.s, boxSizing: 'border-box',
}

const card = {
    background: C.s, borderRadius: '14px', border: `1px solid ${C.br}`, padding: '20px',
}

/* ─── Searchable Drug Dropdown ───────────────────────────────────────── */
function DrugSearchInput({ value, onChange, placeholder = 'Search drug…', style = {} }) {
    const [query, setQuery] = useState(value?.name || '')
    const [results, setResults] = useState([])
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const ref = useRef(null)
    const timer = useRef(null)

    // close on outside click
    useEffect(() => {
        const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [])

    // debounced search
    useEffect(() => {
        clearTimeout(timer.current)
        if (!query || query.length < 1) { setResults([]); setOpen(false); return }
        setLoading(true)
        timer.current = setTimeout(async () => {
            try {
                const { data } = await pharmacyAPI.drugs({ search: query, page_size: 50 })
                setResults(data.results ?? data)
                setOpen(true)
            } catch { setResults([]) }
            finally { setLoading(false) }
        }, 250)
    }, [query])

    const select = drug => {
        setQuery(drug.name)
        setOpen(false)
        onChange(drug)
    }

    const clear = () => { setQuery(''); setOpen(false); onChange(null) }

    return (
        <div ref={ref} style={{ position: 'relative', ...style }}>
            <div style={{ position: 'relative' }}>
                <input
                    value={query}
                    onChange={e => { setQuery(e.target.value); if (!e.target.value) onChange(null) }}
                    onFocus={() => query && results.length && setOpen(true)}
                    placeholder={placeholder}
                    style={{ ...inp, paddingRight: '32px' }}
                />
                {query && (
                    <button onClick={clear} style={{
                        position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: C.t3, fontSize: '16px', lineHeight: 1,
                    }}>×</button>
                )}
            </div>

            {open && (
                <div style={{
                    position: 'absolute', zIndex: 200, top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: C.s, border: `1px solid ${C.br}`, borderRadius: '10px',
                    boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxHeight: '260px', overflowY: 'auto',
                }}>
                    {loading && <div style={{ padding: '12px 14px', color: C.t3, fontSize: '13px' }}>Searching…</div>}
                    {!loading && results.length === 0 && (
                        <div style={{ padding: '12px 14px', color: C.t3, fontSize: '13px' }}>No drugs found</div>
                    )}
                    {results.map(drug => {
                        const m = STOCK_META[drug.stock_status] || STOCK_META.good
                        return (
                            <div key={drug.id} onClick={() => select(drug)} style={{
                                padding: '10px 14px', cursor: 'pointer', borderBottom: `1px solid ${C.br}`,
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                transition: 'background .1s',
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                                onMouseLeave={e => e.currentTarget.style.background = ''}
                            >
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{drug.name}</div>
                                    <div style={{ fontSize: '11px', color: C.t3 }}>
                                        {drug.generic_name || drug.dosage_form} · ₦{Number(drug.unit_price).toLocaleString()}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: m.color }}>{drug.current_stock} units</span>
                                    <Badge status={drug.stock_status} />
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

/* ─── Searchable Patient Dropdown ────────────────────────────────────── */
function PatientSearchInput({ value, onChange, placeholder = 'Search patient…' }) {
    const [query, setQuery] = useState(value?.name || value || '')
    const [results, setResults] = useState([])
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [selected, setSelected] = useState(null)
    const ref = useRef(null)
    const timer = useRef(null)

    // Close on outside click
    useEffect(() => {
        const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [])

    // Fetch patients — called both on focus (all) and on keystroke (filtered)
    const fetchPatients = async (q = '') => {
        setLoading(true)
        try {
            const params = { page_size: 50 }
            if (q.trim()) params.search = q.trim()
            const { data } = await patientsAPI.list(params)
            setResults(data.results ?? data)
            setOpen(true)
        } catch { setResults([]) }
        finally { setLoading(false) }
    }

    // Debounced on keystroke
    useEffect(() => {
        if (selected) return          // user already picked — don't re-search
        clearTimeout(timer.current)
        timer.current = setTimeout(() => fetchPatients(query), 250)
    }, [query])

    const select = pt => {
        const name = `${pt.first_name || pt.first} ${pt.last_name || pt.last}`
        setQuery(name)
        setSelected(pt)
        setOpen(false)
        onChange({ name, pid: pt.patient_id || pt.pid, id: pt.id, allergies: pt.allergies })
    }

    const clear = () => {
        setQuery(''); setSelected(null); setResults([]); setOpen(false)
        onChange({ name: '', pid: '', id: null, allergies: '' })
    }

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <div style={{ position: 'relative' }}>
                <input
                    value={query}
                    onChange={e => { setQuery(e.target.value); setSelected(null) }}
                    onFocus={() => fetchPatients(query)}   // always show list on focus
                    placeholder={placeholder}
                    style={{ ...inp, paddingRight: selected ? '32px' : inp.paddingRight,
                        borderColor: selected ? C.b : C.br }}
                />
                {selected && (
                    <button onClick={clear} style={{
                        position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: C.t3, fontSize: '16px', lineHeight: 1,
                    }}>×</button>
                )}
            </div>

            {open && (
                <div style={{
                    position: 'absolute', zIndex: 300, top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: C.s, border: `1px solid ${C.br}`, borderRadius: '10px',
                    boxShadow: '0 8px 24px rgba(0,0,0,.14)', maxHeight: '240px', overflowY: 'auto',
                }}>
                    {loading && (
                        <div style={{ padding: '12px 14px', color: C.t3, fontSize: '13px' }}>Loading patients…</div>
                    )}
                    {!loading && results.length === 0 && (
                        <div style={{ padding: '12px 14px', color: C.t3, fontSize: '13px' }}>No patients found</div>
                    )}
                    {!loading && results.map(pt => {
                        const name = `${pt.first_name || pt.first} ${pt.last_name || pt.last}`
                        const pid = pt.patient_id || pt.pid || ''
                        return (
                            <div key={pt.id} onClick={() => select(pt)} style={{
                                padding: '10px 14px', cursor: 'pointer', borderBottom: `1px solid ${C.br}`,
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                transition: 'background .1s',
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                                onMouseLeave={e => e.currentTarget.style.background = ''}
                            >
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{name}</div>
                                    <div style={{ fontSize: '11px', color: C.t3 }}>
                                        {pid}{pid ? ' · ' : ''}{pt.gender || ''}{pt.blood_group ? ` · ${pt.blood_group}` : ''}
                                        {pt.allergies
                                            ? <span style={{ color: C.d, marginLeft: '6px' }}>⚠ {pt.allergies}</span>
                                            : null}
                                    </div>
                                </div>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: C.b, background: C.bl, padding: '2px 7px', borderRadius: '10px' }}>
                                    {pid || 'PT'}
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

/* ─── Dispense Row (one drug per row) ────────────────────────────────── */
function DispenseRow({ row, index, onChange, onRemove, canRemove }) {
    return (
        <div style={{
            display: 'grid', gridTemplateColumns: '1fr 100px 120px 32px',
            gap: '10px', alignItems: 'end', marginBottom: '12px',
        }}>
            <div>
                {index === 0 && <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2, display: 'block', marginBottom: '5px' }}>Drug *</label>}
                <DrugSearchInput
                    value={row.drug}
                    onChange={drug => onChange(index, 'drug', drug)}
                    placeholder="Search & select drug…"
                />
                {row.drug && (
                    <div style={{ fontSize: '11px', color: C.t3, marginTop: '3px' }}>
                        {row.drug.current_stock} in stock · ₦{Number(row.drug.unit_price).toLocaleString()} each
                        {row.drug.rx_required && <span style={{ color: C.p, marginLeft: '6px' }}>Rx required</span>}
                        {row.drug.interactions && <span style={{ color: C.w, marginLeft: '6px' }}>⚠ Interactions</span>}
                    </div>
                )}
            </div>

            <div>
                {index === 0 && <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2, display: 'block', marginBottom: '5px' }}>Qty *</label>}
                <input
                    type="number" min={1}
                    max={row.drug?.current_stock || undefined}
                    value={row.qty}
                    onChange={e => onChange(index, 'qty', Math.max(1, Number(e.target.value)))}
                    style={{
                        ...inp,
                        borderColor: row.drug && row.qty > row.drug.current_stock ? C.d : C.br,
                    }}
                />
                {row.drug && row.qty > row.drug.current_stock && (
                    <div style={{ fontSize: '11px', color: C.d, marginTop: '3px' }}>
                        Only {row.drug.current_stock} available
                    </div>
                )}
            </div>

            <div>
                {index === 0 && <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2, display: 'block', marginBottom: '5px' }}>Subtotal</label>}
                <div style={{
                    ...inp, background: C.bg, display: 'flex', alignItems: 'center',
                    fontWeight: 700, color: row.drug && row.qty > row.drug.current_stock ? C.d : C.t1,
                }}>
                    ₦{row.drug ? (Number(row.drug.unit_price) * row.qty).toLocaleString() : '0'}
                </div>
            </div>

            <div style={{ paddingBottom: '2px' }}>
                {index === 0 && <div style={{ height: '22px' }} />}
                {canRemove && (
                    <button onClick={() => onRemove(index)} style={{
                        background: 'none', border: `1px solid ${C.br}`, borderRadius: '6px',
                        cursor: 'pointer', color: C.d, fontSize: '16px', lineHeight: 1,
                        width: '32px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>×</button>
                )}
            </div>
        </div>
    )
}

/* ─── Quick-dispense warnings ────────────────────────────────────────── */
function DispenseWarnings({ rows }) {
    const warnings = []
    rows.forEach(row => {
        if (!row.drug) return
        const { name, stock_status, current_stock, expiry_date, rx_required, interactions } = row.drug
        if (stock_status === 'out_of_stock') warnings.push({ type: 'd', msg: `⛔ ${name}: OUT OF STOCK` })
        else if (stock_status === 'critical') warnings.push({ type: 'w', msg: `⚠ ${name}: critically low stock` })
        if (row.qty > current_stock) warnings.push({ type: 'd', msg: `⛔ ${name}: requested ${row.qty}, only ${current_stock} available` })
        if (expiry_date) {
            const days = Math.ceil((new Date(expiry_date) - new Date()) / 86400000)
            if (days < 0) warnings.push({ type: 'd', msg: `⛔ ${name}: EXPIRED — do not dispense` })
            else if (days <= 30) warnings.push({ type: 'w', msg: `⚠ ${name}: expires in ${days} days` })
        }
        if (rx_required) warnings.push({ type: 'i', msg: `ℹ ${name}: prescription required` })
        if (interactions) warnings.push({ type: 'w', msg: `⚠ ${name}: ${interactions}` })
    })
    if (!warnings.length) return null
    return (
        <div style={{ marginTop: '12px' }}>
            {warnings.map((w, i) => (
                <div key={i} style={{
                    padding: '8px 12px', borderRadius: '7px', fontSize: '12.5px', fontWeight: 500,
                    marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px',
                    background: w.type === 'd' ? C.dB : w.type === 'w' ? C.wB : C.iB,
                    color: w.type === 'd' ? C.d : w.type === 'w' ? C.w : C.i,
                    border: `1px solid ${w.type === 'd' ? '#fecaca' : w.type === 'w' ? '#fde68a' : '#bfdbfe'}`,
                }}>{w.msg}</div>
            ))}
        </div>
    )
}

/* ─── DISPENSE TAB ───────────────────────────────────────────────────── */
function DispenseTab({ refresh, currentUser }) {
    const emptyRow = () => ({ drug: null, qty: 1 })
    const [rows, setRows] = useState([emptyRow()])
    const [patient, setPatient] = useState({ name: '', pid: '', id: null })
    const [rxNum, setRxNum] = useState('')
    const [notes, setNotes] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const updateRow = (i, field, val) => {
        setRows(prev => { const r = [...prev]; r[i] = { ...r[i], [field]: val }; return r })
    }
    const addRow = () => setRows(prev => [...prev, emptyRow()])
    const removeRow = i => setRows(prev => prev.filter((_, idx) => idx !== i))

    const grandTotal = rows.reduce((s, r) => s + (r.drug ? Number(r.drug.unit_price) * r.qty : 0), 0)

    const hasBlocker = rows.some(r =>
        r.drug && (r.drug.stock_status === 'out_of_stock' || r.qty > r.drug.current_stock ||
            (r.drug.nearest_expiry && new Date(r.drug.nearest_expiry) < new Date()))
    )

    const handleDispense = async () => {
        if (!patient.name.trim()) return toast.error('Patient name is required')
        if (rows.some(r => !r.drug)) return toast.error('Select a drug for every row')
        if (rows.some(r => r.qty < 1)) return toast.error('Quantity must be at least 1')
        if (hasBlocker) return toast.error('Resolve stock/expiry errors before dispensing')

        setSubmitting(true)
        try {
            await pharmacyAPI.dispense({
                patient_name: patient.name,
                patient_id: patient.id,
                prescription_id: rxNum,
                notes,
                items: rows.map(r => ({ drug_id: r.drug.id, quantity: r.qty })),
            })
            toast.success(`✓ Dispensed ${rows.length} drug(s) to ${patient.name}`)
            setRows([emptyRow()])
            setPatient({ name: '', pid: '', id: null })
            setRxNum(''); setNotes('')
            refresh()
        } catch (e) {
            const msg = e.response?.data?.detail || e.response?.data?.errors?.join('; ') || 'Dispense failed'
            toast.error(msg)
        } finally { setSubmitting(false) }
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px' }}>

            {/* ── Left: Drug rows ── */}
            <div style={card}>
                <h3 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '18px' }}>💊 Drugs to Dispense</h3>

                {rows.map((row, i) => (
                    <DispenseRow
                        key={i} row={row} index={i}
                        onChange={updateRow}
                        onRemove={removeRow}
                        canRemove={rows.length > 1}
                    />
                ))}

                <button onClick={addRow} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: 'none', border: `1.5px dashed ${C.b}`, borderRadius: '8px',
                    color: C.b, padding: '7px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                    marginTop: '4px',
                }}>+ Add another drug</button>

                <DispenseWarnings rows={rows} />

                {/* Grand total */}
                <div style={{
                    marginTop: '18px', padding: '14px 16px', background: C.bl, borderRadius: '10px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <span style={{ color: C.bd, fontWeight: 600 }}>Grand Total</span>
                    <span style={{ fontWeight: 800, fontSize: '20px', color: C.bd }}>
                        ₦{grandTotal.toLocaleString()}
                    </span>
                </div>
            </div>

            {/* ── Right: Patient + submit ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={card}>
                    <h3 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>🧾 Patient Details</h3>

                    <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2, display: 'block', marginBottom: '5px' }}>Patient *</label>
                    <PatientSearchInput
                        value={patient.name}
                        onChange={pt => setPatient(pt)}
                        placeholder="Search patient by name or ID…"
                    />
                    {patient.pid && (
                        <div style={{ fontSize: '11px', color: C.t3, marginTop: '4px' }}>ID: {patient.pid}</div>
                    )}

                    <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2, display: 'block', margin: '14px 0 5px' }}>Prescription # (optional)</label>
                    <input value={rxNum} onChange={e => setRxNum(e.target.value)} placeholder="RX-2026-XXXX" style={inp} />

                    <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2, display: 'block', margin: '14px 0 5px' }}>Notes</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                        placeholder="Additional instructions…"
                        style={{ ...inp, resize: 'vertical', minHeight: '60px' }}
                    />

                    <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2, display: 'block', margin: '14px 0 5px' }}>Dispensed By</label>
                    <input
                        value={currentUser ? (currentUser.full_name || currentUser.username || currentUser.email) : '—'}
                        readOnly
                        style={{ ...inp, background: C.bg, color: C.t2, cursor: 'not-allowed' }}
                    />
                </div>

                <Btn
                    onClick={handleDispense}
                    disabled={submitting || !patient.name || rows.some(r => !r.drug)}
                    style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: '15px', borderRadius: '10px' }}
                >
                    {submitting ? 'Processing…' : `✓ Dispense — ₦${grandTotal.toLocaleString()}`}
                </Btn>
            </div>
        </div>
    )
}

/* ─── PRESCRIPTIONS TAB ─────────────────────────────────────────────── */
function PrescriptionsTab({ refresh, currentUser }) {
    const [prescriptions, setPrescriptions] = useState([])
    const [loading, setLoading] = useState(true)
    const [selected, setSelected] = useState(null)
    const [dispensing, setDispensing] = useState(false)
    const [statusFilter, setStatusFilter] = useState('pending')
    const [showAdd, setShowAdd] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const { data } = await pharmacyAPI.prescriptions({ status: statusFilter })
            setPrescriptions(data.results ?? data)
        } catch { toast.error('Failed to load prescriptions') }
        finally { setLoading(false) }
    }, [statusFilter])

    useEffect(() => { load() }, [load])

    const dispenseAll = async rx => {
        setDispensing(true)
        try {
            const patientName = rx.patient_name?.trim() || rx.patient || `Patient ${rx.prescription_id}`;
            await pharmacyAPI.dispense({
                patient_name: patientName,
                patient_id: rx.patient,
                prescription_id: rx.prescription_id,
                items: rx.items.map(it => ({ drug_id: it.drug, quantity: it.quantity_prescribed || 1 })),
            })
            toast.success(`✓ ${rx.prescription_id} dispensed`)
            load(); refresh()
            setSelected(null)
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Dispense failed')
        } finally { setDispensing(false) }
    }

    const rejectRx = async rx => {
        try {
            await pharmacyAPI.updatePrescription(rx.id, { status: 'rejected' })
            toast.success(`${rx.prescription_id} rejected`)
            load()
            setSelected(null)
        } catch { toast.error('Failed to reject') }
    }

    const priorityColor = { normal: C.b, urgent: C.w, stat: C.d }
    const priorityBg = { normal: C.bl, urgent: C.wB, stat: C.dB }

    return (
        <>
            <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px', minHeight: '500px' }}>

                {/* ── Queue list ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {['pending', 'dispensed', 'rejected'].map(s => (
                            <button key={s} onClick={() => setStatusFilter(s)} style={{
                                padding: '5px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 600,
                                cursor: 'pointer', textTransform: 'capitalize',
                                background: statusFilter === s ? C.sa : C.bg,
                                color: statusFilter === s ? '#fff' : C.t2,
                            }}>{s}</button>
                        ))}
                        <Btn size="sm" onClick={() => setShowAdd(true)} style={{ marginLeft: 'auto' }}>
                            + New Rx
                        </Btn>
                    </div>

                    {loading && <div style={{ color: C.t3, padding: '20px', textAlign: 'center' }}>Loading…</div>}

                    {!loading && prescriptions.length === 0 && (
                        <div style={{ color: C.t3, padding: '32px', textAlign: 'center', background: C.s, borderRadius: '10px', border: `1px solid ${C.br}` }}>
                            No {statusFilter} prescriptions
                        </div>
                    )}

                    {prescriptions.map(rx => {
                        const pColor = priorityColor[rx.priority] || C.b
                        const pBg = priorityBg[rx.priority] || C.bl
                        const isSelected = selected?.id === rx.id
                        return (
                            <div key={rx.id} onClick={() => setSelected(rx)} style={{
                                background: isSelected ? C.bl : C.s,
                                border: `1px solid ${isSelected ? C.b : C.br}`,
                                borderLeft: `4px solid ${pColor}`,
                                borderRadius: '10px', padding: '12px 14px', cursor: 'pointer',
                                transition: 'all .15s',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <strong style={{ fontSize: '13.5px' }}>{rx.patient_name}</strong>
                                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', background: pBg, color: pColor }}>
                                        {rx.priority?.toUpperCase()}
                                    </span>
                                </div>
                                <div style={{ fontSize: '11.5px', color: C.t2, marginBottom: '5px' }}>
                                    {rx.prescription_id} · {rx.doctor_name}
                                </div>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                    {rx.items?.map((it, i) => (
                                        <span key={i} style={{
                                            fontSize: '10px', padding: '2px 7px', borderRadius: '10px',
                                            background: C.iB, color: C.i, fontWeight: 600,
                                        }}>{it.drug_name} ×{it.quantity_prescribed}</span>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* ── Detail panel ── */}
                {selected ? (
                    <div style={card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
                            <div>
                                <h3 style={{ fontWeight: 700, fontSize: '16px', margin: 0 }}>{selected.patient_name}</h3>
                                <div style={{ color: C.i, fontWeight: 600, fontSize: '13px', marginTop: '3px' }}>{selected.prescription_id}</div>
                                <div style={{ color: C.t2, fontSize: '12.5px', marginTop: '2px' }}>Requested by {selected.doctor_name}</div>
                            </div>
                            <span style={{
                                fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '12px',
                                background: priorityBg[selected.priority] || C.bl,
                                color: priorityColor[selected.priority] || C.b,
                            }}>{selected.priority?.toUpperCase()}</span>
                        </div>

                        {/* Drug checklist */}
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '10px' }}>
                                Prescribed Drugs
                            </div>
                            {selected.items?.map((it, i) => {
                                const lowStock = it.drug_stock < (it.quantity_prescribed || 1)
                                return (
                                    <div key={i} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '10px 14px', borderRadius: '8px', marginBottom: '6px',
                                        background: lowStock ? C.dB : C.bg,
                                        border: `1px solid ${lowStock ? '#fecaca' : C.br}`,
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '13px' }}>{it.drug_name}</div>
                                            <div style={{ fontSize: '11.5px', color: C.t2 }}>
                                                {it.dose} · {it.frequency} · {it.duration_days}d
                                                {it.instructions && ` · ${it.instructions}`}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 700, fontSize: '13px' }}>×{it.quantity_prescribed}</div>
                                            <div style={{ fontSize: '11px', color: lowStock ? C.d : C.t3 }}>
                                                {it.drug_stock} in stock
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {selected.notes && (
                            <div style={{ padding: '10px 14px', background: C.wB, border: `1px solid #fde68a`, borderRadius: '8px', fontSize: '13px', color: '#854d0e', marginBottom: '16px' }}>
                                <strong>⚠ Notes:</strong> {selected.notes}
                            </div>
                        )}

                        <div style={{ fontSize: '11.5px', color: C.t2, marginBottom: '14px' }}>
                            Dispensed by: <strong>{currentUser?.full_name || currentUser?.username || '—'}</strong>
                        </div>

                        {selected.status === 'pending' && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Btn onClick={() => dispenseAll(selected)} disabled={dispensing} style={{ flex: 1, justifyContent: 'center' }}>
                                    {dispensing ? 'Dispensing…' : '✓ Dispense All'}
                                </Btn>
                                <Btn onClick={() => rejectRx(selected)} variant="outline" style={{ color: C.d, borderColor: C.d }}>
                                    Reject
                                </Btn>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.t3, fontSize: '14px' }}>
                        ← Select a prescription to review
                    </div>
                )}
            </div>
            {showAdd && (
                <AddPrescriptionModal onClose={() => { setShowAdd(false); load(); refresh() }} />
            )}
        </>
    )
}

/* WalkinTab removed — no walk-in sales flow needed */

/* ─── ADD PRESCRIPTION MODAL (multi-drug, patient dropdown) ─────────── */
function AddPrescriptionModal({ onClose }) {
    const emptyDrug = () => ({ drug: null, dose: '', frequency: 'BD', duration_days: 7, quantity_prescribed: 0, instructions: '' })
    const FREQS = ['OD', 'BD', 'TDS', 'QDS', 'Nocte', 'PRN', 'Stat', 'Weekly']

    const [patient, setPatient] = useState({ name: '', pid: '', id: null, allergies: '' })
    const [priority, setPriority] = useState('normal')
    const [notes, setNotes] = useState('')
    const [drugs, setDrugs] = useState([emptyDrug()])
    const [saving, setSaving] = useState(false)

    const updateDrug = (i, field, val) =>
        setDrugs(prev => { const d = [...prev]; d[i] = { ...d[i], [field]: val }; return d })
    const addDrug = () => setDrugs(prev => [...prev, emptyDrug()])
    const removeDrug = i => setDrugs(prev => prev.filter((_, idx) => idx !== i))

    const handleSave = async () => {
        if (!patient.id) return toast.error('Select a patient')
        if (drugs.some(d => !d.drug)) return toast.error('Select a drug for every row')
        if (drugs.some(d => d.quantity_prescribed < 1)) return toast.error('Quantity must be ≥ 1 for every drug')
        setSaving(true)
        try {
            await pharmacyAPI.createPrescription({
                patient: patient.id,
                priority,
                notes,
                items: drugs.map(d => ({
                    drug: d.drug.id,
                    dose: d.dose,
                    frequency: d.frequency,
                    duration_days: d.duration_days,
                    quantity_prescribed: d.quantity_prescribed,
                    instructions: d.instructions,
                })),
            })
            toast.success(`✓ Prescription created for ${patient.name}`)
            onClose()
        } catch (e) {
            const err = e.response?.data
            toast.error(typeof err === 'object' ? Object.values(err).flat().join('; ') : 'Failed to create prescription')
        } finally { setSaving(false) }
    }

    const pColors = { normal: C.b, urgent: C.w, stat: C.d }
    const lbl = txt => <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2, display: 'block', marginBottom: '5px' }}>{txt}</label>
    const grandTotal = drugs.reduce((s, d) => s + (d.drug ? Number(d.drug.unit_price) * d.quantity_prescribed : 0), 0)

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: '16px' }}>
            <div style={{ background: '#fff', borderRadius: '16px', width: '700px', maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,.22)' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: `1px solid ${C.br}`, flexShrink: 0 }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>New Prescription</h2>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: C.t3 }}>Add multiple drugs for a patient</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: `1px solid ${C.br}`, borderRadius: '8px', cursor: 'pointer', color: C.t2, fontSize: '20px', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>

                {/* Body */}
                <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>

                    {/* Patient + Priority */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 210px', gap: '14px', marginBottom: '20px' }}>
                        <div>
                            {lbl('Patient *')}
                            <PatientSearchInput value={patient} onChange={pt => setPatient(pt)} placeholder="Click to search and select patient…" />
                            {patient.pid && (
                                <div style={{ fontSize: '11px', color: C.t3, marginTop: '4px' }}>
                                    ID: {patient.pid}
                                    {patient.allergies && <span style={{ color: C.d, marginLeft: '8px', fontWeight: 600 }}>⚠ Allergies: {patient.allergies}</span>}
                                </div>
                            )}
                        </div>
                        <div>
                            {lbl('Priority')}
                            <div style={{ display: 'flex', gap: '6px' }}>
                                {['normal', 'urgent', 'stat'].map(p => (
                                    <button key={p} onClick={() => setPriority(p)} style={{
                                        flex: 1, padding: '8px 4px', border: `1.5px solid ${priority === p ? pColors[p] : C.br}`,
                                        borderRadius: '8px', background: priority === p ? pColors[p] : '#fff',
                                        color: priority === p ? '#fff' : C.t2,
                                        fontSize: '11px', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', transition: 'all .15s',
                                    }}>{p}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Drug rows */}
                    <div style={{ fontSize: '11px', fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '12px' }}>
                        Drugs ({drugs.length})
                    </div>

                    {drugs.map((row, i) => (
                        <div key={i} style={{ background: C.bg, borderRadius: '12px', padding: '14px', marginBottom: '10px', border: `1px solid ${C.br}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: C.t2 }}>Drug {i + 1}</span>
                                {drugs.length > 1 && (
                                    <button onClick={() => removeDrug(i)} style={{ background: 'none', border: `1px solid ${C.br2}`, borderRadius: '6px', cursor: 'pointer', color: C.d, fontSize: '12px', padding: '3px 10px' }}>
                                        Remove
                                    </button>
                                )}
                            </div>

                            {/* Drug search */}
                            <div style={{ marginBottom: '10px' }}>
                                {lbl('Drug Name *')}
                                <DrugSearchInput value={row.drug} onChange={drug => updateDrug(i, 'drug', drug)} placeholder="Search drug…" />
                                {row.drug && (
                                    <div style={{ fontSize: '11px', color: C.t3, marginTop: '3px', display: 'flex', gap: '10px' }}>
                                        <span style={{ color: row.drug.current_stock < row.quantity_prescribed ? C.d : C.t3 }}>
                                            {row.drug.current_stock} in stock
                                        </span>
                                        <span>₦{Number(row.drug.unit_price).toLocaleString()} each</span>
                                        {row.drug.rx_required && <span style={{ color: C.p }}>Rx required</span>}
                                        {row.drug.interactions && <span style={{ color: C.w }}>⚠ Interactions</span>}
                                    </div>
                                )}
                            </div>

                            {/* Dose / Frequency / Days / Qty */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px 90px', gap: '10px', marginBottom: '10px' }}>
                                <div>
                                    {lbl('Dose *')}
                                    <input value={row.dose} onChange={e => updateDrug(i, 'dose', e.target.value)} placeholder="e.g. 500mg" style={inp} />
                                </div>
                                <div>
                                    {lbl('Frequency')}
                                    <select value={row.frequency} onChange={e => updateDrug(i, 'frequency', e.target.value)} style={inp}>
                                        {FREQS.map(f => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                </div>
                                <div>
                                    {lbl('Days')}
                                    <input type="number" min={1} value={row.duration_days} onChange={e => updateDrug(i, 'duration_days', Number(e.target.value))} style={inp} />
                                </div>
                                <div>
                                    {lbl('Qty *')}
                                    <input type="number" min={0} value={row.quantity_prescribed}
                                        onChange={e => updateDrug(i, 'quantity_prescribed', Number(e.target.value))}
                                        style={{ ...inp, borderColor: row.drug && row.quantity_prescribed > row.drug.current_stock ? C.d : C.br }} />
                                </div>
                            </div>

                            {row.drug && row.quantity_prescribed > row.drug.current_stock && (
                                <div style={{ padding: '7px 10px', background: C.dB, borderRadius: '7px', fontSize: '12px', color: C.d, fontWeight: 500, marginBottom: '8px' }}>
                                    ⛔ Only {row.drug.current_stock} in stock — exceeds available quantity
                                </div>
                            )}

                            <div>
                                {lbl('Instructions')}
                                <input value={row.instructions} onChange={e => updateDrug(i, 'instructions', e.target.value)} placeholder="e.g. Take after meals, avoid sunlight…" style={inp} />
                            </div>

                            {row.drug && row.quantity_prescribed > 0 && (
                                <div style={{ marginTop: '10px', padding: '7px 12px', background: C.bl, borderRadius: '7px', fontSize: '12px', color: C.bd, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Subtotal</span>
                                    <span>₦{(Number(row.drug.unit_price) * row.quantity_prescribed).toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                    ))}

                    <button onClick={addDrug} style={{ display: 'flex', alignItems: 'center', gap: '7px', width: '100%', background: 'none', border: `1.5px dashed ${C.b}`, borderRadius: '10px', color: C.b, padding: '10px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, justifyContent: 'center', marginBottom: '16px' }}>
                        + Add another drug
                    </button>

                    {lbl('Notes')}
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Overall prescription notes…" style={{ ...inp, resize: 'vertical' }} />

                    {grandTotal > 0 && (
                        <div style={{ marginTop: '14px', padding: '12px 16px', background: C.bl, borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, color: C.bd }}>Total Estimated Cost</span>
                            <span style={{ fontWeight: 800, fontSize: '18px', color: C.bd }}>₦{grandTotal.toLocaleString()}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', padding: '16px 24px', borderTop: `1px solid ${C.br}`, flexShrink: 0 }}>
                    <Btn onClick={onClose} variant="outline">Cancel</Btn>
                    <Btn onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving…' : `✓ Create Prescription (${drugs.length} drug${drugs.length > 1 ? 's' : ''})`}
                    </Btn>
                </div>
            </div>
        </div>
    )
}

/* ─── DRUG REGISTRY TAB ─────────────────────────────────────────────── */
function InventoryTab({ refresh }) {
    const [drugs, setDrugs] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [catFilter, setCat] = useState('')
    const [statusFilter, setStat] = useState('')
    const [showAdd, setShowAdd] = useState(false)
    const [selected, setSelected] = useState(null)
    const [lastAdded, setLastAdded] = useState(null)
    const timer = useRef(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const params = { page_size: 500 }
            if (search) params.search = search
            if (catFilter) params.category = catFilter
            if (statusFilter) params.stock_status = statusFilter
            const { data } = await pharmacyAPI.drugs(params)
            const list = data.results ?? data
            setDrugs(list)
            setLastAdded([...list].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0] ?? null)
        } catch { toast.error('Failed to load drugs') }
        finally { setLoading(false) }
    }, [search, catFilter, statusFilter])

    useEffect(() => {
        clearTimeout(timer.current)
        timer.current = setTimeout(load, 300)
    }, [load])

    return (
        <div>
            {/* Filters bar */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, barcode, supplier…"
                        style={{ ...inp, paddingLeft: '34px' }} />
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: C.t3, fontSize: '15px' }}>🔍</span>
                </div>
                <select value={catFilter} onChange={e => setCat(e.target.value)} style={{ ...inp, width: '160px' }}>
                    <option value="">All categories</option>
                    {['antibiotic', 'antihypertensive', 'antidiabetic', 'analgesic', 'antiplatelet', 'iv_fluid', 'other']
                        .map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStat(e.target.value)} style={{ ...inp, width: '160px' }}>
                    <option value="">All statuses</option>
                    <option value="good">Good</option>
                    <option value="low">Low Stock</option>
                    <option value="critical">Critical</option>
                    <option value="out_of_stock">Out of Stock</option>
                </select>
                <Btn onClick={() => setShowAdd(true)}>+ Add Drug</Btn>
            </div>

            {lastAdded && (
                <div style={{ background: C.bl, border: `1px solid ${C.b}`, borderRadius: '9px',
                    padding: '9px 14px', marginBottom: '12px', fontSize: '12.5px',
                    display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span>🕐</span>
                    <span>Last added: <b>{lastAdded.name}</b>{lastAdded.generic_name ? ` (${lastAdded.generic_name})` : ''} — {new Date(lastAdded.created_at).toLocaleString('en-GB',
                        { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                </div>
            )}
            <div style={{ background: C.s, borderRadius: '14px', border: `1px solid ${C.br}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: `1px solid ${C.br}` }}>
                            {['Drug Name', 'Category', 'Stock', 'Reorder', 'Price', 'Expiry', 'Status'].map(h => (
                                <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading
                            ? <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: C.t3 }}>Loading…</td></tr>
                            : drugs.length === 0
                                ? <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: C.t3 }}>No drugs found</td></tr>
                                : drugs.map(d => {
                                    const days = d.nearest_expiry ? Math.ceil((new Date(d.nearest_expiry) - new Date()) / 86400000) : null
                                    return (
                                        <tr key={d.id} onClick={() => setSelected(d)} style={{ cursor: 'pointer', borderBottom: `1px solid #f9fafb` }}
                                            onMouseEnter={e => e.currentTarget.style.background = C.bg}
                                            onMouseLeave={e => e.currentTarget.style.background = ''}
                                        >
                                            <td style={{ padding: '11px 14px' }}>
                                                <div style={{ fontWeight: 600 }}>{d.name}</div>
                                                <div style={{ fontSize: '11px', color: C.t3 }}>{d.generic_name || '—'} · {d.dosage_form}</div>
                                            </td>
                                            <td style={{ padding: '11px 14px', fontSize: '12.5px' }}>{d.category}</td>
                                            <td style={{ padding: '11px 14px', fontWeight: 700, color: d.current_stock <= d.reorder_level ? C.d : C.t1 }}>{d.current_stock}</td>
                                            <td style={{ padding: '11px 14px', color: C.t2 }}>{d.reorder_level}</td>
                                            <td style={{ padding: '11px 14px' }}>₦{Number(d.unit_price).toLocaleString()}</td>
                                            <td style={{ padding: '11px 14px', fontWeight: 600, color: days === null ? C.t3 : days < 0 ? C.d : days <= 90 ? C.w : C.ok }}>
                                                {d.nearest_expiry || '—'}
                                            </td>
                                            <td style={{ padding: '11px 14px' }}><Badge status={d.stock_status} /></td>
                                        </tr>
                                    )
                                })
                        }
                    </tbody>
                </table>
            </div>

            {showAdd && <AddDrugModal onClose={() => { setShowAdd(false); load(); refresh() }} />}
            {selected && <DrugDetailModal drug={selected} onClose={() => setSelected(null)} onRefresh={load} />}
        </div>
    )
}

/* ─── ADD DRUG MODAL ─────────────────────────────────────────────────── */
/* Stable top-level field wrapper — MUST stay outside any component body.
   Defining this inside a component recreates its function identity every
   render, which makes React remount the <input> underneath on every
   keystroke (that's what was causing the cursor to jump / losing focus
   after each character in the Add Drug form). */
const F = ({ label, children, full }) => (
    <div style={{ gridColumn: full ? '1/-1' : undefined, display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2 }}>{label}</label>
        {children}
    </div>
)

function AddDrugModal({ onClose }) {
    const [form, setForm] = useState({
        name: '', generic_name: '', barcode: '', category: 'other', dosage_form: 'tablet',
        strength: '', unit: 'tablet', reorder_level: 50, unit_price: 0,
        initial_stock: 0, initial_batch: '', initial_expiry: '', initial_supplier: '',
        rx_required: false, interactions: '',
    })
    const [saving, setSaving] = useState(false)
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

    const handleSubmit = async () => {
        if (!form.name.trim()) return toast.error('Drug name is required')
        setSaving(true)
        try {
            await pharmacyAPI.createDrug(form)
            toast.success(`✓ ${form.name} added to registry`)
            onClose()
        } catch (e) {
            const errs = e.response?.data
            const msg = typeof errs === 'object' ? Object.values(errs).flat().join('; ') : 'Failed to add drug'
            toast.error(msg)
        } finally { setSaving(false) }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '560px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}
                onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Add Drug to Registry</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: C.t3, lineHeight: 1 }}>×</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <F label="Drug Name *"><input value={form.name} onChange={e => set('name', e.target.value)} style={inp} /></F>
                    <F label="Generic Name"><input value={form.generic_name} onChange={e => set('generic_name', e.target.value)} style={inp} /></F>
                    <F label="Barcode"><input value={form.barcode} onChange={e => set('barcode', e.target.value)} placeholder="Leave blank to auto-generate" style={inp} /></F>
                    <F label="Strength"><input value={form.strength} onChange={e => set('strength', e.target.value)} placeholder="e.g. 500mg" style={inp} /></F>
                    <F label="Category">
                        <select value={form.category} onChange={e => set('category', e.target.value)} style={inp}>
                            {['antibiotic', 'antihypertensive', 'antidiabetic', 'analgesic', 'antiplatelet', 'iv_fluid', 'other'].map(c => <option key={c}>{c}</option>)}
                        </select>
                    </F>
                    <F label="Dosage Form">
                        <select value={form.dosage_form} onChange={e => set('dosage_form', e.target.value)} style={inp}>
                            {['tablet', 'capsule', 'syrup', 'injection', 'cream', 'drops', 'inhaler', 'bag', 'vial', 'other'].map(u => <option key={u}>{u}</option>)}
                        </select>
                    </F>
                    <F label="Initial Stock"><input type="number" min={0} value={form.initial_stock} onChange={e => set('initial_stock', Number(e.target.value))} style={inp} /></F>
                    <F label="Reorder Level"><input type="number" min={0} value={form.reorder_level} onChange={e => set('reorder_level', Number(e.target.value))} style={inp} /></F>
                    <F label="Unit Price (₦)"><input type="number" min={0} step="0.01" value={form.unit_price} onChange={e => set('unit_price', Number(e.target.value))} style={inp} /></F>
                    <F label="Supplier"><input value={form.initial_supplier} onChange={e => set('initial_supplier', e.target.value)} style={inp} /></F>
                    <F label="Batch Number"><input value={form.initial_batch} onChange={e => set('initial_batch', e.target.value)} style={inp} /></F>
                    <F label="Expiry Date"><input type="date" value={form.initial_expiry} onChange={e => set('initial_expiry', e.target.value)} style={inp} /></F>
                    <F label="Interactions / Warnings" full>
                        <textarea value={form.interactions} onChange={e => set('interactions', e.target.value)} rows={2} placeholder="Known drug interactions…" style={{ ...inp, resize: 'vertical' }} />
                    </F>
                    <F label="" full>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                            <input type="checkbox" checked={form.rx_required} onChange={e => set('rx_required', e.target.checked)} />
                            Prescription required (Rx)
                        </label>
                    </F>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '22px' }}>
                    <Btn onClick={onClose} variant="outline">Cancel</Btn>
                    <Btn onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Add Drug'}</Btn>
                </div>
            </div>
        </div>
    )
}

/* ─── DRUG DETAIL MODAL ─────────────────────────────────────────────── */
function DrugDetailModal({ drug, onClose, onRefresh }) {
    const days = drug.nearest_expiry ? Math.ceil((new Date(drug.nearest_expiry) - new Date()) / 86400000) : null
    const Row = ({ label, value, color }) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${C.br}`, fontSize: '13px' }}>
            <span style={{ color: C.t2 }}>{label}</span>
            <strong style={{ color: color || C.t1 }}>{value ?? '—'}</strong>
        </div>
    )
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '480px', maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>{drug.name}</h2>
                        <Badge status={drug.stock_status} />
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: C.t3 }}>×</button>
                </div>
                <div style={{ background: C.bg, borderRadius: '10px', padding: '8px 14px', marginBottom: '14px' }}>
                    <Row label="Generic" value={drug.generic_name} />
                    <Row label="Category" value={drug.category} />
                    <Row label="Form" value={`${drug.dosage_form} ${drug.strength}`} />
                    <Row label="Current Stock" value={`${drug.current_stock} units`} color={drug.current_stock <= drug.reorder_level ? C.d : C.ok} />
                    <Row label="Reorder Level" value={drug.reorder_level} />
                    <Row label="Unit Price" value={`₦${Number(drug.unit_price).toLocaleString()}`} />
                    <Row label="Nearest expiry (FEFO)" value={drug.nearest_expiry || '—'} color={days === null ? undefined : days < 0 ? C.d : days <= 90 ? C.w : C.ok} />
                    <Row label="Supplier" value={drug.supplier} />
                    <Row label="Prescription" value={drug.rx_required ? 'Required' : 'OTC'} color={drug.rx_required ? C.p : C.ok} />
                </div>

                {drug.batches && drug.batches.length > 0 && (
                    <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: C.t2, marginBottom: '6px' }}>
                            Batches on hand — dispensed earliest expiry first (FEFO)
                        </div>
                        <div style={{ border: `1px solid ${C.br}`, borderRadius: '10px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                                <thead><tr style={{ background: C.bg }}>
                                    {['', 'Batch #', 'Qty', 'Expiry'].map(h => (
                                        <th key={h} style={{ textAlign: 'left', padding: '7px 10px', fontSize: '10.5px', color: C.t3, textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                </tr></thead>
                                <tbody>
                                    {drug.batches
                                        .filter(b => b.quantity > 0)
                                        .sort((a, b) => (a.expiry_date > b.expiry_date ? 1 : -1))
                                        .map((b, i) => {
                                            const bd = b.expiry_date ? Math.ceil((new Date(b.expiry_date) - new Date()) / 86400000) : null
                                            const bcolor = b.is_expired ? C.d : (bd !== null && bd <= 90) ? C.w : C.t1
                                            return (
                                                <tr key={b.id} style={{ borderTop: `1px solid ${C.br}` }}>
                                                    <td style={{ padding: '7px 10px' }}>
                                                        {i === 0 && !b.is_expired && (
                                                            <span title="Dispensed next (FEFO)" style={{ fontSize: '10px', fontWeight: 700, color: C.b, background: C.bl, borderRadius: '6px', padding: '2px 6px' }}>NEXT ↓</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '7px 10px', fontWeight: 600 }}>{b.batch_number || 'N/A'}</td>
                                                    <td style={{ padding: '7px 10px' }}>{b.quantity}</td>
                                                    <td style={{ padding: '7px 10px', color: bcolor, fontWeight: b.is_expired ? 700 : 400 }}>
                                                        {b.expiry_date || '—'}{b.is_expired ? ' (expired)' : ''}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                {drug.interactions && (
                    <div style={{ padding: '10px 14px', background: C.wB, border: `1px solid #fde68a`, borderRadius: '8px', fontSize: '12.5px', color: '#854d0e', marginBottom: '14px' }}>
                        <strong>⚠ Interactions:</strong> {drug.interactions}
                    </div>
                )}
                <Btn onClick={onClose} variant="outline" style={{ width: '100%', justifyContent: 'center' }}>Close</Btn>
            </div>
        </div>
    )
}

/* ─── DASHBOARD TAB ─────────────────────────────────────────────────── */
function DashboardTab({ refresh }) {
    const [drugs, setDrugs] = useState([])
    const [stats, setStats] = useState({ total: 0, low: 0, exp: 0, rx: 0, dispensed: 0 })
    const [alerts, setAlerts] = useState([])
    const [recent, setRecent] = useState([])
    const [rxPending, setRxPending] = useState([])

    useEffect(() => {
        const load = async () => {
            try {
                const today = new Date().toISOString().split('T')[0]
                const [dRes, rxRes, histRes, todayDispRes] = await Promise.all([
                    pharmacyAPI.drugs({ page_size: 500 }),
                    pharmacyAPI.prescriptions({ status: 'pending', page_size: 5 }),
                    pharmacyAPI.stockHistory({ movement_type: 'dispense', page_size: 5 }),
                    pharmacyAPI.stockHistory({ movement_type: 'dispense', date_from: today, date_to: today, page_size: 1 }),
                ])
                const drugList = dRes.data.results ?? dRes.data
                setDrugs(drugList)
                setRxPending(rxRes.data.results ?? rxRes.data)
                setRecent(histRes.data.results ?? histRes.data)

                const low = drugList.filter(d => ['low', 'critical', 'out_of_stock'].includes(d.stock_status)).length
                const exp = drugList.filter(d => d.nearest_expiry && Math.ceil((new Date(d.nearest_expiry) - new Date()) / 86400000) <= 90).length
                const dispensedToday = todayDispRes.data.count ?? (todayDispRes.data.results ?? todayDispRes.data).length
                setStats({ total: drugList.length, low, exp, rx: (rxRes.data.results ?? rxRes.data).length, dispensed: dispensedToday })
                const al = []
                drugList.filter(d => d.stock_status === 'out_of_stock').forEach(d => al.push({ t: 'd', m: `⛔ OUT OF STOCK: ${d.name}` }))
                drugList.filter(d => d.stock_status === 'critical').forEach(d => al.push({ t: 'd', m: `⛔ Critical stock: ${d.name} — only ${d.current_stock} units` }))
                drugList.filter(d => d.stock_status === 'low').forEach(d => al.push({ t: 'w', m: `⚠ Low stock: ${d.name} — ${d.current_stock} units` }))
                drugList.filter(d => { const dy = d.nearest_expiry && Math.ceil((new Date(d.nearest_expiry) - new Date()) / 86400000); return dy !== null && dy < 0 }).forEach(d => al.push({ t: 'd', m: `⛔ EXPIRED: ${d.name}` }))
                drugList.filter(d => { const dy = d.nearest_expiry && Math.ceil((new Date(d.nearest_expiry) - new Date()) / 86400000); return dy !== null && dy >= 0 && dy <= 30 }).forEach(d => al.push({ t: 'w', m: `⚠ Expiring: ${d.name}` }))
                setAlerts(al.slice(0, 5))
            } catch { }
        }
        load()
    }, [])

    const statCards = [
        { label: 'Total Drugs', value: stats.total, sub: 'in registry', bg: '#e6f5f1', color: C.b },
        { label: 'Low / Critical', value: stats.low, sub: 'below reorder', bg: C.dB, color: C.d },
        { label: 'Expiring ≤90d', value: stats.exp, sub: 'check expiry', bg: C.wB, color: C.w },
        { label: 'Pending Rx', value: stats.rx, sub: 'awaiting dispense', bg: C.iB, color: C.i },
        { label: 'Dispensed Today', value: stats.dispensed, sub: 'transactions', bg: C.okB, color: C.ok },
    ]

    return (
        <div>
            {alerts.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    {alerts.map((a, i) => (
                        <div key={i} style={{
                            padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                            marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px',
                            background: a.t === 'd' ? C.dB : C.wB, color: a.t === 'd' ? C.d : C.w,
                            border: `1px solid ${a.t === 'd' ? '#fecaca' : '#fde68a'}`,
                        }}>{a.m}</div>
                    ))}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '12px', marginBottom: '20px' }}>
                {statCards.map(s => (
                    <div key={s.label} style={{ background: C.s, borderRadius: '10px', border: `1px solid ${C.br}`, padding: '14px 16px' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: s.bg, marginBottom: '8px' }} />
                        <div style={{ fontSize: '11.5px', color: C.t2, fontWeight: 500 }}>{s.label}</div>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                        <div style={{ fontSize: '11px', color: C.t3, marginTop: '4px' }}>{s.sub}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={card}>
                    <h3 style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>Recent Dispensing</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>{['Drug', 'Patient', 'Qty', 'Time'].map(h => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: '11px', color: C.t2, textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                        <tbody>
                            {recent.length === 0
                                ? <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: C.t3 }}>No dispensing yet</td></tr>
                                : recent.map(tx => (
                                    <tr key={tx.id}>
                                        <td style={{ padding: '8px', fontWeight: 600, fontSize: '13px' }}>{tx.drug_name}</td>
                                        <td style={{ padding: '8px', fontSize: '13px' }}>{tx.patient_name || '—'}</td>
                                        <td style={{ padding: '8px', fontSize: '13px' }}>{Math.abs(tx.quantity)}</td>
                                        <td style={{ padding: '8px', fontSize: '12px', color: C.t3 }}>{new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                </div>

                <div style={card}>
                    <h3 style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>Pending Prescriptions</h3>
                    {rxPending.length === 0
                        ? <div style={{ padding: '24px', textAlign: 'center', color: C.t3, fontSize: '13px' }}>No pending prescriptions</div>
                        : rxPending.map(rx => (
                            <div key={rx.id} style={{ padding: '10px 0', borderBottom: `1px solid ${C.br}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <strong style={{ fontSize: '13px' }}>{rx.patient_name}</strong>
                                    <span style={{ color: C.i, fontSize: '12px' }}>{rx.prescription_id}</span>
                                </div>
                                <div style={{ fontSize: '11.5px', color: C.t2 }}>Dr. {rx.doctor_name}</div>
                                <div style={{ fontSize: '11px', color: C.t3, marginTop: '3px' }}>
                                    {rx.items?.map(i => i.drug_name).join(', ')}
                                </div>
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>
    )
}

/* ─── EXPIRY TRACKER ─────────────────────────────────────────────────── */
function ExpiryTab() {
    const [drugs, setDrugs] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        pharmacyAPI.drugs({ page_size: 500 }).then(r => {
            const list = (r.data.results ?? r.data).sort((a, b) => (a.nearest_expiry || '9999') > (b.nearest_expiry || '9999') ? 1 : -1)
            setDrugs(list)
        }).finally(() => setLoading(false))
    }, [])

    const today = new Date()
    const expired = drugs.filter(d => d.nearest_expiry && new Date(d.nearest_expiry) < today).length
    const critical = drugs.filter(d => d.nearest_expiry && Math.ceil((new Date(d.nearest_expiry) - today) / 86400000) <= 30 && new Date(d.nearest_expiry) >= today).length
    const good = drugs.filter(d => !d.nearest_expiry || Math.ceil((new Date(d.nearest_expiry) - today) / 86400000) > 90).length

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' }}>
                {[{ label: 'Expired', color: C.d, bg: C.dB, val: expired }, { label: 'Critical (≤30d)', color: C.w, bg: C.wB, val: critical }, { label: 'Good', color: C.ok, bg: C.okB, val: good }].map(s => (
                    <div key={s.label} style={{ background: C.s, borderRadius: '10px', border: `1px solid ${C.br}`, padding: '14px 16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 800, color: s.color }}>{s.val}</div>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: s.color }}>{s.label}</span>
                    </div>
                ))}
            </div>

            
            <div style={{ background: C.s, borderRadius: '14px', border: `1px solid ${C.br}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ borderBottom: `1px solid ${C.br}` }}>
                        {['Drug', 'Batch', 'Stock', 'Expiry Date', 'Days Left', 'Status'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: C.t2, textTransform: 'uppercase' }}>{h}</th>
                        ))}
                    </tr></thead>
                    <tbody>
                        {loading
                            ? <tr><td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: C.t3 }}>Loading…</td></tr>
                            : drugs.map(d => {
                                const days = d.nearest_expiry ? Math.ceil((new Date(d.nearest_expiry) - today) / 86400000) : null
                                const color = days === null ? C.t3 : days < 0 ? C.d : days <= 30 ? C.d : days <= 90 ? C.w : C.ok
                                const rowBg = days !== null && days < 0 ? '#fff5f5' : days !== null && days <= 30 ? '#fffbeb' : 'transparent'
                                return (
                                    <tr key={d.id} style={{ borderBottom: `1px solid #f3f4f6`, background: rowBg }}>
                                        <td style={{ padding: '11px 14px', fontWeight: 600 }}>{d.name}</td>
                                        <td style={{ padding: '11px 14px', color: C.t3, fontSize: '12.5px' }}>{d.batch_number || '—'}</td>
                                        <td style={{ padding: '11px 14px', fontWeight: 700 }}>{d.current_stock}</td>
                                        <td style={{ padding: '11px 14px', fontWeight: 600, color }}>{d.nearest_expiry || '—'}</td>
                                        <td style={{ padding: '11px 14px', fontWeight: 700, color }}>
                                            {days === null ? 'N/A' : days < 0 ? 'EXPIRED' : `${days}d`}
                                        </td>
                                        <td style={{ padding: '11px 14px' }}>
                                            <Badge status={days === null ? 'good' : days < 0 ? 'out_of_stock' : days <= 30 ? 'critical' : days <= 90 ? 'low' : 'good'} />
                                        </td>
                                    </tr>
                                )
                            })
                        }
                    </tbody>
                </table>
            </div>
        </div>
    )
}

/* ─── STOCK HISTORY ──────────────────────────────────────────────────── */
function StockHistoryTab() {
    const [data, setData] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState({ drug_name: '', movement_type: '', date_from: '', date_to: '' })

    const load = async () => {
        setLoading(true)
        try {
            const params = { page_size: 100 }
            if (filter.drug_name) params.drug_name = filter.drug_name
            if (filter.movement_type) params.movement_type = filter.movement_type
            if (filter.date_from) params.date_from = filter.date_from
            if (filter.date_to) params.date_to = filter.date_to
            const { data: d } = await pharmacyAPI.stockHistory(params)
            setData(d.results ?? d)
        } catch { toast.error('Failed to load history') }
        finally { setLoading(false) }
    }
    useEffect(() => { load() }, [])

    const typeIcon = {
        dispense: { label: '↑ OUT', bg: C.dB, color: C.d },
        restock: { label: '↓ IN', bg: C.okB, color: C.ok },
        adjust: { label: '~ ADJ', bg: C.wB, color: C.w },
        return: { label: '↑ RTN', bg: '#f3f4f6', color: C.t2 },
        expired: { label: '⚠ EXP', bg: C.dB, color: C.d },
        damaged: { label: '⚠ DMG', bg: C.dB, color: C.d },
    }

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px 160px 100px', gap: '10px', marginBottom: '16px', alignItems: 'end' }}>
                <input placeholder="Drug name…" value={filter.drug_name} onChange={e => setFilter(f => ({ ...f, drug_name: e.target.value }))} style={inp} />
                <select value={filter.movement_type} onChange={e => setFilter(f => ({ ...f, movement_type: e.target.value }))} style={inp}>
                    <option value="">All types</option>
                    {['dispense', 'restock', 'adjust', 'return', 'expired', 'damaged'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="date" value={filter.date_from} onChange={e => setFilter(f => ({ ...f, date_from: e.target.value }))} style={inp} />
                <input type="date" value={filter.date_to} onChange={e => setFilter(f => ({ ...f, date_to: e.target.value }))} style={inp} />
                <Btn onClick={load} style={{ height: '40px', justifyContent: 'center' }}>Filter</Btn>
            </div>
            
            <div style={{ background: C.s, borderRadius: '14px', border: `1px solid ${C.br}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ borderBottom: `1px solid ${C.br}` }}>
                        {['Date / Time', 'Drug', 'Type', 'Qty', 'Patient / Ref', 'Balance', 'By'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: C.t2, textTransform: 'uppercase' }}>{h}</th>
                        ))}
                    </tr></thead>
                    <tbody>
                        {loading
                            ? <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: C.t3 }}>Loading…</td></tr>
                            : data.length === 0
                                ? <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: C.t3 }}>No records</td></tr>
                                : data.map(tx => {
                                    const icon = typeIcon[tx.movement_type] || { label: tx.movement_type, bg: C.bg, color: C.t2 }
                                    return (
                                        <tr key={tx.id} style={{ borderBottom: `1px solid #f3f4f6` }}>
                                            <td style={{ padding: '10px 14px', fontSize: '12px', color: C.t3 }}>{new Date(tx.created_at).toLocaleString()}</td>
                                            <td style={{ padding: '10px 14px', fontWeight: 600 }}>{tx.drug_name}</td>
                                            <td style={{ padding: '10px 14px' }}>
                                                <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: icon.bg, color: icon.color }}>{icon.label}</span>
                                            </td>
                                            <td style={{ padding: '10px 14px', fontWeight: 700, color: tx.movement_type === 'restock' ? C.ok : C.d }}>
                                                {tx.movement_type === 'restock' || tx.movement_type === 'adjust' ? '+' : '-'}{Math.abs(tx.quantity)}
                                            </td>
                                            <td style={{ padding: '10px 14px', fontSize: '12.5px' }}>{tx.patient_name || tx.reference || '—'}</td>
                                            <td style={{ padding: '10px 14px', fontWeight: 600 }}>{tx.balance_after}</td>
                                            <td style={{ padding: '10px 14px', color: C.t2 }}>{tx.performed_by_name || '—'}</td>
                                        </tr>
                                    )
                                })
                        }
                    </tbody>
                </table>
            </div>
        </div>
    )
}

/* ─── PATIENT USAGE TAB ─────────────────────────────────────────────── */
function PatientUsageTab() {
    const [query, setQuery] = useState('')
    const [patient, setPatient] = useState(null)
    const [data, setData] = useState([])
    const [loading, setLoading] = useState(false)

    const search = async pt => {
        setPatient(pt)
        setLoading(true)
        try {
            const { data: d } = await pharmacyAPI.patientUsage({ patient_name: pt.name })
            setData(d.results ?? d)
        } catch { toast.error('Failed to load patient usage') }
        finally { setLoading(false) }
    }

    const uniqueDrugs = [...new Set(data.map(tx => tx.drug_name))]
    const totalSpend = data.reduce((s, tx) => s + (tx.unit_price_at_time || 0) * Math.abs(tx.quantity), 0)

    return (
        <div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', maxWidth: '480px' }}>
                <PatientSearchInput value={query} onChange={pt => { setQuery(pt?.name || ''); if (pt?.id) search(pt) }} placeholder="Click to select a patient…" />
            </div>

            {patient && (
                <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px' }}>
                    <div style={card}>
                        <h3 style={{ fontWeight: 700, fontSize: '14px', marginBottom: '14px' }}>{patient.name}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.t2 }}>Patient ID</span><strong>{patient.pid || '—'}</strong></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.t2 }}>Transactions</span><strong>{data.length}</strong></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.t2 }}>Unique Drugs</span><strong>{uniqueDrugs.length}</strong></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: C.t2 }}>Total Spend</span><strong style={{ color: C.b }}>₦{totalSpend.toLocaleString()}</strong></div>
                        </div>
                        <div style={{ marginTop: '12px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {uniqueDrugs.map(d => (
                                <span key={d} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: C.bl, color: C.bd, fontWeight: 600 }}>{d}</span>
                            ))}
                        </div>
                    </div>

                    <div style={{ background: C.s, borderRadius: '14px', border: `1px solid ${C.br}`, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr style={{ borderBottom: `1px solid ${C.br}` }}>
                                {['Drug', 'Qty', 'Date', 'Pharmacist'].map(h => (
                                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: C.t2, textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr></thead>
                            <tbody>
                                {loading
                                    ? <tr><td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: C.t3 }}>Loading…</td></tr>
                                    : data.length === 0
                                        ? <tr><td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: C.t3 }}>No dispensing records for this patient</td></tr>
                                        : data.map(tx => (
                                            <tr key={tx.id} style={{ borderBottom: `1px solid #f3f4f6` }}>
                                                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{tx.drug_name}</td>
                                                <td style={{ padding: '10px 14px' }}>{Math.abs(tx.quantity)}</td>
                                                <td style={{ padding: '10px 14px', color: C.t3 }}>{new Date(tx.created_at).toLocaleDateString()}</td>
                                                <td style={{ padding: '10px 14px', color: C.t2 }}>{tx.performed_by_name || '—'}</td>
                                            </tr>
                                        ))
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}

/* ─── STOCK UPDATE TAB ───────────────────────────────────────────────── */
function StockUpdateTab({ refresh }) {
    const [drug, setDrug] = useState(null)
    const [action, setAction] = useState('restock')
    const [qty, setQty] = useState(0)
    const [batch, setBatch] = useState('')
    const [expiry, setExpiry] = useState('')
    const [ref, setRef] = useState('')
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)

    const handleUpdate = async () => {
        if (!drug) return toast.error('Select a drug')
        if (qty <= 0) return toast.error('Quantity must be > 0')
        if (action === 'restock' && !expiry) return toast.error('Expiry date is required when restocking — FEFO dispensing depends on it')
        setSaving(true)
        try {
            // receive_stock is the single unified endpoint for every movement
            // type (restock/adjust/return/expired/damaged) — updateStock was
            // never a real endpoint, which is why every Update Stock action
            // failed regardless of which action was selected.
            await pharmacyAPI.receiveStock({
                drug: drug.id, movement_type: action, quantity: qty,
                batch_number: batch, expiry_date: expiry || null,
                supplier: ref, reference: ref, notes,
            })
            toast.success(`✓ ${drug.name} stock updated — new balance: ${action === 'restock' ? drug.current_stock + qty :
                    action === 'adjust' ? qty :
                        Math.max(0, drug.current_stock - qty)
                }`)
            setDrug(null); setQty(0); setBatch(''); setExpiry(''); setRef(''); setNotes('')
            refresh()
        } catch (e) {
            toast.error(e.response?.data?.detail || 'Update failed')
        } finally { setSaving(false) }
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={card}>
                <h3 style={{ fontWeight: 700, fontSize: '15px', marginBottom: '18px' }}>Update Stock</h3>

                <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2, display: 'block', marginBottom: '5px' }}>Drug *</label>
                <DrugSearchInput value={drug} onChange={setDrug} placeholder="Search drug to update…" style={{ marginBottom: '12px' }} />

                {drug && (
                    <div style={{ padding: '10px 14px', background: C.bl, borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
                        Current stock: <strong>{drug.current_stock}</strong> · Reorder: {drug.reorder_level} · <Badge status={drug.stock_status} />
                    </div>
                )}

                <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2, display: 'block', marginBottom: '5px' }}>Action *</label>
                <select value={action} onChange={e => setAction(e.target.value)} style={{ ...inp, marginBottom: '12px' }}>
                    <option value="restock">Restock (add to stock)</option>
                    <option value="adjust">Manual Adjustment (set absolute)</option>
                    <option value="return">Return from patient</option>
                    <option value="expired">Write-off: Expired</option>
                    <option value="damaged">Write-off: Damaged</option>
                </select>

                <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2, display: 'block', marginBottom: '5px' }}>Quantity *</label>
                <input type="number" min={1} value={qty} onChange={e => setQty(Number(e.target.value))} style={{ ...inp, marginBottom: '12px' }} />

                {drug && qty > 0 && (
                    <div style={{ padding: '8px 12px', background: C.bg, borderRadius: '8px', fontSize: '13px', marginBottom: '14px', color: C.t2 }}>
                        New balance: <strong style={{ color: C.t1 }}>
                            {action === 'restock' ? drug.current_stock + qty :
                                action === 'adjust' ? qty :
                                    Math.max(0, drug.current_stock - qty)}
                        </strong>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2, display: 'block', marginBottom: '5px' }}>Batch #</label>
                        <input value={batch} onChange={e => setBatch(e.target.value)} style={inp} />
                    </div>
                    <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2, display: 'block', marginBottom: '5px' }}>New Expiry</label>
                        <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} style={inp} />
                    </div>
                </div>

                <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2, display: 'block', marginBottom: '5px' }}>Reference (PO / GRN)</label>
                <input value={ref} onChange={e => setRef(e.target.value)} placeholder="PO-2026-001" style={{ ...inp, marginBottom: '12px' }} />

                <label style={{ fontSize: '11.5px', fontWeight: 700, color: C.t2, display: 'block', marginBottom: '5px' }}>Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical', marginBottom: '16px' }} />

                <Btn onClick={handleUpdate} disabled={saving || !drug || qty <= 0} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
                    {saving ? 'Saving…' : 'Update Stock'}
                </Btn>
            </div>

            <div style={card}>
                <h3 style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>Action Guide</h3>
                {[
                    ['Restock', C.ok, 'Received new delivery — adds to current stock'],
                    ['Manual Adjustment', C.w, 'Override to exact count after physical stock-take'],
                    ['Return', C.i, 'Patient returned unused medication'],
                    ['Expired Write-off', C.d, 'Remove expired stock from record'],
                    ['Damaged Write-off', C.d, 'Remove damaged/spoiled units'],
                ].map(([t, c, d]) => (
                    <div key={t} style={{ padding: '10px 0', borderBottom: `1px solid ${C.br}`, display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: c, marginTop: '5px', flexShrink: 0 }} />
                        <div><div style={{ fontWeight: 600, fontSize: '13px' }}>{t}</div><div style={{ fontSize: '12px', color: C.t2 }}>{d}</div></div>
                    </div>
                ))}
            </div>
        </div>
    )
}

/* ─── ROOT PAGE ──────────────────────────────────────────────────────── */
export default function PharmacyPage() {
    const [tab, setTab] = useState('dashboard')
    const { user: currentUser } = useAuthStore()     // { id, username, full_name, email, … }
    const [refreshKey, setRefreshKey] = useState(0)
    const refresh = () => setRefreshKey(k => k + 1)

    const TABS = [
        ['dashboard', 'Dashboard'],
        ['dispense', 'Dispense'],
        ['prescriptions', 'Prescriptions'],
        ['inventory', 'Drug Registry'],
        ['stock', 'Stock Update'],
        ['expiry', 'Expiry Tracker'],
        ['history', 'Stock History'],
        ['usage', 'Patient Usage'],
    ]

    return (
        <AppLayout
            title="Pharmacy"
            action={
                tab === 'inventory' ? undefined : (
                    tab === 'dispense' ? <Btn onClick={() => setTab('prescriptions')}>View Rx Queue</Btn> : undefined
                )
            }
        >
            {/* Tab bar */}
            <div style={{ display: 'flex', gap: '3px', marginBottom: '20px', flexWrap: 'wrap', borderBottom: `1px solid ${C.br}`, paddingBottom: '10px' }}>
                {TABS.map(([id, label]) => (
                    <button key={id} onClick={() => setTab(id)} style={{
                        padding: '7px 14px', borderRadius: '6px', border: 'none',
                        background: tab === id ? C.sa : 'transparent',
                        color: tab === id ? '#fff' : C.t2,
                        fontSize: '13px', fontWeight: tab === id ? 600 : 400,
                        cursor: 'pointer', fontFamily: 'inherit', lineHeight: '1.3',
                        transition: 'all .15s',
                    }}>{label}</button>
                ))}
            </div>

            {/* Tab content — key forces remount on refresh */}
            <div key={refreshKey}>
                {tab === 'dashboard' && <DashboardTab refresh={refresh} />}
                {tab === 'dispense' && <DispenseTab refresh={refresh} currentUser={currentUser} />}
                {tab === 'prescriptions' && <PrescriptionsTab refresh={refresh} currentUser={currentUser} />}
                {tab === 'inventory' && <InventoryTab refresh={refresh} />}
                {tab === 'stock' && <StockUpdateTab refresh={refresh} />}
                {tab === 'expiry' && <ExpiryTab />}
                {tab === 'history' && <StockHistoryTab />}
                {tab === 'usage' && <PatientUsageTab />}
            </div>
        </AppLayout>
    )
}