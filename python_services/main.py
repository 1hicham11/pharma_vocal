from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import os
from dotenv import load_dotenv
from agent_logic import run_agent

load_dotenv()

app = FastAPI(title="Pharma Vocal API - RAG Agentique")

class AgentRequest(BaseModel):
    text: str
    avatar_id: int

class AvatarData(BaseModel):
    text: str

@app.get("/")
def read_root():
    return {"message": "Pharma Vocal RAG Agentique is running"}

@app.post("/process-avatar")
async def process_avatar(data: AvatarData):
    try:
        return {
            "status": "success",
            "text": data.text
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/agent")
async def process_agent(request: AgentRequest):
    try:
        if not request.text:
            raise HTTPException(status_code=400, detail="Le texte est requis")
        if request.avatar_id <= 0:
            raise HTTPException(status_code=400, detail="avatar_id invalide")
        
        # --- 🚨 LES LOGS DE DÉBOGAGE SONT ICI 🚨 ---
        print("\n" + "="*50)
        print("📥 REQUÊTE REÇUE DEPUIS NODE.JS :")
        print(f"Avatar ID : {request.avatar_id}")
        print(f"Texte brut reçu :\n{request.text}")
        print("="*50 + "\n")
        
        response = run_agent(request.text, request.avatar_id)
        
        print(f"📤 RÉPONSE ENVOYÉE AU FRONT :\n{response}\n")
        
        return {
            "status": "success",
            "output": response,
            "avatar_id": request.avatar_id
        }
    except Exception as e:
        print(f"❌ Agent Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001)