import { useState, useEffect, useCallback, useMemo } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import api from '../../api/axios'
import toast from 'react-hot-toast'

const C = {
    b: '#1a6b5a', bl: '#e6f5f1', bd: '#0f4a3d', bg: '#f0f4f3', s: '#fff',
    t1: '#111827', t2: '#6b7280', t3: '#9ca3af', br: '#e5e7eb', br2: '#d1d5db',
    ok: '#16a34a', okB: '#f0fdf4', w: '#d97706', wB: '#fffbeb', d: '#dc2626', dB: '#fef2f2', i: '#2563eb', iB: '#eff6ff', p: '#7c3aed', pB: '#f5f3ff',
}
const card = (x = {}) => ({ background: C.s, borderRadius: '14px', border: `1px solid ${C.br}`, padding: '18px', ...x })
const inp = { width: '100%', padding: '9px 12px', borderRadius: '9px', border: `1px solid ${C.br2}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })
const unwrap = (x) => Array.isArray(x) ? x : (x?.results || [])
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function Btn({ children, variant = 'primary', size = 'md', disabled, onClick }) {
    const base = { borderRadius: '9px', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, border: '1px solid transparent', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap', padding: size === 'sm' ? '6px 12px' : '10px 16px', fontSize: size === 'sm' ? '12.5px' : '13.5px' }
    const v = { primary: { background: C.b, color: '#fff' }, success: { background: C.ok, color: '#fff' }, outline: { background: '#fff', color: C.t1, border: `1px solid ${C.br2}` } }[variant]
    return <button onClick={onClick} disabled={disabled} style={{ ...base, ...v }}>{children}</button>
}
const Tag = ({ children, color = C.t2, bg = '#f3f4f6' }) => <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, color, background: bg }}>{children}</span>

const STATUS = { draft: { l: 'Draft', c: C.t2, b: '#f3f4f6' }, pending: { l: 'Pending', c: C.w, b: C.wB }, partial: { l: 'Partial', c: C.i, b: C.iB }, paid: { l: 'Paid', c: C.ok, b: C.okB }, cancelled: { l: 'Cancelled', c: C.t2, b: '#f3f4f6' } }
const DEPT = { consultation: 'Consultation', lab: 'Laboratory', radiology: 'Radiology', pharmacy: 'Pharmacy', procedure: 'Procedures', room: 'Room/Bed', other: 'Other' }
const DEPT_COLOR = { consultation: C.i, lab: C.p, radiology: '#0ea5e9', pharmacy: C.ok, procedure: C.w, room: C.b, other: C.t2 }

/* ═══ PATIENT BILLING — consolidated statement ═════════════════════ */
function PatientBillingPane({ invoices, allPatients, onPay }) {
    const [q, setQ] = useState('')
    const [selId, setSelId] = useState('')
    const [openList, setOpenList] = useState(false)
    const byPatient = useMemo(() => {
        const m = {}
        invoices.forEach(inv => { const pid = inv.patient; if (!m[pid]) m[pid] = []; m[pid].push(inv) })
        return m
    }, [invoices])
    const options = useMemo(() => allPatients.map(pt => ({
        id: pt.id,
        name: (pt.full_name || `${pt.first_name || ''} ${pt.last_name || ''}`).trim(),
        pid: pt.pid || pt.patient_id || '',
        count: (byPatient[pt.id] || []).length,
    })), [allPatients, byPatient])

    const match = selId ? options.find(o => o.id === selId) : null
    const list = selId ? (byPatient[selId] || []) : []
    const allItems = list.flatMap(inv => (inv.items || []).map(it => ({ ...it, invoice_number: inv.invoice_number })))
    const byDept = {}
    allItems.forEach(it => { byDept[it.category] = (byDept[it.category] || 0) + Number(it.total_price || 0) })
    const billed = list.reduce((s, inv) => s + Number(inv.total_amount || 0), 0)
    const paid = list.reduce((s, inv) => s + Number(inv.amount_paid || 0), 0)
    const open = list.filter(inv => !['paid', 'cancelled'].includes(inv.status))

    return (
        <>
            <div style={card({ marginBottom: '16px' })}>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Patient Bill — Consolidated Statement</div>
                <div style={{ position: 'relative' }}>
                    <input style={inp} value={q}
                        onChange={e => { setQ(e.target.value); setSelId(''); setOpenList(true) }}
                        onFocus={() => setOpenList(true)}
                        onBlur={() => setTimeout(() => setOpenList(false), 150)}
                        placeholder="Type or select a patient…" />
                    {openList && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: '#fff', border: `1px solid ${C.br2}`, borderRadius: '10px', boxShadow: '0 10px 30px rgba(0,0,0,.12)', maxHeight: '260px', overflowY: 'auto' }}>
                            {options
                                .filter(o => !q.trim() || `${o.name} ${o.pid}`.toLowerCase().includes(q.toLowerCase()))
                                .slice(0, 40)
                                .map(o => (
                                    <div key={o.id} onMouseDown={() => { setSelId(o.id); setQ(o.name); setOpenList(false) }}
                                        style={{ padding: '9px 12px', fontSize: '13px', cursor: 'pointer', borderBottom: `1px solid ${C.br}`, display: 'flex', justifyContent: 'space-between' }}>
                                        <span><b>{o.name}</b> <span style={{ color: C.t3, fontSize: '11px' }}>{o.pid}</span></span>
                                        <span style={{ color: o.count ? C.b : C.t3, fontSize: '11.5px', fontWeight: 600 }}>{o.count ? `${o.count} invoice(s)` : 'no bills'}</span>
                                    </div>
                                ))}
                            {options.length === 0 && <div style={{ padding: '12px', color: C.t3, fontSize: '12.5px' }}>No patients found.</div>}
                        </div>
                    )}
                </div>
            </div>
            {!match ? (
                <div style={card({ textAlign: 'center', padding: '30px', color: C.t3, fontSize: '13px' })}>Enter a patient name above to see every department's charges compounded into one bill.</div>
            ) : (
                <div style={card()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <div style={{ fontSize: '16px', fontWeight: 800 }}>{match?.name}</div>
                            <div style={{ fontSize: '12px', color: C.t2 }}>{list.length} invoice(s)</div>
                        </div>
                        <div style={{ display: 'flex', gap: '18px', textAlign: 'right' }}>
                            <div><div style={{ fontSize: '11px', color: C.t3 }}>Billed</div><div style={{ fontWeight: 800 }}>{naira(billed)}</div></div>
                            <div><div style={{ fontSize: '11px', color: C.t3 }}>Paid</div><div style={{ fontWeight: 800, color: C.ok }}>{naira(paid)}</div></div>
                            <div><div style={{ fontSize: '11px', color: C.t3 }}>Outstanding</div><div style={{ fontWeight: 800, color: billed - paid > 0 ? C.d : C.ok }}>{naira(billed - paid)}</div></div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                        {Object.entries(byDept).map(([cat, amt]) => (
                            <span key={cat} style={{ fontSize: '11.5px', fontWeight: 700, color: DEPT_COLOR[cat] || C.t2, background: C.bg, borderRadius: '8px', padding: '5px 10px' }}>{DEPT[cat] || cat}: {naira(amt)}</span>
                        ))}
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', marginBottom: '16px' }}>
                        <thead><tr style={{ textAlign: 'left', color: C.t2, fontSize: '10.5px', textTransform: 'uppercase' }}>
                            {['Description', 'Department', 'Qty', 'Amount', 'Invoice'].map(h => <th key={h} style={{ padding: '7px 8px', borderBottom: `1px solid ${C.br}` }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {allItems.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: C.t3 }}>No charges.</td></tr> :
                                allItems.map(it => (
                                    <tr key={it.id}>
                                        <td style={{ padding: '7px 8px', borderBottom: `1px solid ${C.br}` }}>{it.description}</td>
                                        <td style={{ padding: '7px 8px', borderBottom: `1px solid ${C.br}` }}><Tag color={DEPT_COLOR[it.category] || C.t2} bg={C.bg}>{DEPT[it.category] || it.category}</Tag></td>
                                        <td style={{ padding: '7px 8px', borderBottom: `1px solid ${C.br}` }}>{it.quantity}</td>
                                        <td style={{ padding: '7px 8px', borderBottom: `1px solid ${C.br}`, fontWeight: 600 }}>{naira(it.total_price)}</td>
                                        <td style={{ padding: '7px 8px', borderBottom: `1px solid ${C.br}`, color: C.t3 }}>{it.invoice_number}</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>

                    {open.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {open.map(inv => (
                                <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '10px', background: C.bg }}>
                                    <div style={{ fontSize: '13px' }}><b>{inv.invoice_number}</b> · balance <b style={{ color: C.d }}>{naira(inv.balance_due)}</b> <Tag color={(STATUS[inv.status] || {}).c} bg={(STATUS[inv.status] || {}).b}>{(STATUS[inv.status] || {}).l}</Tag></div>
                                    <Btn size="sm" variant="success" onClick={() => onPay(inv)}>Record payment</Btn>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    )
}

/* ═══ DEPARTMENT PERFORMANCE ═══════════════════════════════════════ */
function PerformancePane({ invoices }) {
    const rows = useMemo(() => {
        const m = {}
        invoices.forEach(inv => {
            const invTotal = Number(inv.total_amount || 0)
            const invPaid = Number(inv.amount_paid || 0)
            const ratio = invTotal > 0 ? invPaid / invTotal : 0
                ; (inv.items || []).forEach(it => {
                    const r = m[it.category] = m[it.category] || { invoices: new Set(), billed: 0, collected: 0 }
                    r.invoices.add(inv.id)
                    const amt = Number(it.total_price || 0)
                    r.billed += amt
                    r.collected += amt * ratio   // pro-rata allocation of payments
                })
        })
        return Object.entries(m).map(([cat, r]) => ({ cat, n: r.invoices.size, billed: r.billed, collected: r.collected, out: r.billed - r.collected }))
            .sort((a, b) => b.billed - a.billed)
    }, [invoices])
    const maxBilled = Math.max(1, ...rows.map(r => r.billed))

    return (
        <>
            <div style={card({ marginBottom: '16px' })}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700 }}>Revenue by Department</span>
                    <span style={{ fontSize: '11.5px', color: C.t3 }}>Billed vs collected</span>
                </div>
                {rows.length === 0 ? <div style={{ textAlign: 'center', padding: '22px', color: C.t3, fontSize: '13px' }}>No charges yet.</div> :
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {rows.map(r => (
                            <div key={r.cat}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                    <b style={{ color: DEPT_COLOR[r.cat] || C.t1 }}>{DEPT[r.cat] || r.cat}</b>
                                    <span style={{ color: C.t2 }}>{naira(r.collected)} / {naira(r.billed)}</span>
                                </div>
                                <div style={{ height: '10px', background: C.bg, borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
                                    <div style={{ position: 'absolute', inset: 0, width: `${r.billed / maxBilled * 100}%`, background: `${DEPT_COLOR[r.cat] || C.t2}33`, borderRadius: '6px' }} />
                                    <div style={{ position: 'absolute', inset: 0, width: `${r.collected / maxBilled * 100}%`, background: DEPT_COLOR[r.cat] || C.t2, borderRadius: '6px' }} />
                                </div>
                            </div>
                        ))}
                    </div>}
            </div>
            <div style={card()}>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Department Breakdown</div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead><tr style={{ textAlign: 'left', color: C.t2, fontSize: '11px', textTransform: 'uppercase' }}>
                            {['Department', 'Invoices', 'Billed', 'Collected', 'Outstanding', 'Collection rate'].map(h => <th key={h} style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}` }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {rows.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: C.t3 }}>No charges yet.</td></tr> :
                                rows.map(r => (
                                    <tr key={r.cat}>
                                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}`, fontWeight: 600, color: DEPT_COLOR[r.cat] || C.t1 }}>{DEPT[r.cat] || r.cat}</td>
                                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}` }}>{r.n}</td>
                                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}` }}>{naira(r.billed)}</td>
                                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}`, color: C.ok, fontWeight: 600 }}>{naira(r.collected)}</td>
                                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}`, color: r.out > 0 ? C.d : C.ok }}>{naira(r.out)}</td>
                                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}` }}>{r.billed > 0 ? Math.round(r.collected / r.billed * 100) : 0}%</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    )
}

/* ═══ RECEIPTS ═════════════════════════════════════════════════════ */
function ReceiptsPane({ invoices, onPay }) {
    const [q, setQ] = useState('')
    const filtered = invoices.filter(inv => !q || `${inv.invoice_number} ${inv.patient_detail?.first_name || ''} ${inv.patient_detail?.last_name || ''}`.toLowerCase().includes(q.toLowerCase()))
    return (
        <div style={card()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700 }}>Receipts &amp; Invoices <Tag color={C.i} bg={C.iB}>{invoices.length}</Tag></span>
                <input style={{ ...inp, maxWidth: '240px' }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search receipt / patient…" />
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead><tr style={{ textAlign: 'left', color: C.t2, fontSize: '11px', textTransform: 'uppercase' }}>
                        {['Receipt #', 'Patient', 'Departments', 'Amount', 'Paid', 'Method', 'Status', ''].map(h => <th key={h} style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}` }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                        {filtered.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: '28px', color: C.t3 }}>No receipts yet.</td></tr> :
                            filtered.map(inv => {
                                const st = STATUS[inv.status] || {}
                                const cats = [...new Set((inv.items || []).map(i => DEPT[i.category] || i.category))]
                                const name = inv.patient_detail ? `${inv.patient_detail.first_name || ''} ${inv.patient_detail.last_name || ''}`.trim() : '—'
                                const settled = ['paid', 'cancelled'].includes(inv.status)
                                return (
                                    <tr key={inv.id}>
                                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}`, fontWeight: 600, color: C.b }}>{inv.invoice_number}<div style={{ fontSize: '10.5px', color: C.t3, fontWeight: 400 }}>{fmt(inv.created_at)}</div></td>
                                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}` }}>{name}</td>
                                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}`, color: C.t2, fontSize: '12px' }}>{cats.join(', ') || '—'}</td>
                                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}`, fontWeight: 700 }}>{naira(inv.total_amount)}</td>
                                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}`, color: C.ok }}>{naira(inv.amount_paid)}</td>
                                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}`, textTransform: 'capitalize' }}>{inv.payment_method || '—'}</td>
                                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}` }}><Tag color={st.c} bg={st.b}>{st.l}</Tag></td>
                                        <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.br}` }}>{!settled && <Btn size="sm" variant="success" onClick={() => onPay(inv)}>Pay</Btn>}</td>
                                    </tr>
                                )
                            })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

/* ═══ PAYMENT MODAL ════════════════════════════════════════════════ */
function PayModal({ invoice, onClose, onDone }) {
    const [amount, setAmount] = useState(invoice.balance_due || '')
    const [method, setMethod] = useState('cash')
    const [busy, setBusy] = useState(false)
    const pay = async () => {
        const amt = parseFloat(amount)
        if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
        try { setBusy(true); await api.post(`/billing/${invoice.id}/pay/`, { amount_paid: amt, payment_method: method }); toast.success('Payment recorded'); onDone(); onClose() }
        catch (e) { toast.error(e?.response?.data?.error || 'Payment failed') } finally { setBusy(false) }
    }
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: C.s, borderRadius: '16px', width: '100%', maxWidth: '400px', padding: '20px' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '4px' }}>Record Payment</div>
                <div style={{ fontSize: '12.5px', color: C.t2, marginBottom: '14px' }}>{invoice.invoice_number} · balance {naira(invoice.balance_due)}</div>
                <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: C.t2, marginBottom: '5px' }}>Amount (₦)</label>
                    <input style={inp} type="number" value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: C.t2, marginBottom: '5px' }}>Method</label>
                    <select style={inp} value={method} onChange={e => setMethod(e.target.value)}>
                        <option value="cash">Cash</option><option value="pos">POS/Card</option><option value="transfer">Bank Transfer</option><option value="nhis">NHIS Claim</option><option value="insurance">Insurance</option>
                    </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <Btn variant="outline" onClick={onClose}>Cancel</Btn>
                    <Btn variant="success" disabled={busy} onClick={pay}>{busy ? 'Recording…' : 'Record payment'}</Btn>
                </div>
            </div>
        </div>
    )
}

/* ═══ ROOT ═════════════════════════════════════════════════════════ */
const TABS = [['patient', 'Patient Billing'], ['performance', 'Department Performance'], ['receipts', 'Receipts']]

export default function BillingPage() {
    const [tab, setTab] = useState('patient')
    const [invoices, setInvoices] = useState([])
    const [allPatients, setAllPatients] = useState([])
    const [loading, setLoading] = useState(true)
    const [payInv, setPayInv] = useState(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const inv = await api.get('/billing/')
            setInvoices(unwrap(inv.data))
            // fetch ALL patients, following pagination (max_page_size is 100)
            let page = 1, all = []
            for (let i = 0; i < 20; i++) {
                const r = await api.get('/patients/', { params: { page, page_size: 100 } })
                const batch = unwrap(r.data)
                all = all.concat(batch)
                if (!r.data?.next || batch.length === 0) break
                page += 1
            }
            setAllPatients(all)
        }
        catch { toast.error('Could not load billing') }
        finally { setLoading(false) }
    }, [])
    useEffect(() => { load() }, [load])

    const billed = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0)
    const collected = invoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0)
    const outstanding = billed - collected
    const today = new Date().toDateString()
    const todayCollected = invoices.filter(i => new Date(i.updated_at || i.created_at).toDateString() === today).reduce((s, i) => s + Number(i.amount_paid || 0), 0)

    const stats = [
        { label: 'Total Billed', val: naira(billed), color: C.t1 },
        { label: 'Collected', val: naira(collected), color: C.ok },
        { label: 'Outstanding', val: naira(outstanding), color: outstanding > 0 ? C.d : C.ok },
        { label: "Today's Collections", val: naira(todayCollected), color: C.b },
    ]

    return (
        <AppLayout title="Billing & Finance" action={<Btn variant="outline" size="sm" onClick={load}>↺ Refresh</Btn>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' }}>
                {stats.map(s => (
                    <div key={s.label} style={card({ padding: '16px 18px' })}>
                        <div style={{ fontSize: '21px', fontWeight: 800, color: s.color }}>{s.val}</div>
                        <div style={{ fontSize: '12px', color: C.t2, marginTop: '2px' }}>{s.label}</div>
                    </div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '4px', borderBottom: `1px solid ${C.br}`, marginBottom: '16px', overflowX: 'auto' }}>
                {TABS.map(([id, label]) => (
                    <button key={id} onClick={() => setTab(id)} style={{ padding: '10px 16px', fontSize: '13px', fontWeight: tab === id ? 700 : 500, cursor: 'pointer', background: 'none', border: 'none', borderBottom: `2px solid ${tab === id ? C.b : 'transparent'}`, color: tab === id ? C.b : C.t2, whiteSpace: 'nowrap', fontFamily: 'inherit' }}>{label}</button>
                ))}
            </div>
            {loading ? <div style={{ textAlign: 'center', padding: '40px', color: C.t3 }}>Loading billing…</div> : (
                <>
                    {tab === 'patient' && <PatientBillingPane invoices={invoices} allPatients={allPatients} onPay={setPayInv} />}
                    {tab === 'performance' && <PerformancePane invoices={invoices} />}
                    {tab === 'receipts' && <ReceiptsPane invoices={invoices} onPay={setPayInv} />}
                </>
            )}
            {payInv && <PayModal invoice={payInv} onClose={() => setPayInv(null)} onDone={load} />}
        </AppLayout>
    )
}