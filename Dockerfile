FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 数据根：方案 B（git 回写）与方案 C（持久卷）共用此目录；卷挂到 /app/data 即持久
ENV DATA_ROOT=/app/data
ENV HOST=0.0.0.0
EXPOSE 8000

CMD ["python", "server.py"]
