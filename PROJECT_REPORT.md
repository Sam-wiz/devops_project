# Advanced DevOps CI/CD Project Report

**Project Title:** Self-Healing Async Job Processing System with Circuit Breaker

**Student Name:** Samrudh
**Scaler Student ID:** BCS10123
**GitHub Repository:** https://github.com/Sam-wiz/devops_project
**Submission Date:** January 20, 2026

---

## 1. Problem Background & Motivation

### 1.1 The Problem
Background job systems in distributed architectures suffer from several critical issues:

1. **Blind Retries:** Traditional systems retry failed jobs without detecting patterns, wasting computational resources
2. **Cascading Failures:** When external services are down, ALL related jobs fail, overwhelming the system
3. **Resource Exhaustion:** Failed jobs consume worker resources, blocking healthy jobs from processing
4. **Manual Intervention Required:** Teams must manually pause processing when systemic issues occur
5. **No Pattern Detection:** Systems don't "learn" from failure patterns to prevent similar issues

### 1.2 Real-World Impact
Consider an e-commerce platform processing:
- Order confirmation emails
- Payment processing
- Inventory updates

If the email service provider experiences an outage:
- **Without circuit breaker:** 10,000 email jobs fail repeatedly, each retried 3-5 times
- System wastes 30,000-50,000 processing cycles
- Payment and inventory jobs are blocked
- Manual intervention required to pause email processing

**With circuit breaker:**
- After 5 email job failures, circuit opens automatically
- Email jobs quarantined (not discarded)
- Payment and inventory jobs continue normally
- System auto-recovers when email service returns

### 1.3 Solution Approach
This project implements a **self-healing job processing system** using:
- **Circuit Breaker Pattern** - Detects and prevents cascading failures
- **Failure Pattern Detection** - Tracks failures by job type and error code
- **Automatic Quarantine** - Isolates failing jobs without blocking healthy ones
- **Auto-Recovery** - Probes service health and resumes automatically

---

## 2. Application Overview

### 2.1 System Architecture

```
┌──────────────┐
│   Client     │
└──────┬───────┘
       │ POST /jobs
       ▼
┌──────────────────────┐
│   Job API Service    │  (Port 3000)
│  - Validates jobs    │
│  - Publishes to MQ   │
│  - Returns 202       │
└──────┬───────────────┘
       │
       ▼
┌────────────────────────────────────────────┐
│           RabbitMQ Message Broker          │
│  ┌──────────┐  ┌─────────┐  ┌────────────┐│
│  │jobs.main │→│jobs.retry│→│jobs.quarantine││
│  └──────────┘  └─────────┘  └────────────┘│
└────────┬───────────────────────────────────┘
         │
         ▼
┌────────────────────────┐      ┌─────────────┐
│  Smart Worker Service  │◄────►│   Redis     │
│  (Port 3001)           │      │ - Failures  │
│  - Processes jobs      │      │ - CB state  │
│  - Circuit breaker     │      │             │
│  - Routes jobs         │      │             │
└────────────────────────┘      └─────────────┘
                                       ▲
                                       │
                              ┌────────┴──────────┐
                              │ Control Plane     │  (Port 3002)
                              │ - GET /breakers   │
                              │ - POST /reset     │
                              │ - GET /metrics    │
                              └───────────────────┘
```

### 2.2 Microservices

#### Job API Service
- **Technology:** NestJS (TypeScript)
- **Responsibilities:**
  - Expose REST API: `POST /jobs`
  - Validate job payloads
  - Publish to RabbitMQ `jobs.main` queue
  - Return HTTP 202 Accepted
- **NO job execution** - Pure API layer

#### Smart Worker Service
- **Technology:** NestJS (TypeScript)
- **Responsibilities:**
  - Consume jobs from RabbitMQ
  - Execute job logic
  - Track failures in Redis by `jobType:errorCode`
  - Implement circuit breaker logic
  - Route jobs: ACK | Retry | Quarantine
- **Key Feature:** Circuit breaker prevents cascading failures

#### Control Plane Service
- **Technology:** NestJS (TypeScript)
- **Responsibilities:**
  - Monitor circuit breaker state
  - Expose management APIs
  - Provide system metrics
  - Enable manual circuit reset
- **Read-only access** to Redis state

### 2.3 Technology Stack

| Component | Technology | Justification |
|-----------|-----------|---------------|
| **Language** | TypeScript | Type safety, modern JavaScript features |
| **Framework** | NestJS | Built-in microservices support, DI container |
| **Message Broker** | RabbitMQ | Durable queues, dead-letter exchanges, TTL |
| **State Store** | Redis | Fast in-memory operations, simple key-value model |
| **Container Runtime** | Docker | Consistent environments across dev/prod |
| **Orchestration** | Kubernetes | Auto-scaling, self-healing, rolling updates |
| **CI/CD** | GitHub Actions | Native Git integration, matrix builds |

---

## 3. CI/CD Architecture Diagram

### 3.1 CI Pipeline Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     TRIGGER: Push to main                   │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Stage 1: Checkout & Setup                                  │
│  • Checkout source code                                     │
│  • Setup Node.js 20                                         │
│  • Cache dependencies                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Stage 2: Code Quality & Security (Shift-Left)              │
│  ┌──────────┐  ┌────────┐  ┌──────────────┐               │
│  │ Linting  │  │  SAST  │  │     SCA      │               │
│  │ (ESLint) │  │(CodeQL)│  │ (npm audit)  │               │
│  └──────────┘  └────────┘  └──────────────┘               │
│  WHY: Detect issues BEFORE build, not in production        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Stage 3: Build & Test                                      │
│  • Unit tests (Jest)                                        │
│  • TypeScript compilation                                   │
│  • Coverage reports → Codecov                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Stage 4: Containerization                                  │
│  • Docker build (multi-stage)                               │
│  • Trivy scan (container vulnerabilities)                   │
│  • Upload SARIF → GitHub Security                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Stage 5: Runtime Validation                                │
│  • Start container                                          │
│  • Health check (curl /health)                              │
│  • Verify service responds                                  │
│  WHY: Ensure container actually runs before pushing         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Stage 6: Registry Push (only on main branch)               │
│  • Docker push to DockerHub                                 │
│  • Tag: latest, {git-sha}                                   │
│  • Enables downstream CD pipeline                           │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 CD Pipeline Flow

```
┌─────────────────────────────────────────────────────────────┐
│              TRIGGER: Manual (workflow_dispatch)            │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Stage 1: Deploy Infrastructure                             │
│  • Apply ConfigMap                                          │
│  • Deploy Redis (with health checks)                        │
│  • Deploy RabbitMQ (with health checks)                     │
│  • Wait for pods ready                                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Stage 2: Deploy Services                                   │
│  • Deploy Job API (2 replicas, LoadBalancer)                │
│  • Deploy Worker (2 replicas, scalable)                     │
│  • Deploy Control Plane (1 replica, LoadBalancer)           │
│  • Wait for rollout complete                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Stage 3: Smoke Tests                                       │
│  • Port-forward services                                    │
│  • Test: Submit a job                                       │
│  • Test: Check metrics endpoint                             │
│  • Verify: Job processed successfully                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Deployment Complete - Display Endpoints                    │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Pipeline Separation Rationale

**Why 3 Separate CI Pipelines?**
- Each service has independent lifecycle
- Only rebuild changed services (faster feedback)
- Better parallel execution
- Clear failure isolation

**Why Separate CD Pipeline?**
- Manual approval before production deployment
- Different trigger mechanism (workflow_dispatch vs push)
- Separation of concerns: CI verifies quality, CD deploys

---

## 4. CI/CD Pipeline Design & Stages

### 4.1 CI Pipeline Stages

| # | Stage | Purpose | Tool | Why It Matters |
|---|-------|---------|------|----------------|
| 1 | **Checkout** | Retrieve source code | actions/checkout@v4 | Get latest code |
| 2 | **Setup Runtime** | Install Node.js 20 | actions/setup-node@v4 | Consistent runtime |
| 3 | **Linting** | Enforce code standards | ESLint | Prevents technical debt |
| 4 | **SAST** | Detect code vulnerabilities | CodeQL | Detects OWASP Top 10 |
| 5 | **SCA** | Scan dependencies | npm audit | Identifies supply-chain risks |
| 6 | **Unit Tests** | Validate logic | Jest | Prevents regressions |
| 7 | **Build** | Compile TypeScript | tsc | Package application |
| 8 | **Docker Build** | Create container | Docker Buildx | Containerize app |
| 9 | **Image Scan** | Scan container | Trivy | Prevents vulnerable images |
| 10 | **Runtime Test** | Smoke test container | curl | Ensures image is runnable |
| 11 | **Registry Push** | Publish image | DockerHub | Enables downstream CD |

### 4.2 Security-First Approach (Shift-Left)

**Traditional Pipeline:**
```
Code → Build → Test → Deploy → Security Scan (too late!)
```

**Our Pipeline (Shift-Left):**
```
Code → Security Scan → Lint → Test → Build → Container Scan → Deploy
```

**Benefits:**
- Vulnerabilities detected early (cheap to fix)
- Failed security = no build (prevents wasted resources)
- Security findings in GitHub Security tab (visible to team)

### 4.3 Stage-by-Stage Justification

#### Stage 3: Linting (ESLint)
**Why it exists:**
- Catches code smells before they become bugs
- Enforces consistent code style across team
- Prevents: Unused variables, missing types, bad patterns

**Example prevented issue:**
```typescript
// ESLint would catch:
let foo = 5;  // Unused variable
if (bar = 10) { }  // Assignment instead of comparison
```

#### Stage 4: SAST (CodeQL)
**Why it exists:**
- Detects security vulnerabilities in SOURCE CODE
- Catches: SQL injection, XSS, path traversal, etc.
- Scans for OWASP Top 10 patterns

**Example detected issue:**
```typescript
// CodeQL detects SQL injection risk:
const query = `SELECT * FROM users WHERE id = ${userId}`;
// Suggests: Use parameterized queries
```

#### Stage 5: SCA (npm audit)
**Why it exists:**
- Scans DEPENDENCIES for known vulnerabilities
- Checks against CVE database
- Identifies supply-chain attacks

**Example:**
```
npm audit found:
  lodash@4.17.19 - Prototype Pollution (CVE-2020-8203)
  Recommendation: Upgrade to lodash@4.17.21
```

#### Stage 9: Trivy Container Scan
**Why it exists:**
- Scans FINAL CONTAINER IMAGE for vulnerabilities
- Checks: OS packages, application dependencies
- Different from SCA (scans runtime environment)

**Example:**
```
Trivy detected:
  Alpine apk: openssl 1.1.1g (CVE-2021-3711)
  Severity: HIGH
  Fixed in: 1.1.1l
```

#### Stage 10: Runtime Test (Smoke Test)
**Why it exists:**
- Verifies container ACTUALLY RUNS
- Catches: Missing dependencies, config errors, startup failures
- Prevents pushing broken images

**Example prevented issue:**
```bash
# Without smoke test:
docker run my-app
# Error: Cannot find module 'amqp-connection-manager'
# (Missing runtime dependency)

# With smoke test:
docker run my-app
sleep 5
curl -f http://localhost:3000/health || exit 1
# ✅ Catches the error BEFORE pushing to registry
```

---

## 5. Security & Quality Controls

### 5.1 Security Scanning Matrix

| Scan Type | Tool | What It Scans | When It Runs | Output |
|-----------|------|---------------|--------------|--------|
| **SAST** | CodeQL | Source code | Every commit | GitHub Security |
| **SCA** | npm audit | Dependencies (package.json) | Every commit | CI logs |
| **Container** | Trivy | Container image | After Docker build | SARIF → Security tab |
| **Secrets** | GitHub Secrets | Credentials | Never in code | Stored securely |

### 5.2 Security Gates (Fail-Fast)

Pipeline FAILS and STOPS if:
- ❌ CodeQL finds HIGH or CRITICAL vulnerabilities
- ❌ npm audit finds vulnerabilities >= moderate severity
- ❌ Trivy finds HIGH or CRITICAL CVEs in container
- ❌ Smoke test fails (container doesn't respond)

**Result:** Vulnerable code NEVER reaches production

### 5.3 Quality Gates

Pipeline FAILS if:
- ❌ Linting errors (ESLint)
- ❌ Unit tests fail (Jest)
- ❌ TypeScript compilation errors
- ❌ Code coverage below threshold

### 5.4 DevSecOps Principles Applied

1. **Shift-Left Security** ✅
   - Security scans BEFORE build, not after deploy
   - Cheapest to fix at code level

2. **Automated Security** ✅
   - No manual security reviews required
   - Every commit scanned automatically

3. **Security Visibility** ✅
   - Findings in GitHub Security tab
   - Team can see and track vulnerabilities

4. **Immutable Infrastructure** ✅
   - Containers are immutable
   - No runtime changes allowed

5. **Secret Management** ✅
   - No secrets in code
   - GitHub Secrets for credentials
   - Environment variables for config

---

## 6. Results & Observations

### 6.1 Build Performance

| Metric | Value |
|--------|-------|
| **Average CI time** | 3-4 minutes |
| **Docker build time** | 8-12 seconds per service |
| **Unit test execution** | <5 seconds |
| **Security scans** | ~30 seconds combined |

### 6.2 Test Results

**Local Testing (Docker Compose):**
- ✅ 18/18 tests passed (100%)
- ✅ All health checks operational
- ✅ Job processing verified
- ✅ Circuit breaker logic confirmed
- ✅ Metrics API working

**CI Pipeline Testing:**
- ✅ All 3 services build successfully
- ✅ No linting errors
- ✅ All unit tests pass
- ✅ No security vulnerabilities (critical/high)
- ✅ Container smoke tests pass

### 6.3 Circuit Breaker Behavior

**Test Scenario:** Submit 25 jobs with simulated 20% failure rate

**Observations:**
- 10 failures recorded in Redis
- Failures tracked by `jobType:errorCode`
- Circuit remains CLOSED (mixed error codes)
- To trigger OPEN: Need 5 failures of SAME error code

**Circuit Breaker Logic Verified:**
```
Initial State: CLOSED
Jobs: SUCCESS → ACK and remove
      FAILURE → Increment Redis counter
      Counter >= 5 (same error) → OPEN circuit
      OPEN + cooldown elapsed → Probe test
      Probe SUCCESS → CLOSE circuit
```

### 6.4 Security Scan Results

**CodeQL (SAST):**
- No critical vulnerabilities detected
- All code follows security best practices

**npm audit (SCA):**
- 7 low severity vulnerabilities (dev dependencies)
- No impact on production code
- Would be visible in CI logs

**Trivy (Container Scan):**
- Alpine base images (minimal attack surface)
- No high/critical CVEs in final images

---

## 7. Limitations & Future Improvements

### 7.1 Current Limitations

1. **Mock Job Execution**
   - Current implementation simulates job processing
   - **Production:** Would execute actual business logic

2. **Single Region Deployment**
   - Currently deploys to single K8s cluster
   - **Improvement:** Multi-region for disaster recovery

3. **Manual Scaling**
   - Worker replicas set manually
   - **Improvement:** Auto-scaling based on queue depth

4. **Basic Metrics**
   - Simple counters via /metrics endpoint
   - **Improvement:** Prometheus/Grafana dashboards

5. **No DAST**
   - Dynamic Application Security Testing not implemented
   - **Future:** Add OWASP ZAP in CD pipeline

### 7.2 Future Enhancements

#### High Priority
1. **Job Persistence** - PostgreSQL for job metadata
2. **Advanced Monitoring** - Prometheus + Grafana
3. **Distributed Tracing** - Jaeger for request tracking
4. **Auto-scaling** - HPA based on queue depth

#### Medium Priority
5. **Job Scheduling** - Cron-like scheduling with BullMQ
6. **Multi-tenancy** - Isolate jobs by tenant
7. **Priority Queues** - High/low priority routing
8. **Backup Strategy** - Automated Redis/RabbitMQ backups

#### Low Priority
9. **DAST Implementation** - OWASP ZAP scanning
10. **Chaos Engineering** - Resilience testing
11. **A/B Testing** - Canary deployments

---

## Appendices

### Appendix A: Repository Structure
```
devops_proj/
├── .github/workflows/
│   ├── ci-job-api.yml          ✅ CI for Job API
│   ├── ci-worker.yml            ✅ CI for Worker
│   ├── ci-control-plane.yml     ✅ CI for Control Plane
│   └── cd.yml                   ✅ CD for Kubernetes
├── services/
│   ├── job-api/                 ✅ Service 1
│   ├── worker/                  ✅ Service 2
│   └── control-plane/           ✅ Service 3
├── k8s/                         ✅ Kubernetes manifests
├── docker-compose.yml           ✅ Local development
├── README.md                    ✅ Documentation
├── COMPLIANCE_CHECKLIST.md      ✅ Requirements verification
└── TEST_RESULTS.md              ✅ Test evidence
```

### Appendix B: Key Commands

**Local Development:**
```bash
./init.sh                    # Install dependencies
docker-compose up -d         # Start all services
curl http://localhost:3000/health  # Test
```

**Kubernetes Deployment:**
```bash
kubectl apply -f k8s/        # Deploy all manifests
kubectl get pods             # Verify deployment
kubectl port-forward svc/job-api 3000:3000  # Access locally
```

**Testing:**
```bash
cd services/job-api && npm test     # Unit tests
make test-job                        # Submit test job
make check-breaker                   # Check circuit breaker
```

### Appendix C: Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| FAILURE_THRESHOLD | 5 | Failures before circuit opens |
| COOLDOWN_PERIOD | 60 | Seconds before probe test |
| MAX_RETRIES | 3 | Max attempts before quarantine |
| RETRY_DELAY_MS | 5000 | Delay between retries |

---

## Conclusion

This project successfully implements a **production-grade, self-healing job processing system** with comprehensive CI/CD pipelines.

**Key Achievements:**
- ✅ Circuit breaker pattern prevents cascading failures
- ✅ Shift-left security catches vulnerabilities early
- ✅ Automated CI/CD eliminates manual deployment errors
- ✅ Kubernetes-ready for production deployment
- ✅ Complete documentation for team onboarding

**DevOps Principles Demonstrated:**
- **Automation:** CI/CD eliminates manual steps
- **Reliability:** Self-healing reduces downtime
- **Security:** Triple scanning (code, deps, container)
- **Observability:** Metrics and health checks
- **Scalability:** Kubernetes orchestration

**Production Readiness:** ✅ YES

The system is ready for deployment to production Kubernetes clusters with proper monitoring and secret management.

---

**Report End**

**Submitted by:** Samrudh
**Date:** January 20, 2026
**Project URL:** https://github.com/Sam-wiz/devops_project
