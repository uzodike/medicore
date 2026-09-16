# ══════════════════════════════════════════════════════════════════
# Save as: ai-services/registry.py
#
# Single source of truth for every microscope-based test. Two kinds:
#
#   'classify' — segment_candidates() crops individual objects first,
#                then one model call per crop returns one label.
#                Fits: malaria, sickle cell.
#
#   'detect'   — one model call on the WHOLE field image returns
#                multiple (box, label, confidence) results directly —
#                no separate crop step, the detector does its own
#                localization. Fits: microfilariae, stool O&P, UTI.
#
# Adding a 6th test = one new entry below. Nothing in service.py,
# the training scripts, or the review UI needs to change.
# ══════════════════════════════════════════════════════════════════
from dataclasses import dataclass, field
from typing import Literal


@dataclass
class TestConfig:
    kind: Literal['classify', 'detect']
    model_path: str
    classes: list[str]
    # classify-only:
    min_area: int = 0
    max_area: int = 0
    # detect-only:
    confidence_threshold: float = 0.4
    # both:
    specimen: str = ''          # 'blood_smear' | 'sputum_smear' | 'stool_wet_mount' | 'urine_sediment'
    crop_size: int = 130        # classify: crop dimension fed to model


REGISTRY: dict[str, TestConfig] = {

        'malaria': TestConfig(
        kind='classify',
        model_path='ai-services/malaria/model/malaria-cnn-v1.keras',
        classes=['uninfected', 'infected'],
        min_area=300,
        max_area=4000,
        specimen='blood_smear',
        crop_size=150,
    ),

     'sickle_cell': TestConfig(
         kind='classify',
         model_path='ai-services/malaria/model/sickle_cell_model_phase1_baseline.h5',
         classes=['normal_rbc', 'sickle_rbc'],
         min_area=200, max_area=3500,
         specimen='blood_smear',
     ),
     'tb_smear': TestConfig(
         kind='detect',
         model_path='ai-services/malaria/model/tb-torch-vision.pt',
         classes=['bacillus'],
         confidence_threshold=0.20,   # evidence-based — see registry notes / earlier P-R sweep
         specimen='sputum_smear',
     ),

     'microfilariae': TestConfig(
         kind='detect',
         model_path='ai-services/malaria/model/microfilira_model.pt',
         classes=['microfilaria'],
         confidence_threshold=0.15,   # PLACEHOLDER — not yet validated. This model hasn't
         # been trained/tested yet (still in the manual annotation stage as of this writing).
         # Once trained, run the same direct per-threshold sweep + pooled true-negative
         # check we did for tb_smear before trusting this number for anything real —
         # do not treat 0.35 as evidence-based just because it's sitting in this file.
         specimen='blood_smear',
     ),

    # 'stool_op': TestConfig(
    #     kind='detect',
    #     model_path='ai-services/stool_op/detector.pt',
    #     classes=['ascaris_egg', 'hookworm_egg', 'giardia_cyst', 'trichuris_egg'],
    #     confidence_threshold=0.4,
    #     specimen='stool_wet_mount',
    # ),

    # 'uti_urine': TestConfig(
    #     kind='detect',
    #     model_path='ai-services/uti_urine/detector.pt',
    #     classes=['bacteria', 'wbc', 'rbc', 'cast'],
    #     confidence_threshold=0.4,
    #     specimen='urine_sediment',
    # ),
}


def get_config(test_type: str) -> TestConfig:
    if test_type not in REGISTRY:
        raise KeyError(
            f"'{test_type}' has no registry entry yet. "
            f"Available: {list(REGISTRY.keys())}"
        )
    return REGISTRY[test_type]