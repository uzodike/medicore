# ══════════════════════════════════════════════════════════════════
# Save as: apps/ai_screening/management/commands/export_retraining_data.py
# Run with: python manage.py export_retraining_data malaria /path/to/output
# ══════════════════════════════════════════════════════════════════
import os
import shutil
from django.core.management.base import BaseCommand
from apps.ai_screening.models import AIScreen
from ai_services.registry import get_config


class Command(BaseCommand):
    help = 'Export human-confirmed AI screens as a retraining dataset'

    def add_arguments(self, parser):
        parser.add_argument('test_type')
        parser.add_argument('output_dir')

    def handle(self, *args, **options):
        test_type = options['test_type']
        output_dir = options['output_dir']
        config = get_config(test_type)

        if config.kind == 'detect':
            self._export_detect(test_type, output_dir)
        else:
            self._export_classify(test_type, output_dir, config)

    def _export_classify(self, test_type, output_dir, config):
        negative_class, positive_class = config.classes[0], config.classes[1]

        confirmed = AIScreen.objects.filter(
            test_type=test_type,
            status__in=['confirmed_positive', 'confirmed_negative'],
            image__isnull=False,
        ).exclude(image='')

        counts = {negative_class: 0, positive_class: 0}
        agree_count, disagree_count = 0, 0

        for screen in confirmed:
            label = negative_class if screen.status == 'confirmed_negative' else positive_class
            class_dir = os.path.join(output_dir, label)
            os.makedirs(class_dir, exist_ok=True)

            src = screen.image.path
            if not os.path.exists(src):
                continue
            dst = os.path.join(class_dir, f'{screen.id}_{os.path.basename(src)}')
            shutil.copy(src, dst)
            counts[label] += 1

            if screen.ai_and_human_agree is True:
                agree_count += 1
            elif screen.ai_and_human_agree is False:
                disagree_count += 1

        self.stdout.write(self.style.SUCCESS(f'\nExported to {output_dir}:'))
        for label, n in counts.items():
            self.stdout.write(f'  {label}: {n} images')
        self.stdout.write(f'\nAI/human agreement on these: {agree_count} agreed, {disagree_count} disagreed')
        self._print_retrain_warning()

    def _export_detect(self, test_type, output_dir):
        from PIL import Image

        images_dir = os.path.join(output_dir, 'images')
        labels_dir = os.path.join(output_dir, 'labels')
        os.makedirs(images_dir, exist_ok=True)
        os.makedirs(labels_dir, exist_ok=True)

        # Only screens where box review actually happened — a screen sitting
        # at 'pending' with unreviewed AI boxes isn't usable data yet, its
        # boxes haven't been confirmed OR rejected by anyone.
        confirmed = AIScreen.objects.filter(
            test_type=test_type,
            status__in=['confirmed_positive', 'confirmed_negative'],
            image__isnull=False,
        ).exclude(image='').prefetch_related('boxes')

        total_images, total_boxes, ai_confirmed, human_added, rejected_count = 0, 0, 0, 0, 0

        for screen in confirmed:
            src = screen.image.path
            if not os.path.exists(src):
                continue

            real_boxes = screen.boxes.filter(confirmed=True, rejected=False)
            rejected_count += screen.boxes.filter(rejected=True).count()

            # Empty label file for confirmed-negative screens (real negative
            # example) — same "empty file = no objects" convention as every
            # other detect dataset in this project.
            with Image.open(src) as img:
                w, h = img.size

            stem = f'{screen.id}_{os.path.splitext(os.path.basename(src))[0]}'
            shutil.copy(src, os.path.join(images_dir, f'{stem}{os.path.splitext(src)[1]}'))

            with open(os.path.join(labels_dir, f'{stem}.txt'), 'w') as f:
                for box in real_boxes:
                    xc = ((box.x1 + box.x2) / 2) / w
                    yc = ((box.y1 + box.y2) / 2) / h
                    bw = (box.x2 - box.x1) / w
                    bh = (box.y2 - box.y1) / h
                    f.write(f'0 {xc:.6f} {yc:.6f} {bw:.6f} {bh:.6f}\n')
                    total_boxes += 1
                    if box.source == 'ai':
                        ai_confirmed += 1
                    else:
                        human_added += 1

            total_images += 1

        self.stdout.write(self.style.SUCCESS(f'\nExported {total_images} images to {output_dir}'))
        self.stdout.write(f'  Total confirmed boxes: {total_boxes}')
        self.stdout.write(f'    - AI-proposed, human-confirmed: {ai_confirmed}')
        self.stdout.write(f'    - Human-added (AI missed these): {human_added}')
        self.stdout.write(f'  AI boxes rejected as false positives: {rejected_count}')
        if total_boxes and human_added > total_boxes * 0.3:
            self.stdout.write(self.style.WARNING(
                '  ⚠ A large share of boxes were human-added, not AI-proposed — '
                'the current model is missing a lot on real hospital images. '
                'Worth knowing before assuming retraining alone will close the gap; '
                'may be a genuine domain-shift issue, same kind of thing shadow '
                'validation was built to catch.'
            ))
        self._print_retrain_warning()

    def _print_retrain_warning(self):
        self.stdout.write(self.style.WARNING(
            '\n⚠ Before retraining on this: add it to TRAIN/VAL only, or set '
            'aside a fresh slice of this new hospital data as an updated '
            'held-out test set. Do NOT blend it into the original test set '
            'you already validated against. Run the full held-out evaluation '
            'on the retrained model before it replaces what registry.py '
            'currently points at.'
        ))