from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI()

# 1. Enable CORS so the web frontend can talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins (change this for production)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Your existing root endpoint (proves the server is alive)
@app.get("/")
@app.get("/health/{test_type}")
def root():
    return {"message": "Malaria AI service is running"}

# 3. A Health / Status endpoint (The UI checks this to decide if it's "unavailable")
@app.get("/health")
def health_check():
    # Change this to False if the model fails to load
    model_loaded = True 
    return JSONResponse(
        status_code=200,
        content={"status": "ready", "model_loaded": model_loaded}
    )

# 4. A placeholder Prediction endpoint (where the UI sends the image)
@app.post("/predict")
async def predict():
    # This is where your AI model logic will go later
    return {"prediction": "negative", "confidence": 0.95}
