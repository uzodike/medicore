import { useState, useEffect, useCallback, useRef } from 'react'
import { labAI } from '../../api/labAI'
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

// Display labels for each registry test_type — extend when a new test is added
const TEST_LABELS = {
    malaria: { title: 'Malaria Cell Screening', hint: 'single cell, cropped' },
    sickle_cell: { title: 'Sickle Cell Screening', hint: 'single cell, cropped' },
    tb_smear: { title: 'TB Sputum Smear Screening', hint: 'full field image' },
    microfilariae: { title: 'Microfilariae Screening', hint: 'full field image' },
}

/**
 * Generic AI screening panel — ADVISORY ONLY, for any registry.py test_type.
 * The AI suggestion is never auto-recorded as a result; a lab scientist must
 * explicitly confirm (classify-kind) or review every box (detect-kind)
 * before anything counts clinically.
 *
 * Renders one of two modes depending on what the backend registry says
 * this test_type is:
 *   'classify' — single positive/negative suggestion + confirm dropdown
 *                (malaria, sickle_cell)
 *   'detect'   — bounding boxes overlaid on the image; reviewer confirms/
 *                rejects each box and can draw ones the AI missed
 *                (tb_smear, microfilariae)
 */
export default function LabAIScreen({ testType, patientId, patientName, orderItemId, onConfirmed }) {
    const [regInfo, setRegInfo] = useState(null)   // { kind, classes, confidence_threshold, specimen, model_loaded }
    const [checking, setChecking] = useState(true)
    const [file, setFile] = useState(null)
    const [preview, setPreview] = useState(null)
    const [uploading, setUploading] = useState(false)
    const [screen, setScreen] = useState(null)
    const [aiError, setAiError] = useState(null)
    const fileRef = useRef(null)

    const meta = TEST_LABELS[testType] || { title: `${testType} Screening`, hint: 'image' }

    const checkStatus = useCallback(() => {
        setChecking(true)
        labAI.status(testType)
            .then(r => setRegInfo(r.data))
            .catch(() => setRegInfo({ model_loaded: false, kind: null }))
            .finally(() => setChecking(false))
    }, [testType])
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
            const { data } = await labAI.upload(testType, patientId, file, orderItemId)
            setScreen(data.screen)
            setAiError(data.ai_error || null)
            if (data.ai_error) toast.error(data.ai_error)
            else toast.success('AI suggestion ready — confirm before recording')
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Upload failed')
        } finally { setUploading(false) }
    }

    const reset = () => {
        setFile(null); setPreview(null); setScreen(null); setAiError(null)
        if (fileRef.current) fileRef.current.value = ''
    }

    if (checking) {
        return <div style={card()}><div style={{ fontSize: '13px', color: C.t2 }}>Checking AI service…</div></div>
    }

    const serviceUp = !!regInfo?.model_loaded
    const kind = regInfo?.kind

    return (
        <div style={card()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700 }}>{meta.title} — AI Assistant</div>
                {!serviceUp && <span style={{ fontSize: '11px', fontWeight: 700, color: C.d, background: C.dB, borderRadius: '20px', padding: '3px 9px' }}>⛔ AI service unavailable</span>}
                {serviceUp && <span style={{ fontSize: '11px', fontWeight: 700, color: C.ok, background: C.okB, borderRadius: '20px', padding: '3px 9px' }}>● Model ready</span>}
            </div>
            <div style={{ fontSize: '12px', color: C.t2, marginBottom: '12px' }}>
                {patientName ? `For ${patientName} — ` : ''}Upload a {meta.hint}. This is a suggestion only — the lab scientist confirms before anything is recorded.
            </div>

            {!serviceUp && (
                <div style={{ background: C.wB, border: `1px solid #fde68a`, borderRadius: '9px', padding: '10px 12px', fontSize: '12px', color: '#92400e', marginBottom: '12px' }}>
                    The AI screening service isn't running or has no trained model loaded for this test yet. You can still process this result manually — this panel just won't offer a suggestion until the service is available.
                </div>
            )}

            {!screen && (
                <>
                    <div
                        onClick={() => fileRef.current?.click()}
                        style={{ border: `2px dashed ${C.br2}`, borderRadius: '12px', padding: '22px', textAlign: 'center', cursor: 'pointer', background: C.bg, marginBottom: '12px' }}>
                        {preview ? (
                            <img src={preview} alt="preview" style={{ maxHeight: '160px', maxWidth: '100%', borderRadius: '8px' }} />
                        ) : (
                            <>
                                <div style={{ fontSize: '26px', marginBottom: '6px' }}>🔬</div>
                                <div style={{ fontSize: '13px', fontWeight: 600 }}>Click to upload a {meta.hint}</div>
                                <div style={{ fontSize: '11px', color: C.t3, marginTop: '3px' }}>JPEG or PNG</div>
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

            {screen && aiError && (
                <div style={{ background: C.dB, border: '1px solid #fca5a5', borderRadius: '9px', padding: '10px 12px', fontSize: '12px', color: '#991b1b' }}>
                    {aiError}
                    <div style={{ marginTop: '8px' }}><Btn variant="outline" size="sm" onClick={reset}>Try again</Btn></div>
                </div>
            )}

            {screen && !aiError && kind === 'classify' && (
                <ClassifyResult screen={screen} preview={preview} onConfirmed={(s) => { setScreen(s); onConfirmed && onConfirmed(s) }} onReset={reset} />
            )}

            {screen && !aiError && kind === 'detect' && (
                <DetectReview screen={screen} preview={preview} onConfirmed={(s, count) => { setScreen(s); onConfirmed && onConfirmed(s, count) }} onReset={reset} />
            )}
        </div>
    )
}

/* ── Classify-kind result: simple positive/negative confirm ─────────────── */
function ClassifyResult({ screen, preview, onConfirmed, onReset }) {
    const [confirmStatus, setConfirmStatus] = useState('')
    const [notes, setNotes] = useState('')
    const [confirming, setConfirming] = useState(false)

    const positive = screen.ai_label && screen.ai_label !== 'uninfected' && screen.ai_label !== 'normal_rbc'
    const confPct = screen.ai_confidence != null ? Math.round(screen.ai_confidence * 100) : null

    const confirm = async () => {
        if (!confirmStatus) { toast.error('Select the confirmed result'); return }
        try {
            setConfirming(true)
            const { data } = await labAI.confirm(screen.id, { status: confirmStatus, notes })
            toast.success('Recorded — remember to enter the official result in Results & Upload')
            onConfirmed(data)
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Could not save confirmation')
        } finally { setConfirming(false) }
    }

    return (
        <>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', background: positive ? C.dB : C.okB, border: `1px solid ${positive ? '#fca5a5' : '#86efac'}`, borderRadius: '12px', padding: '14px', marginBottom: '10px' }}>
                {preview && <img src={preview} alt="cell" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />}
                <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: positive ? C.d : C.ok }}>
                        {screen.ai_label?.toUpperCase()} <span style={{ fontWeight: 500, fontSize: '11.5px', color: C.t2 }}>({confPct}% confidence)</span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: C.t2, marginTop: '2px' }}>
                        AI suggestion only — confirm before recording anything.
                    </div>
                </div>
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
            <div style={{ marginTop: '10px' }}><Btn variant="outline" size="sm" onClick={onReset}>Screen another image</Btn></div>
        </>
    )
}

/* ── Detect-kind result: bounding-box review ─────────────────────────────── */
function DetectReview({ screen, preview, onConfirmed, onReset }) {
    const [boxes, setBoxes] = useState(screen.boxes || [])
    const [selected, setSelected] = useState({})   // { boxId: 'confirm' | 'reject' | undefined }
    const [drawing, setDrawing] = useState(false)
    const [newBoxes, setNewBoxes] = useState([])
    const [draftBox, setDraftBox] = useState(null)
    const [submitting, setSubmitting] = useState(false)
    // Boxes and image are stored/served in PIXEL coordinates (see
    // service.py's _predict_detect and export_retraining_data.py, which
    // divides by width/height to normalize — only sensible if the raw
    // values are pixels). naturalSize holds the image's real pixel
    // dimensions once loaded, so we can convert px -> % for rendering.
    const [naturalSize, setNaturalSize] = useState(null)
    const imgRef = useRef(null)
    const containerRef = useRef(null)

    const toggleBox = (id, action) => {
        setSelected(s => ({ ...s, [id]: s[id] === action ? undefined : action }))
    }

    const handleImgLoad = () => {
        if (imgRef.current) {
            setNaturalSize({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight })
        }
    }

    // Convert a pixel-space box into rendering percentages against the
    // image's natural size — NOT the rendered/displayed size, since CSS
    // may scale the <img> down and percentages need to be relative to
    // the actual pixel coordinates the model/backend used.
    const toPct = (val, dimension) => {
        if (!naturalSize) return 0
        return (val / naturalSize[dimension]) * 100
    }

    const getRelPos = (e) => {
        // Drawing new boxes: capture in the SAME pixel space as everything
        // else, by converting the click's fractional position back to
        // pixels using naturalSize, so newBoxes are stored consistently
        // with AI-proposed boxes (both pixel coordinates) rather than
        // mixing two different coordinate systems.
        const rect = containerRef.current.getBoundingClientRect()
        const fracX = (e.clientX - rect.left) / rect.width
        const fracY = (e.clientY - rect.top) / rect.height
        if (!naturalSize) return { x: fracX, y: fracY }
        return { x: fracX * naturalSize.w, y: fracY * naturalSize.h }   // pixel coords
    }

    const handleMouseDown = (e) => {
        if (!drawing) return
        const pos = getRelPos(e)
        setDraftBox({ startX: pos.x, startY: pos.y, x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y })
    }
    const handleMouseMove = (e) => {
        if (!drawing || !draftBox) return
        const pos = getRelPos(e)
        setDraftBox(b => ({
            ...b,
            x1: Math.min(b.startX, pos.x), x2: Math.max(b.startX, pos.x),
            y1: Math.min(b.startY, pos.y), y2: Math.max(b.startY, pos.y),
        }))
    }
    const handleMouseUp = () => {
        if (!drawing || !draftBox) return
        const minSizePx = naturalSize ? Math.min(naturalSize.w, naturalSize.h) * 0.01 : 1
        if (draftBox.x2 - draftBox.x1 > minSizePx && draftBox.y2 - draftBox.y1 > minSizePx) {
            setNewBoxes(nb => [...nb, { ...draftBox, id: `new-${Date.now()}`, predicted_class: screen.test_type === 'tb_smear' ? 'bacillus' : 'microfilaria' }])
        }
        setDraftBox(null)
        setDrawing(false)
    }
    const removeNewBox = (id) => setNewBoxes(nb => nb.filter(b => b.id !== id))

    const submit = async () => {
        const confirmed_box_ids = boxes.filter(b => selected[b.id] === 'confirm').map(b => b.id)
        const rejected_box_ids = boxes.filter(b => selected[b.id] === 'reject').map(b => b.id)
        const unreviewed = boxes.filter(b => !selected[b.id])
        if (unreviewed.length > 0) {
            toast.error(`${unreviewed.length} box(es) still need confirm/reject before submitting`)
            return
        }
        try {
            setSubmitting(true)
            // newBoxes are already stored in pixel coordinates (see
            // getRelPos above) — same space as AI-proposed boxes —
            // so they can be sent through as-is.
            const { data } = await labAI.submitBoxReview(screen.id, {
                confirmed_box_ids,
                rejected_box_ids,
                new_boxes: newBoxes.map(b => ({ x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, predicted_class: b.predicted_class })),
            })
            toast.success(`Review saved — ${data.confirmed_box_count} confirmed finding(s)`)
            onConfirmed(data.screen, data.confirmed_box_count)
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Could not save review')
        } finally { setSubmitting(false) }
    }

    const alreadyReviewed = screen.status !== 'pending'

    // Single source of truth for a box's visual state — used by BOTH the
    // image overlay and the findings list below, so they never disagree.
    // Before submission: reflects the in-progress `selected` choice.
    // After submission: reflects what was actually persisted server-side.
    const getBoxState = (b) => {
        if (alreadyReviewed) return b.confirmed ? 'confirm' : b.rejected ? 'reject' : undefined
        return selected[b.id]
    }
    const getBoxColor = (state) => state === 'confirm' ? '#16a34a' : state === 'reject' ? '#dc2626' : '#d97706'

    // Combined, stably-ordered list for numbering — AI boxes first, then
    // any human-added ones — so the number badge on the image always
    // matches the number in the findings list below it.
    const allFindings = [
        ...boxes.map(b => ({ ...b, kind: 'ai' })),
        ...newBoxes.map(b => ({ ...b, kind: 'new' })),
    ]

    return (
        <>
            <div style={{ fontSize: '12px', color: C.t2, marginBottom: '8px' }}>
                AI proposed <b>{boxes.length}</b> finding(s) — {boxes.filter(b => b.source === 'ai').length} from the model.
                Confirm each one, reject false positives, and draw any the AI missed.
            </div>

            <div
                ref={containerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', marginBottom: '12px', cursor: drawing ? 'crosshair' : 'default' }}
            >
                <img ref={imgRef} src={preview || screen.image} alt="screen" onLoad={handleImgLoad}
                    style={{ maxWidth: '100%', display: 'block', borderRadius: '8px' }} />

                {naturalSize && boxes.map((b, idx) => {
                    const state = getBoxState(b)
                    const color = getBoxColor(state)
                    return (
                        <div key={b.id} onClick={() => !alreadyReviewed && toggleBox(b.id, 'confirm')}
                            onContextMenu={(e) => { e.preventDefault(); if (!alreadyReviewed) toggleBox(b.id, 'reject') }}
                            style={{
                                position: 'absolute',
                                left: `${toPct(b.x1, 'w')}%`, top: `${toPct(b.y1, 'h')}%`,
                                width: `${toPct(b.x2 - b.x1, 'w')}%`, height: `${toPct(b.y2 - b.y1, 'h')}%`,
                                border: `2px solid ${color}`, cursor: alreadyReviewed ? 'default' : 'pointer',
                                boxSizing: 'border-box',
                            }}
                            title={`#${idx + 1} ${b.predicted_class} (${Math.round((b.ai_confidence || 0) * 100)}%) — click=confirm, right-click=reject`}
                        >
                            <span style={{
                                position: 'absolute', top: '-10px', left: '-10px',
                                width: '20px', height: '20px', borderRadius: '50%',
                                background: color, color: '#fff', fontSize: '11px', fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 1px 3px rgba(0,0,0,.35)', pointerEvents: 'none',
                            }}>{idx + 1}</span>
                        </div>
                    )
                })}

                {naturalSize && newBoxes.map((b, i) => (
                    <div key={b.id} onClick={() => !alreadyReviewed && removeNewBox(b.id)}
                        style={{
                            position: 'absolute',
                            left: `${toPct(b.x1, 'w')}%`, top: `${toPct(b.y1, 'h')}%`,
                            width: `${toPct(b.x2 - b.x1, 'w')}%`, height: `${toPct(b.y2 - b.y1, 'h')}%`,
                            border: '2px dashed #2563eb', boxSizing: 'border-box', cursor: 'pointer',
                        }}
                        title={`#${boxes.length + i + 1} ${b.predicted_class} (human-added) — click to remove`}>
                        <span style={{
                            position: 'absolute', top: '-10px', left: '-10px',
                            width: '20px', height: '20px', borderRadius: '50%',
                            background: '#2563eb', color: '#fff', fontSize: '11px', fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 1px 3px rgba(0,0,0,.35)', pointerEvents: 'none',
                        }}>{boxes.length + i + 1}</span>
                    </div>
                ))}

                {naturalSize && draftBox && (
                    <div style={{
                        position: 'absolute',
                        left: `${toPct(draftBox.x1, 'w')}%`, top: `${toPct(draftBox.y1, 'h')}%`,
                        width: `${toPct(draftBox.x2 - draftBox.x1, 'w')}%`, height: `${toPct(draftBox.y2 - draftBox.y1, 'h')}%`,
                        border: '2px dashed #2563eb', boxSizing: 'border-box',
                    }} />
                )}
            </div>

            {/* ── Findings analysis list — the actual readable output the
                 reviewer needs: class, confidence, and confirm/reject per
                 finding, numbered to match the badges on the image above.
                 Hovering a tiny overlapping box was never a reasonable way
                 to read this. ── */}
            {allFindings.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '8px' }}>
                        Findings ({allFindings.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {allFindings.map((f, idx) => {
                            const isNew = f.kind === 'new'
                            const state = isNew ? 'confirm' : getBoxState(f)   // human-added always counts as confirmed
                            const color = isNew ? '#2563eb' : getBoxColor(state)
                            const confPct = f.ai_confidence != null ? Math.round(f.ai_confidence * 100) : null
                            return (
                                <div key={f.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '8px 10px', borderRadius: '8px',
                                    background: C.bg, border: `1px solid ${C.br}`,
                                }}>
                                    <span style={{
                                        width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                                        background: color, color: '#fff', fontSize: '11px', fontWeight: 700,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>{idx + 1}</span>
                                    <div style={{ flex: 1, fontSize: '12.5px' }}>
                                        <b style={{ textTransform: 'capitalize' }}>{f.predicted_class}</b>
                                        {confPct != null
                                            ? <span style={{ color: C.t2, marginLeft: '8px' }}>{confPct}% confidence</span>
                                            : <span style={{ color: '#2563eb', marginLeft: '8px', fontSize: '11px' }}>human-added</span>}
                                    </div>
                                    {!alreadyReviewed ? (
                                        isNew ? (
                                            <Btn size="sm" variant="outline" onClick={() => removeNewBox(f.id)}>Remove</Btn>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <Btn size="sm" variant={state === 'confirm' ? 'success' : 'outline'} onClick={() => toggleBox(f.id, 'confirm')}>✓ Confirm</Btn>
                                                <Btn size="sm" variant={state === 'reject' ? 'danger' : 'outline'} onClick={() => toggleBox(f.id, 'reject')}>✕ Reject</Btn>
                                            </div>
                                        )
                                    ) : (
                                        <span style={{ fontSize: '11px', fontWeight: 700, color }}>
                                            {state === 'confirm' ? 'Confirmed' : state === 'reject' ? 'Rejected' : '—'}
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {!alreadyReviewed && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11px', color: C.t2, marginBottom: '10px' }}>
                    <span>🟠 unreviewed</span><span>🟢 confirmed</span><span>🔴 rejected</span><span>🔵 dashed = human-added</span>
                </div>
            )}

            {!alreadyReviewed && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <Btn variant={drawing ? 'success' : 'outline'} size="sm" onClick={() => setDrawing(d => !d)}>
                        {drawing ? '✓ Click-drag to draw…' : '+ Add missed finding'}
                    </Btn>
                </div>
            )}

            {!alreadyReviewed ? (
                <Btn variant="success" disabled={submitting} onClick={submit}>
                    {submitting ? 'Saving…' : 'Submit Review'}
                </Btn>
            ) : (
                <div style={{ fontSize: '12.5px', color: C.t2 }}>
                    ✓ Reviewed as <b>{screen.status.replace('confirmed_', '').replace('_', ' ')}</b> by {screen.confirmed_by_name || 'scientist'}.
                    {' '}Now enter the official result in <b>Results &amp; Upload</b> as usual.
                </div>
            )}
            <div style={{ marginTop: '10px' }}><Btn variant="outline" size="sm" onClick={onReset}>Screen another image</Btn></div>

            {/* TEMPORARY DEBUG PANEL — remove once box rendering is confirmed
                working. Shows exact numbers so a mismatch between server-side
                box coordinates and the browser's natural image size is
                visible without opening dev tools. */}
            <details style={{ marginTop: '16px', fontSize: '11px', color: C.t3 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Debug: raw box data</summary>
                <pre style={{ background: C.bg, padding: '10px', borderRadius: '8px', overflowX: 'auto', marginTop: '6px' }}>
                    {JSON.stringify({
                        naturalSize,
                        imgSrc: preview || screen.image,
                        boxCount: boxes.length,
                        boxes: boxes.map(b => ({ id: b.id, x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, class: b.predicted_class })),
                    }, null, 2)}
                </pre>
            </details>
        </>
    )
}