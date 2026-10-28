FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir torch==2.14.1 torchvision==0.29.1 --index-url https://download.pytorch.org/whl/cpu && pip install --no-cache-dir -r requirements.txt
COPY model.py app.py restore_references.py ./
# Mount a persistent model cache and references.json generated from the public recordings.
ENV OMP_NUM_THREADS=4
EXPOSE 8765
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8765","--workers","1"]
