import { useState, useEffect, useCallback, useRef } from 'react'
import { malariaAI } from '../../api/malariaAI'
import toast from 'react-hot-toast'

const C = {
    b: '#1a6b5a', bl: '#e6f5f1', bg: '#f0f4f3', s: '#fff',
    t1: '#111827', t2: '#6b7280', t3: '#9ca3af', br: '#e5e7eb', br2: '#d1d5db',
    ok: '#16a34a', okB: '#f0fdf4', w: '#d97706', wB: '#fffbeb', d: '#dc2626', dB: '#fef2f2',
}
const card = (x = {}) => ({ background: C.s, borderRadius: '14px', border: `1px solid ${C.br}`, padding: '18px', ...x })
const Btn = ({ children, variant = 'primary', size = 'md', disabled, onClick }) => {
    const base = { borderRadius: '9px', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, border: '1px solid transparent', opacity: disabled ? 0.55 : 1, padding: size === 'sm' ? '6px 12px' : '10px 16px', fontSize: size === 'sm' ? '12.5px' : '13.5px' }
    const v = { primary: { background: C.b, color: '#fff' }, success: { background: C.ok, color: '#fff' }, outline: { background: '#fff', color: C.t1, border: `1px solid ${C.br2}` }, danger: { background: C.d, color: '#fff' } }[variant]
    return <button onClick={onClick} disabled={disabled} style={{ ...base, ...v }}>{children}</button>
}

/**
 * Malaria cell screening panel — ADVISORY ONLY.
 * The AI suggestion is never auto-recorded as a result; a lab scientist must
 * explicitly confirm (or override) before anything counts clinically. Works
 * on a single cropped blood-cell image, not a whole slide field.
 */
export default function MalariaCellScreen({ patientId, patientName, orderItemId, onConfirmed }) {
    const [serviceUp, setServiceUp] = useState(null) // null=checking, true/false
    const [file, setFile] = useState(null)
    const [preview, setPreview] = useState(null)
    const [uploading, setUploading] = useState(false)
    const [screen, setScreen] = useState(null)
    const [aiError, setAiError] = useState(null)
    const [confirmStatus, setConfirmStatus] = useState('')
    const [notes, setNotes] = useState('')
    const [confirming, setConfirming] = useState(false)
    const fileRef = useRef(null)

    const checkStatus = useCallback(() => {
        malariaAI.status().then(r => setServiceUp(!!r.data?.model_loaded)).catch(() => setServiceUp(false))
    }, [])
    useEffect(() => { checkStatus() }, [checkStatus])

    const pickFile = (f) => {
        if (!f) return
        setFile(f)
        setPreview(URL.createObjectURL(f))
        setScreen(null)
        setAiError(null)
    }

    const upload = async () => {
        if (!file || !patientId) return
        try {
            setUploading(true)
            const fd = new FormData()
            fd.append('patient', patientId)
            fd.append('image', file)
            if (orderItemId) fd.append('order_item', orderItemId)
            const { data } = await malariaAI.upload(fd)
            setScreen(data.screen)
            setAiError(data.ai_error || null)
            if (data.ai_error) toast.error(data.ai_error)
            else toast.success('AI suggestion ready — confirm under the microscope before recording')
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Upload failed')
        } finally { setUploading(false) }
    }

    const confirm = async () => {
        if (!screen || !confirmStatus) { toast.error('Select the confirmed result'); return }
        try {
            setConfirming(true)
            const { data } = await malariaAI.confirm(screen.id, { status: confirmStatus, notes })
            setScreen(data)
            toast.success('Recorded — remember to enter the official result in Results & Upload')
            onConfirmed && onConfirmed(data)
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Could not save confirmation')
        } finally { setConfirming(false) }
    }

    const reset = () => {
        setFile(null); setPreview(null); setScreen(null); setAiError(null)
        setConfirmStatus(''); setNotes('')
        if (fileRef.current) fileRef.current.value = ''
    }

    const positive = screen?.ai_label === 'parasitized'
    const confPct = screen?.ai_confidence != null ? Math.round(screen.ai_confidence * 100) : null

    return (
        <div style={card()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700 }}>Malaria Cell Screening — AI Assistant</div>
                {serviceUp === false && <span style={{ fontSize: '11px', fontWeight: 700, color: C.d, background: C.dB, borderRadius: '20px', padding: '3px 9px' }}>⛔ AI service unavailable</span>}
                {serviceUp === true && <span style={{ fontSize: '11px', fontWeight: 700, color: C.ok, background: C.okB, borderRadius: '20px', padding: '3px 9px' }}>● Model ready</span>}
            </div>
            <div style={{ fontSize: '12px', color: C.t2, marginBottom: '12px' }}>
                {patientName ? `For ${patientName} — ` : ''}Upload a single stained blood-cell image. This is a suggestion only — the lab scientist confirms under the microscope before anything is recorded.
            </div>

            {serviceUp === false && (
                <div style={{ background: C.wB, border: `1px solid #fde68a`, borderRadius: '9px', padding: '10px 12px', fontSize: '12px', color: '#92400e', marginBottom: '12px' }}>
                    The AI screening service isn't running or has no trained model loaded yet. You can still process this result manually in Results &amp; Upload — this panel just won't offer a suggestion until the service is available.
                </div>
            )}

            {!screen && (
                <>
                    <div
                        onClick={() => fileRef.current?.click()}
                        style={{ border: `2px dashed ${C.br2}`, borderRadius: '12px', padding: '22px', textAlign: 'center', cursor: 'pointer', background: C.bg, marginBottom: '12px' }}>
                        {preview ? (
                            <img src={preview} alt="preview" style={{ maxHeight: '120px', borderRadius: '8px' }} />
                        ) : (
                            <>
                                <div style={{ fontSize: '26px', marginBottom: '6px' }}>🔬</div>
                                <div style={{ fontSize: '13px', fontWeight: 600 }}>Click to upload a cell image</div>
                                <div style={{ fontSize: '11px', color: C.t3, marginTop: '3px' }}>JPEG or PNG · single cell, cropped</div>
                            </>
                        )}
                        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={e => pickFile(e.target.files?.[0])} />
                    </div>
                    <Btn disabled={!file || uploading || !serviceUp} onClick={upload}>
                        {uploading ? 'Analysing…' : 'Get AI suggestion'}
                    </Btn>
                    {file && <Btn variant="outline" onClick={reset}>Clear</Btn>}
                </>
            )}

            {screen && !aiError && screen.ai_label && (
                <>
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center', background: positive ? C.dB : C.okB, border: `1px solid ${positive ? '#fca5a5' : '#86efac'}`, borderRadius: '12px', padding: '14px', marginBottom: '10px' }}>
                        {preview && <img src={preview} alt="cell" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />}
                        <div>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: positive ? C.d : C.ok }}>
                                {positive ? 'PARASITISED' : 'UNINFECTED'} <span style={{ fontWeight: 500, fontSize: '11.5px', color: C.t2 }}>({confPct}% confidence{screen.ai_raw_response?.raw_score != null ? `, raw score ${screen.ai_raw_response.raw_score}` : ''})</span>
                            </div>
                            <div style={{ fontSize: '11.5px', color: C.t2, marginTop: '2px' }}>
                                AI suggestion only — confirm under the microscope before recording anything.
                            </div>
                        </div>
                    </div>

                    {/* Explicit, always-visible miss-rate caveat — this model's own validation
                        results show it misses more real infections than it false-alarms, so
                        negatives specifically need the same scrutiny as positives, not less. */}
                    <div style={{ background: C.wB, border: '1px solid #fde68a', borderRadius: '9px', padding: '9px 12px', fontSize: '11.5px', color: '#92400e', marginBottom: '12px', display: 'flex', gap: '7px' }}>
                        <span>⚠</span>
                        <span>This model has a measured false-negative rate on validation data — it can miss real infections more often than it raises false alarms. <b>Always visually confirm "Uninfected" results too, not just positives.</b></span>
                    </div>

                    {screen.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <select value={confirmStatus} onChange={e => setConfirmStatus(e.target.value)}
                                style={{ flex: 1, minWidth: '160px', padding: '8px 10px', borderRadius: '9px', border: `1px solid ${C.br2}`, fontSize: '12.5px', fontFamily: 'inherit' }}>
                                <option value="">Confirm result…</option>
                                <option value="confirmed_positive">Confirm: Positive</option>
                                <option value="confirmed_negative">Confirm: Negative</option>
                                <option value="overridden">Override AI (disagree)</option>
                                <option value="inconclusive">Inconclusive</option>
                            </select>
                            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)"
                                style={{ flex: 1, minWidth: '160px', padding: '8px 10px', borderRadius: '9px', border: `1px solid ${C.br2}`, fontSize: '12.5px', fontFamily: 'inherit' }} />
                            <Btn variant="success" disabled={confirming || !confirmStatus} onClick={confirm}>
                                {confirming ? 'Saving…' : 'Confirm & record'}
                            </Btn>
                        </div>
                    ) : (
                        <div style={{ fontSize: '12.5px', color: C.t2 }}>
                            ✓ Confirmed as <b>{screen.status.replace('confirmed_', '').replace('_', ' ')}</b> by {screen.confirmed_by_name || 'scientist'}.
                            {' '}Now enter the official result in <b>Results &amp; Upload</b> as usual.
                        </div>
                    )}
                    <div style={{ marginTop: '10px' }}><Btn variant="outline" size="sm" onClick={reset}>Screen another cell</Btn></div>
                </>
            )}

            {screen && aiError && (
                <div style={{ background: C.dB, border: '1px solid #fca5a5', borderRadius: '9px', padding: '10px 12px', fontSize: '12px', color: '#991b1b' }}>
                    {aiError}
                    <div style={{ marginTop: '8px' }}><Btn variant="outline" size="sm" onClick={reset}>Try again</Btn></div>
                </div>
            )}
        </div>
    )
}
