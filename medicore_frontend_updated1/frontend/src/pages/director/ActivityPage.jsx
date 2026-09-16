import { useState, useEffect, useCallback } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import api from '../../api/axios'
import toast from 'react-hot-toast'

const C = { b:'#1a6b5a', bl:'#e6f5f1', bg:'#f0f4f3', s:'#fff', t1:'#111827', t2:'#6b7280', t3:'#9ca3af', br:'#e5e7eb', br2:'#d1d5db',
    ok:'#16a34a', okB:'#f0fdf4', w:'#d97706', wB:'#fffbeb', d:'#dc2626', dB:'#fef2f2', i:'#2563eb', iB:'#eff6ff', p:'#7c3aed', pB:'#f5f3ff' }
const card = (x={}) => ({ background:C.s, borderRadius:'14px', border:`1px solid ${C.br}`, padding:'18px', ...x })
const inp = { padding:'9px 12px', borderRadius:'9px', border:`1px solid ${C.br2}`, fontSize:'13px', fontFamily:'inherit', outline:'none' }
const naira = (n) => '₦' + Number(n||0).toLocaleString('en-NG', { maximumFractionDigits: 0 })
const iso = (d) => d.toISOString().slice(0,10)

const CAT = {
    admission:   { l:'IPD',         c:C.b,  b:C.bl },
    lab:         { l:'Laboratory',  c:C.p,  b:C.pB },
    pharmacy:    { l:'Pharmacy',    c:C.ok, b:C.okB },
    billing:     { l:'Billing',     c:C.w,  b:C.wB },
    appointment: { l:'OPD',         c:C.i,  b:C.iB },
}
const RANGES = [['1','Today'],['7','7 days'],['30','30 days'],['90','90 days']]

export default function ActivityPage() {
    const today = new Date()
    const [from, setFrom] = useState(iso(new Date(Date.now()-6*86400000)))
    const [to, setTo] = useState(iso(today))
    const [cat, setCat] = useState('')
    const [data, setData] = useState({ events:[], count:0 })
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        setLoading(true)
        try { const r = await api.get('/notifications/activity/', { params:{ from, to } }); setData(r.data||{events:[]}) }
        catch { toast.error('Could not load activity') }
        finally { setLoading(false) }
    }, [from, to])
    useEffect(() => { load() }, [load])

    const quick = (days) => {
        const d = parseInt(days,10)
        setTo(iso(new Date()))
        setFrom(iso(new Date(Date.now()-(d-1)*86400000)))
    }

    const events = (data.events||[]).filter(e => !cat || e.category===cat)
    const byCat = {}
    ;(data.events||[]).forEach(e => { byCat[e.category]=(byCat[e.category]||0)+1 })

    return (
        <AppLayout title="Hospital Activity" action={null}>
            {/* range controls */}
            <div style={card({marginBottom:'16px'})}>
                <div style={{display:'flex',gap:'10px',alignItems:'flex-end',flexWrap:'wrap'}}>
                    <div><div style={{fontSize:'11.5px',fontWeight:600,color:C.t2,marginBottom:'5px'}}>From</div>
                        <input style={inp} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div>
                    <div><div style={{fontSize:'11.5px',fontWeight:600,color:C.t2,marginBottom:'5px'}}>To</div>
                        <input style={inp} type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>
                    <div style={{display:'flex',gap:'6px'}}>
                        {RANGES.map(([v,l]) => <button key={v} onClick={()=>quick(v)} style={{...inp,cursor:'pointer',background:'#fff'}}>{l}</button>)}
                    </div>
                    <select style={{...inp,marginLeft:'auto'}} value={cat} onChange={e=>setCat(e.target.value)}>
                        <option value="">All departments</option>
                        {Object.entries(CAT).map(([v,m]) => <option key={v} value={v}>{m.l}</option>)}
                    </select>
                </div>
                <div style={{display:'flex',gap:'8px',marginTop:'12px',flexWrap:'wrap'}}>
                    <span style={{fontSize:'12px',color:C.t2,alignSelf:'center'}}>{data.count||0} activities</span>
                    {Object.entries(byCat).map(([k,n]) => {
                        const m = CAT[k]||{l:k,c:C.t2,b:'#f3f4f6'}
                        return <span key={k} onClick={()=>setCat(cat===k?'':k)} style={{cursor:'pointer',fontSize:'11px',fontWeight:700,color:m.c,background:m.b,borderRadius:'20px',padding:'3px 10px',border:cat===k?`1.5px solid ${m.c}`:'1.5px solid transparent'}}>{m.l} · {n}</span>
                    })}
                </div>
            </div>

            {/* feed */}
            <div style={card()}>
                {loading ? <div style={{textAlign:'center',padding:'34px',color:C.t3}}>Loading activity…</div> :
                events.length===0 ? <div style={{textAlign:'center',padding:'34px',color:C.t3,fontSize:'13px'}}>No activity in this period.</div> :
                <div style={{display:'flex',flexDirection:'column'}}>
                    {events.map((e,i) => {
                        const m = CAT[e.category]||{l:e.category,c:C.t2,b:'#f3f4f6'}
                        return (
                            <div key={i} style={{display:'flex',gap:'12px',alignItems:'flex-start',padding:'11px 4px',borderBottom:i<events.length-1?`1px solid ${C.br}`:'none'}}>
                                <span style={{fontSize:'10.5px',fontWeight:800,color:m.c,background:m.b,borderRadius:'7px',padding:'4px 9px',whiteSpace:'nowrap',marginTop:'1px'}}>{m.l}</span>
                                <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontSize:'13px',fontWeight:600}}>{e.title}{e.amount!=null && <span style={{color:C.b}}> · {naira(e.amount)}</span>}</div>
                                    <div style={{fontSize:'12px',color:C.t2,marginTop:'1px'}}>{e.detail}</div>
                                </div>
                                <span style={{fontSize:'11px',color:C.t3,whiteSpace:'nowrap'}}>{new Date(e.at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                            </div>
                        )
                    })}
                </div>}
            </div>
        </AppLayout>
    )
}