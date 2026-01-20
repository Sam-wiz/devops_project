# Self-Healing Async Job Processing System with Circuit Breaker

A production-grade, self-healing job processing system built with NestJS, RabbitMQ, Redis, and Kubernetes. The system intelligently detects failure patterns and prevents cascading failures using circuit breaker patterns.

## Table of Contents

- [Problem Background](#problem-background)
- [Architecture](#architecture)
- [Failure Scenarios & Self-Healing](#failure-scenarios--self-healing)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
  - [Kubernetes Deployment](#kubernetes-deployment)
- [CI/CD Pipeline](#cicd-pipeline)
- [API Documentation](#api-documentation)
- [Configuration](#configuration)
- [Testing](#testing)
- [Monitoring](#monitoring)

---

## Problem Background

Traditional background job systems suffer from several critical issues:

1. **Blind Retries**: Jobs fail repeatedly without pattern detection, wasting resources
2. **Cascading Failures**: When an external service is down, all related jobs fail, overwhelming the system
3. **Resource Exhaustion**: Failed jobs consume worker resources, blocking healthy jobs
4. **No Circuit Breaking**: Systems don't "learn" from failures and pause processing intelligently
5. **Delayed Recovery**: Manual intervention required to resume processing after issues are resolved

### Solution

This system implements:
- **Pattern Detection**: Tracks failure patterns by job type and error code
- **Circuit Breaker**: Automatically opens when failure threshold is reached
- **Quarantine Queue**: Failed jobs are isolated, not discarded
- **Auto-Recovery**: Probes service health and auto-closes circuit when ready
- **Observability**: Control plane for monitoring and manual intervention

---

## Architecture

### System Diagram

```
┌──────────────┐
│   Client     │
└──────┬───────┘
       │ POST /jobs
       ▼
┌──────────────────────┐
│   Job API Service    │  Port 3000
│  - Validates jobs    │
│  - Publishes to MQ   │
└──────┬───────────────┘
       │
       ▼
┌────────────────────────────────────────────┐
│           RabbitMQ Queues                  │
│  ┌──────────┐  ┌─────────┐  ┌────────────┐│
│  │jobs.main │→│jobs.retry│→│jobs.quarantine││
│  └──────────┘  └─────────┘  └────────────┘│
└────────┬───────────────────────────────────┘
         │
         ▼
┌────────────────────────┐      ┌─────────────┐
│  Smart Worker Service  │◄────►│   Redis     │
│  - Processes jobs      │      │ - Failures  │
│  - Circuit breaker     │      │ - CB state  │
│  - Routes retry/quarantine    │             │
└────────────────────────┘      └─────────────┘
                                       ▲
                                       │
                              ┌────────┴──────────┐
                              │ Control Plane     │  Port 3002
                              │ - GET /breakers   │
                              │ - POST /reset     │
                              │ - GET /metrics    │
                              └───────────────────┘
```

### Microservices

#### 1. Job API Service (Port 3000)
**Responsibilities:**
- Exposes REST endpoint: `POST /jobs`
- Validates job payloads
- Publishes messages to RabbitMQ `jobs.main` queue
- Returns HTTP 202 Accepted immediately
- Health check endpoint: `GET /health`

**Key Point:** No job execution logic here. Pure API layer.

#### 2. Smart Worker Service (Port 3001)
**Responsibilities:**
- Consumes jobs from `jobs.main` queue
- Executes job logic (simulated for demo)
- Tracks failures in Redis by `jobType` and `errorCode`
- Implements circuit breaker logic:
  - **CLOSED**: Normal operation
  - **OPEN**: Stops processing, routes to quarantine
  - **Probe**: After cooldown, tests with single job
- Routes jobs to:
  - **ACK**: Success, remove from queue
  - **Retry Queue**: Transient failure, retry after TTL
  - **Quarantine**: Circuit open or max retries exceeded

**Circuit Breaker Logic:**
```typescript
If failure_count >= threshold (default: 5):
  Open circuit breaker
  Route all jobs to quarantine

If circuit OPEN and cooldown elapsed (default: 60s):
  Allow ONE probe job
  If probe succeeds:
    Close circuit
    Resume normal processing
  Else:
    Keep circuit open
```

#### 3. Control Plane Service (Port 3002)
**Responsibilities:**
- Monitors circuit breaker state
- Exposes management APIs:
  - `GET /breakers` - View all circuit breakers
  - `POST /breakers/:jobType/reset` - Manually reset a circuit
  - `GET /metrics` - View system metrics
- Read-only access to Redis state

---

## Failure Scenarios & Self-Healing

### Scenario 1: External API Timeout

**Problem:**
```
Email service API is down
→ All email jobs fail with API_TIMEOUT
→ Traditional system: retry blindly, waste resources
```

**Self-Healing Response:**
1. Worker detects 5 consecutive `API_TIMEOUT` failures for `jobType: email`
2. Circuit breaker **OPENS** for `email` jobs
3. New email jobs route to **quarantine** (not processed)
4. Other job types (SMS, webhook) continue normally
5. After 60s cooldown, system tests ONE email job
6. If successful, circuit **CLOSES**, email jobs resume

**Result:** System protects itself, isolates failures, auto-recovers

---

### Scenario 2: Bad Data

**Problem:**
```
Invalid data in payload
→ Jobs fail with VALIDATION_ERROR
→ Retrying won't help (data doesn't change)
```

**Self-Healing Response:**
1. After 3 failed retries, job moves to **quarantine**
2. Circuit remains CLOSED (not systemic issue)
3. Quarantine queue preserves failed jobs for investigation
4. Admin can inspect payload, fix data, resubmit

**Result:** Failed jobs don't block healthy jobs

---

### Scenario 3: Transient Network Error

**Problem:**
```
Temporary network glitch
→ Job fails once
→ Should retry, not quarantine
```

**Self-Healing Response:**
1. Job fails with `NETWORK_ERROR`
2. Failure count: 1 (below threshold of 5)
3. Job routes to **retry queue** with 5s TTL
4. After 5s, job returns to main queue
5. Likely succeeds on retry

**Result:** Transient errors handled gracefully

---

## Technology Stack

| Component | Technology | Reason |
|-----------|-----------|--------|
| **Language** | TypeScript (NestJS) | Type safety, excellent DI, microservices support |
| **Message Broker** | RabbitMQ | Durable queues, dead-letter exchanges, TTL support |
| **State Store** | Redis | Fast, simple key-value store for circuit breaker state |
| **Containerization** | Docker | Consistent environments across dev/prod |
| **Orchestration** | Kubernetes | Auto-scaling, health checks, rolling updates |
| **CI/CD** | GitHub Actions | Native integration, matrix builds, security scanning |

---

## Project Structure

```
project-root/
├── services/
│   ├── job-api/              # Job submission API
│   │   ├── src/
│   │   │   ├── jobs/         # Job endpoints & service
│   │   │   ├── health/       # Health checks
│   │   │   ├── main.ts
│   │   │   └── app.module.ts
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── worker/               # Smart worker with circuit breaker
│   │   ├── src/
│   │   │   ├── worker/       # Job processing logic
│   │   │   ├── circuit-breaker/  # Circuit breaker service
│   │   │   ├── health/
│   │   │   ├── main.ts
│   │   │   └── app.module.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── control-plane/        # Management API
│       ├── src/
│       │   ├── breakers/     # Circuit breaker management
│       │   ├── metrics/      # Metrics endpoint
│       │   ├── health/
│       │   ├── main.ts
│       │   └── app.module.ts
│       ├── Dockerfile
│       └── package.json
│
├── k8s/                      # Kubernetes manifests
│   ├── configmap.yaml        # Configuration
│   ├── rabbitmq.yaml         # RabbitMQ deployment & service
│   ├── redis.yaml            # Redis deployment & service
│   ├── job-api.yaml          # Job API deployment & service
│   ├── worker.yaml           # Worker deployment
│   └── control-plane.yaml    # Control plane deployment & service
│
├── .github/workflows/        # CI/CD pipelines
│   ├── ci-job-api.yml        # Job API CI
│   ├── ci-worker.yml         # Worker CI
│   ├── ci-control-plane.yml  # Control plane CI
│   └── cd.yml                # Kubernetes CD
│
├── docker-compose.yml        # Local development
└── README.md                 # This file
```

---

## Getting Started

### Prerequisites

**For Local Development:**
- Node.js 20+
- Docker & Docker Compose
- npm or yarn

**For Kubernetes Deployment:**
- kubectl
- Kind, Minikube, or access to a K8s cluster
- DockerHub account (for image registry)

---

### Local Development

#### 1. Start Infrastructure

```bash
# Start RabbitMQ, Redis, and all services
docker-compose up -d

# Check logs
docker-compose logs -f

# Verify all services are healthy
docker-compose ps
```

#### 2. Test the System

**Submit a job:**
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "jobType": "email",
    "payload": {
      "to": "user@example.com",
      "subject": "Hello",
      "body": "Test email"
    }
  }'
```

**Check circuit breakers:**
```bash
curl http://localhost:3002/breakers
```

**View metrics:**
```bash
curl http://localhost:3002/metrics
```

**RabbitMQ Management UI:**
- URL: http://localhost:15672
- Username: `guest`
- Password: `guest`

#### 3. Trigger Circuit Breaker (Demo)

The worker has a simulated 20% failure rate. Submit many jobs to trigger the circuit breaker:

```bash
# Submit 20 jobs (will trigger circuit breaker)
for i in {1..20}; do
  curl -X POST http://localhost:3000/jobs \
    -H "Content-Type: application/json" \
    -d "{\"jobType\": \"email\", \"payload\": {\"id\": $i}}"
  sleep 0.5
done

# Check circuit breaker state
curl http://localhost:3002/breakers
```

After ~5 failures, you'll see the circuit breaker open for the `email` job type.

#### 4. Reset Circuit Breaker

```bash
curl -X POST http://localhost:3002/breakers/email/reset
```

#### 5. Stop Services

```bash
docker-compose down
```

---

### Kubernetes Deployment

#### 1. Setup Local Kubernetes Cluster

**Using Kind:**
```bash
kind create cluster --name job-system
kubectl cluster-info
```

**Using Minikube:**
```bash
minikube start --cpus=4 --memory=4096
kubectl config use-context minikube
```

#### 2. Build and Push Docker Images

First, build and tag images:

```bash
# Set your DockerHub username
export DOCKERHUB_USERNAME=your-username

# Build images
cd services/job-api
docker build -t $DOCKERHUB_USERNAME/job-api:latest .

cd ../worker
docker build -t $DOCKERHUB_USERNAME/worker:latest .

cd ../control-plane
docker build -t $DOCKERHUB_USERNAME/control-plane:latest .

cd ../..
```

Push to DockerHub:

```bash
docker login
docker push $DOCKERHUB_USERNAME/job-api:latest
docker push $DOCKERHUB_USERNAME/worker:latest
docker push $DOCKERHUB_USERNAME/control-plane:latest
```

#### 3. Update Kubernetes Manifests

Replace placeholder in K8s manifests:

```bash
sed -i '' "s|YOUR_DOCKERHUB_USERNAME|$DOCKERHUB_USERNAME|g" k8s/*.yaml
```

#### 4. Deploy to Kubernetes

```bash
# Apply in order
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/rabbitmq.yaml

# Wait for infrastructure
kubectl wait --for=condition=ready pod -l app=redis --timeout=120s
kubectl wait --for=condition=ready pod -l app=rabbitmq --timeout=120s

# Deploy services
kubectl apply -f k8s/job-api.yaml
kubectl apply -f k8s/worker.yaml
kubectl apply -f k8s/control-plane.yaml

# Wait for deployments
kubectl rollout status deployment/job-api
kubectl rollout status deployment/worker
kubectl rollout status deployment/control-plane
```

#### 5. Verify Deployment

```bash
# Check pods
kubectl get pods

# Check services
kubectl get svc

# View logs
kubectl logs -l app=worker --tail=50
```

#### 6. Access Services

**Port Forward (for local clusters):**

```bash
# Job API
kubectl port-forward svc/job-api 3000:3000

# Control Plane
kubectl port-forward svc/control-plane 3002:3002

# RabbitMQ Management UI
kubectl port-forward svc/rabbitmq 15672:15672
```

**For cloud clusters with LoadBalancer:**

```bash
# Get external IPs
kubectl get svc job-api control-plane
```

#### 7. Test on Kubernetes

```bash
# Submit job
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"jobType": "email", "payload": {"test": true}}'

# Check metrics
curl http://localhost:3002/metrics
```

#### 8. Cleanup

```bash
kubectl delete -f k8s/
kind delete cluster --name job-system  # or minikube delete
```

---

## CI/CD Pipeline

### CI Pipeline (Per Service)

Each service has its own CI pipeline that runs on:
- Push to `main` or `develop` branches
- Pull requests to `main`

**Pipeline Stages:**

1. **Checkout** - Clone repository
2. **Setup Runtime** - Install Node.js 20
3. **Linting** - Run ESLint for code quality
4. **Unit Tests** - Run Jest tests with coverage
5. **SAST** - CodeQL static analysis for security vulnerabilities
6. **Dependency Scan (SCA)** - `npm audit` for known vulnerabilities
7. **Build** - Compile TypeScript to JavaScript
8. **Docker Build** - Build container image
9. **Trivy Scan** - Scan Docker image for vulnerabilities
10. **Container Smoke Test** - Start container, verify health endpoint
11. **Push to DockerHub** - Only on `main` branch

**Security Features:**
- CodeQL detects security issues in code
- npm audit checks for vulnerable dependencies
- Trivy scans container images for CVEs
- Results uploaded to GitHub Security tab

### CD Pipeline

**Trigger:** Manual (`workflow_dispatch`)

**Steps:**
1. Apply ConfigMap
2. Deploy Redis & RabbitMQ
3. Wait for infrastructure readiness
4. Deploy Job API, Worker, Control Plane
5. Wait for deployment rollout
6. Run smoke tests:
   - Health check
   - Submit test job
   - Verify metrics endpoint
7. Display deployment info

---

### GitHub Secrets Required

Configure these in your GitHub repository:

```
Settings → Secrets and variables → Actions → New repository secret
```

| Secret | Description | Example |
|--------|-------------|---------|
| `DOCKERHUB_USERNAME` | Your DockerHub username | `johndoe` |
| `DOCKERHUB_TOKEN` | DockerHub access token | `dckr_pat_abc123...` |
| `KUBECONFIG` | Base64-encoded kubeconfig file | `cat ~/.kube/config \| base64` |

**Generate DockerHub Token:**
1. Login to DockerHub
2. Account Settings → Security → New Access Token
3. Copy token (only shown once)

---

## API Documentation

### Job API Service (Port 3000)

#### POST /jobs
Submit a new job for processing.

**Request:**
```json
{
  "jobType": "email",
  "payload": {
    "to": "user@example.com",
    "subject": "Hello",
    "body": "Message content"
  }
}
```

**Response:** 202 Accepted
```json
{
  "status": "accepted",
  "message": "Job queued for processing",
  "jobType": "email"
}
```

**Validation Rules:**
- `jobType` (required): Non-empty string
- `payload` (required): JSON object

#### GET /health
Health check endpoint.

**Response:** 200 OK
```json
{
  "status": "ok",
  "info": {
    "api": {
      "status": "up"
    }
  }
}
```

---

### Control Plane Service (Port 3002)

#### GET /breakers
View all circuit breakers and their state.

**Response:** 200 OK
```json
{
  "count": 2,
  "breakers": [
    {
      "jobType": "email",
      "state": "OPEN",
      "openedAt": 1704067200000,
      "cooldownElapsed": true
    },
    {
      "jobType": "sms",
      "state": "CLOSED"
    }
  ]
}
```

#### POST /breakers/:jobType/reset
Manually reset (close) a circuit breaker.

**Example:**
```bash
curl -X POST http://localhost:3002/breakers/email/reset
```

**Response:** 200 OK
```json
{
  "message": "Circuit breaker for 'email' has been reset",
  "jobType": "email"
}
```

**Error Response:** 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Circuit breaker for jobType 'email' not found"
}
```

#### GET /metrics
View system metrics.

**Response:** 200 OK
```json
{
  "circuitBreakers": {
    "total": 3,
    "open": 1,
    "closed": 2
  },
  "failures": {
    "byJobType": {
      "email": 15,
      "sms": 2
    }
  }
}
```

#### GET /health
Health check endpoint.

**Response:** 200 OK

---

## Configuration

### Environment Variables

**Job API Service:**
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | RabbitMQ connection URL |

**Worker Service:**
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP server port (health checks) |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | RabbitMQ connection URL |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `FAILURE_THRESHOLD` | `5` | Failures before opening circuit |
| `COOLDOWN_PERIOD` | `60` | Seconds before probe test |
| `MAX_RETRIES` | `3` | Max retry attempts before quarantine |
| `RETRY_DELAY_MS` | `5000` | Delay between retries (milliseconds) |

**Control Plane Service:**
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3002` | HTTP server port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `COOLDOWN_PERIOD` | `60` | Cooldown period (for display) |

### Modifying Configuration

**Docker Compose:**
Edit `docker-compose.yml` environment variables.

**Kubernetes:**
Edit `k8s/configmap.yaml` and reapply:
```bash
kubectl apply -f k8s/configmap.yaml
kubectl rollout restart deployment/worker
```

---

## Testing

### Unit Tests

Run tests for each service:

```bash
# Job API
cd services/job-api
npm test

# Worker
cd services/worker
npm test

# Control Plane
cd services/control-plane
npm test
```

### Integration Tests

```bash
# Start all services
docker-compose up -d

# Run integration test script
./test/integration-test.sh  # (You would create this)
```

### Load Testing

Use tools like **k6** or **Apache JMeter** to test:

```javascript
// k6 example
import http from 'k6/http';

export default function () {
  const payload = JSON.stringify({
    jobType: 'email',
    payload: { test: true }
  });

  http.post('http://localhost:3000/jobs', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

---

## Monitoring

### RabbitMQ Management UI

- **URL:** http://localhost:15672 (local) or `kubectl port-forward svc/rabbitmq 15672:15672`
- **Credentials:** `guest` / `guest`

**Monitor:**
- Queue depths (`jobs.main`, `jobs.retry`, `jobs.quarantine`)
- Message rates
- Consumer status

### Redis CLI

```bash
# Docker Compose
docker exec -it redis redis-cli

# Kubernetes
kubectl exec -it deployment/redis -- redis-cli

# View circuit breaker state
KEYS breaker:*
GET breaker:email

# View failure counters
KEYS failure:*
GET failure:email:API_TIMEOUT
```

### Kubernetes Monitoring

```bash
# Pod resource usage
kubectl top pods

# Logs
kubectl logs -l app=worker --tail=100 -f

# Describe pod for events
kubectl describe pod <pod-name>
```

### Production Recommendations

For production, integrate:
- **Prometheus** for metrics collection
- **Grafana** for dashboards
- **ELK Stack** or **Loki** for centralized logging
- **Jaeger** or **Zipkin** for distributed tracing
- **AlertManager** for alerting

---

## Troubleshooting

### Jobs not processing

**Check:**
1. RabbitMQ is running: `docker-compose ps rabbitmq`
2. Worker is consuming: Check RabbitMQ UI → Queues → consumers
3. Circuit breaker is closed: `curl http://localhost:3002/breakers`

**Fix:**
```bash
# Reset circuit breaker
curl -X POST http://localhost:3002/breakers/<jobType>/reset

# Restart worker
docker-compose restart worker
```

### Circuit breaker stuck open

**Check:**
1. Cooldown period elapsed: `curl http://localhost:3002/breakers`
2. Probe job succeeded: Check worker logs

**Fix:**
```bash
# Manually reset
curl -X POST http://localhost:3002/breakers/<jobType>/reset
```

### Redis connection errors

**Check:**
```bash
docker-compose ps redis
docker-compose logs redis
```

**Fix:**
```bash
docker-compose restart redis
```

---

## License

This project is created for educational and demonstration purposes.

---

## Authors

- **Your Name** - DevOps Engineer

---

## Acknowledgments

- Circuit breaker pattern inspired by Michael Nygard's "Release It!"
- RabbitMQ retry pattern based on best practices
- NestJS framework documentation

---

## Next Steps

To extend this project:

1. **Persistent Storage**: Add PostgreSQL for job metadata
2. **Job Scheduler**: Add cron-like scheduling with BullMQ
3. **Multi-tenancy**: Isolate jobs by tenant
4. **Priority Queues**: High/low priority routing
5. **Metrics Export**: Prometheus metrics endpoint
6. **Tracing**: OpenTelemetry integration
7. **Authentication**: API key or JWT auth
8. **Rate Limiting**: Prevent API abuse

---

**Questions or Issues?**
Open an issue on GitHub or contact the DevOps team.
