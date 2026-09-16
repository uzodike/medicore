# Getting a real trained model file

This service needs `malaria-cnn-v1.keras` in this folder to actually predict
anything. Nobody can hand you one safely off the internet (provenance/licensing
unknown) — the right path is to train it yourself, which is free and takes
about 15-20 minutes:

1. Go to kaggle.com, create a free account if needed.
2. Open a new Notebook, and either:
   - Upload the notebook you already have (`malaria-cells-classification-cnn.ipynb`), OR
   - Search Kaggle for "Malaria Cell Images Dataset" (by lekhraj) and attach it
     as a data source to a fresh notebook, then paste in the training cells.
3. In Notebook settings (right sidebar), turn on a **GPU** accelerator (free tier
   gives you weekly GPU hours — plenty for this).
4. Run all cells. The notebook trains for 5 epochs and calls
   `model.save('malaria-cnn-v1.keras')` (or similar) at the end.
5. Download that `.keras` file from the notebook's Output panel.
6. Copy it into this `model/` folder on your laptop, exactly named
   `malaria-cnn-v1.keras`.
7. Either restart the service, or POST to `http://localhost:8090/reload-model`
   to pick it up without a restart.

## Verify before trusting it
Before relying on this for anything, check `GET /health` — it should report
`"model_loaded": true`. Then test a few known-positive and known-negative
sample images from the dataset itself and confirm the labels come back right
(the class ordering — which sigmoid direction means "parasitized" — depends
on how Keras assigned class_indices during training; the fixed sign in
`app.py` assumes the NIH dataset's standard ordering, but ALWAYS verify
against your actual trained model rather than trusting this blindly).
