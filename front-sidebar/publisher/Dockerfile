FROM python:3.12-slim
RUN pip install --no-cache-dir paramiko==3.5.1
WORKDIR /app
COPY publisher.py /app/publisher.py
USER 65532:65532
CMD ["python", "/app/publisher.py"]
