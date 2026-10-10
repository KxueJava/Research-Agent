"""Correct only the existing qwen-plus API URL; never print credentials."""
import importlib.util
import json
import os
import sys
from pathlib import Path
from dotenv import dotenv_values

root = Path(__file__).resolve().parents[2]
settings = dotenv_values(root / "scripts/.env.local")
spec = importlib.util.spec_from_file_location("mysql_exec", Path.home() / ".codex/skills/mysql/mysql_exec.py")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
conn = helper.create_connection("127.0.0.1", settings.get("RESEARCH_MYSQL_USER") or "root", settings.get("RESEARCH_MYSQL_PASSWORD") or os.environ.get("RESEARCH_MYSQL_PASSWORD"), db="ai-agent-station")
try:
    result = helper.execute_sql(conn, "SELECT m.id,m.api_id,a.base_url FROM ai_client_model m JOIN ai_client_api a ON a.api_id=m.api_id WHERE m.model_name='qwen-plus'")
    print(json.dumps(result, ensure_ascii=False))
    if "--apply" in sys.argv or "--test" in sys.argv:
        if len(result["rows"]) != 1:
            raise RuntimeError("Expected one qwen-plus binding")
        api_id = result["rows"][0][1]
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM ai_client_model WHERE api_id=%s", (api_id,))
            if cursor.fetchone()[0] != 1:
                raise RuntimeError("Provider is shared; refusing unrelated changes")
            cursor.execute("SELECT api_key FROM ai_client_api WHERE api_id=%s", (api_id,))
            credential = cursor.fetchone()[0]
            from openai import OpenAI, DefaultHttpxClient
            client = OpenAI(api_key=credential, base_url="https://dashscope.aliyuncs.com/compatible-mode/v1", http_client=DefaultHttpxClient(trust_env=False))
            response = client.chat.completions.create(model="qwen-plus", messages=[{"role":"user","content":"Reply OK only"}], max_tokens=8, extra_body={"enable_thinking":False})
            if not response.choices[0].message.content:
                raise RuntimeError("Model returned empty response")
            if "--apply" in sys.argv:
                cursor.execute("UPDATE ai_client_api SET base_url=%s WHERE api_id=%s", ("https://dashscope.aliyuncs.com/compatible-mode/v1", api_id))
        if "--apply" in sys.argv:
            conn.commit()
        print("Saved model credential connectivity passed.")
finally:
    conn.close()
