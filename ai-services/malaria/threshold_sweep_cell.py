# ── Threshold sweep: find the cutoff that catches more real infections ──
# Uses val_preds (RAW sigmoid scores, not yet binarized) and val_true from
# your last shuffle=False evaluation. If val_preds was overwritten with the
# binarized 0/1 version, regenerate the raw scores first:
#   val_preds = model.predict(eval_gen, steps=len(eval_gen), verbose=1)

import numpy as np
from sklearn.metrics import confusion_matrix

raw_scores = val_preds.ravel()  # score > threshold -> "Uninfected" (class 1)

# Class order confirmed earlier: Parasitized=0, Uninfected=1.
# Medical convention: "Parasitized" is the positive class (has the condition).
#   cm[0,0]=TP (correctly caught infection)   cm[0,1]=FN (MISSED infection - dangerous)
#   cm[1,0]=FP (false alarm)                  cm[1,1]=TN (correctly cleared)

print(f"{'Threshold':>10} | {'FN (missed)':>12} | {'FP (false alarm)':>18} | {'Sensitivity':>12} | {'Specificity':>12}")
print("-" * 78)
for t in [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75]:
    preds_at_t = (raw_scores > t).astype(int)
    cm = confusion_matrix(val_true, preds_at_t)
    tp, fn, fp, tn = cm.ravel()
    sensitivity = tp / (tp + fn)  # infection catch rate — WANT THIS HIGH
    specificity = tn / (tn + fp)  # correctly-cleared rate
    print(f"{t:>10.2f} | {fn:>12} | {fp:>18} | {sensitivity:>11.1%} | {specificity:>11.1%}")

print("\nHigher threshold = model must be MORE confident before calling something")
print("'Uninfected', so more borderline cases get flagged Parasitized instead —")
print("fewer missed infections (lower FN), more false alarms (higher FP).")
print("Pick the lowest threshold that gets sensitivity to a level you're comfortable")
print("with (95%+ is a common clinical screening target where achievable).")
