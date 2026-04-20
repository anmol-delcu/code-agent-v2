# Delcu Code Agent — Architecture Check-in

Concise architecture review for stakeholder check-in. AWS-first, with GCP cost comparison.

---

## 1. System Context

```mermaid
flowchart LR
    U([👤 User]):::user
    DEV([👨‍💻 Engineer]):::user
    DCA[Delcu Code Agent<br/>Next.js + Bun API + Sandboxes]:::system
    AI[Anthropic API]:::ext
    GH[GitHub]:::ext
    CL[☁️ Cloud · AWS / GCP]:::ext

    U -->|HTTPS| DCA
    DCA -->|LLM calls| AI
    DEV -->|git push| GH
    GH -->|deploy| CL
    DCA -.runs on.-> CL

    classDef user fill:#FDE68A,stroke:#92400E,color:#1F2937,stroke-width:2px
    classDef system fill:#4F46E5,stroke:#312E81,color:#FFFFFF,stroke-width:2px
    classDef ext fill:#E5E7EB,stroke:#4B5563,color:#1F2937,stroke-width:2px
```

---

## 2. High-Level Architecture

```mermaid
flowchart TB
    U([User Browser]):::user

    subgraph Edge["🌐 Edge"]
        DNS[DNS + CDN + WAF + TLS]:::edge
    end

    subgraph App["⚙️ Application Tier"]
        FE[Frontend<br/>Next.js · auto-scaled]:::app
        BE[Backend API<br/>Bun · auto-scaled]:::app
    end

    subgraph Sandbox["📦 Per-Project Sandbox Tier"]
        SBX[Isolated container per project<br/>spawned on demand]:::sbx
    end

    subgraph Data["💾 Data Tier"]
        DB[(Postgres · HA)]:::data
        RD[(Redis cache)]:::data
        FS[(Shared file store<br/>per-project)]:::data
        OBJ[(Object storage<br/>snapshots)]:::data
    end

    AI[Anthropic API]:::ext

    U --> DNS --> FE
    DNS --> BE
    BE --> DB
    BE --> RD
    BE -.spawns.-> SBX
    SBX --- FS
    SBX -.snapshot.-> OBJ
    BE --> AI
    SBX --> AI

    classDef user fill:#FDE68A,stroke:#92400E,color:#1F2937,stroke-width:2px
    classDef edge fill:#FCA5A5,stroke:#991B1B,color:#1F2937,stroke-width:2px
    classDef app fill:#93C5FD,stroke:#1E40AF,color:#1F2937,stroke-width:2px
    classDef sbx fill:#C4B5FD,stroke:#5B21B6,color:#1F2937,stroke-width:2px
    classDef data fill:#86EFAC,stroke:#166534,color:#1F2937,stroke-width:2px
    classDef ext fill:#E5E7EB,stroke:#4B5563,color:#1F2937,stroke-width:2px
```

---

## 3. Sandbox Spawn — Block Diagram

```mermaid
flowchart LR
    A[Backend API]:::app
    B[Container<br/>Orchestrator]:::ctrl
    C[Image<br/>Registry]:::store
    D[Sandbox<br/>Task]:::sbx
    E[Service<br/>Discovery]:::ctrl
    F[Cache<br/>id → IP]:::data
    G[Per-project<br/>File Store]:::store

    A -->|① RunTask| B
    B -->|② pull image| C
    B -->|③ launch| D
    D -->|④ register| E
    A -->|⑤ resolve| E
    A -->|⑥ cache IP| F
    D -->|⑦ mount /workspace| G

    classDef app fill:#93C5FD,stroke:#1E40AF,color:#1F2937,stroke-width:2px
    classDef ctrl fill:#FBBF24,stroke:#92400E,color:#1F2937,stroke-width:2px
    classDef sbx fill:#C4B5FD,stroke:#5B21B6,color:#1F2937,stroke-width:2px
    classDef store fill:#FDA4AF,stroke:#9F1239,color:#1F2937,stroke-width:2px
    classDef data fill:#86EFAC,stroke:#166534,color:#1F2937,stroke-width:2px
```

---

## 4. CI/CD Pipeline

```mermaid
flowchart LR
    Dev([git push main]):::user
    GHA[GitHub Actions]:::ci
    T{lint · type · test}:::gate
    BLD[docker build × 3]:::ci
    REG[Image Registry push]:::store
    DEP[Blue/Green Deploy]:::ci
    CAN{10% canary · 5 min}:::gate
    OK[100% shift]:::ok
    RB[Auto rollback]:::fail

    Dev --> GHA --> T
    T -- fail --> X([block]):::fail
    T -- pass --> BLD --> REG --> DEP --> CAN
    CAN -- alarms ok --> OK
    CAN -- alarms fire --> RB

    classDef user fill:#FDE68A,stroke:#92400E,color:#1F2937,stroke-width:2px
    classDef ci fill:#93C5FD,stroke:#1E40AF,color:#1F2937,stroke-width:2px
    classDef gate fill:#FBBF24,stroke:#92400E,color:#1F2937,stroke-width:2px
    classDef store fill:#FDA4AF,stroke:#9F1239,color:#1F2937,stroke-width:2px
    classDef ok fill:#86EFAC,stroke:#166534,color:#1F2937,stroke-width:2px
    classDef fail fill:#FCA5A5,stroke:#991B1B,color:#1F2937,stroke-width:2px
```

---

## 5. Data Model (post-migration)

```mermaid
erDiagram
    USERS ||--o{ PROJECTS : owns
    USERS ||--o{ SESSIONS : has
    PROJECTS ||--o{ SESSIONS : context

    USERS {
        uuid id PK
        text email UK
        text password_hash
        text name
        timestamptz created_at
    }
    PROJECTS {
        uuid id PK
        uuid user_id FK
        text name
        text task_arn "active sandbox handle"
        text fs_handle "file-store mount id"
        timestamptz created_at
        timestamptz updated_at
    }
    SESSIONS {
        uuid id PK
        uuid user_id FK
        uuid project_id FK
        jsonb messages
        timestamptz created_at
        timestamptz updated_at
    }
```

---

## 6. Blast-Radius / Failure Domains

```mermaid
flowchart TB
    G[🌍 Account / IAM]:::g
    subgraph Region["📍 Single Region (us-east-1 / us-central1)"]
        AZa["AZ-a · primary<br/>FE · BE · DB primary"]:::warn
        AZb["AZ-b · standby<br/>FE · BE · DB standby"]:::ok
        AZc["AZ-c<br/>FE · BE"]:::ok
    end
    G --> Region

    classDef g fill:#FCA5A5,stroke:#991B1B,color:#1F2937,stroke-width:2px
    classDef warn fill:#FBBF24,stroke:#92400E,color:#1F2937,stroke-width:2px
    classDef ok fill:#86EFAC,stroke:#166534,color:#1F2937,stroke-width:2px
```

| Failure | Auto-recover | RTO |
|---|---|---|
| Single app task | Orchestrator reschedules | < 30 s |
| Single AZ | LB drains AZ, DB failover | < 2 min |
| DB corruption | Point-in-time restore | < 30 min |
| Region | Manual DR | < 1 h (acceptable for v1) |

---

## 7. Cost — AWS

| Tier | Small (~50 DAU) | Scale (~1k DAU / 50 sbx) |
|---|---|---|
| Fargate FE + BE | $42 | $180 |
| Sandbox tasks (Spot) | $10 | $250 |
| RDS Postgres | $30 | $280 |
| ElastiCache Redis | $13 | $110 |
| ALB × 2 + NAT | $67 | $90 |
| EFS / S3 / CloudWatch / WAF | $20 | $80 |
| **Total / mo** | **~$182** | **~$990** |

**Knobs:** Fargate Spot −70 % · Single-AZ RDS −50 % · VPC endpoints −$30 · 1-yr Savings Plan −25 %

---

## 8. Cost — GCP

| Tier | Small (~50 DAU) | Scale (~1k DAU / 50 sbx) |
|---|---|---|
| Cloud Run FE + BE | $35 | $200 |
| Cloud Run sandboxes | $15 | $300 |
| Cloud SQL Postgres (HA) | $50 | $300 |
| Memorystore Redis | $35 | $150 |
| Filestore (Basic HDD)* | $200 | $400 |
| Cloud Load Balancing | $20 | $50 |
| Cloud NAT | $32 | $40 |
| Logging / Storage / Armor | $20 | $80 |
| **Total / mo** | **~$407** | **~$1,520** |

\* Filestore minimum is 1 TB → expensive at small scale. Drop it and use **GCS + Persistent Disk** per sandbox to cut **~$200/mo** small, **~$300/mo** scale.

**Knobs:** Cloud Run min-instances=0 −40 % on idle · Spot VMs for sandboxes −70 % · Committed-use discount −25 % · Skip Filestore (above)

### AWS vs GCP — side by side

| Scale | AWS | GCP (with Filestore) | GCP (PD + GCS) |
|---|---|---|---|
| Small | $182 | $407 | ~$207 |
| Scale | $990 | $1,520 | ~$1,220 |

> **Verdict:** AWS is cheaper at every scale here, primarily because Fargate ephemeral storage + EFS access points are cheaper than Cloud Run + Filestore. GCP wins on operational simplicity (Cloud Run scale-to-zero per sandbox is nicer than Fargate `RunTask`).

---

## 9. Decisions Locked In for v1

| Topic | Decision |
|---|---|
| **Multi-region** | ❌ Not required. Single region. |
| **Auth** | ✅ Keep existing JWT (basic auth). No Cognito / Identity Platform. |
| **Sandbox quotas** | ⏭ Defer until after v1 release. Monitor in production. |
| **IaC tool** | ⚠️ TBD — Terraform vs CDK vs Pulumi. Recommend deciding before Phase 0 starts. |
| **Cloud** | ⚠️ AWS recommended on cost. Final call pending. |

---

## 10. Cloud Service Mapping

| Layer | AWS | GCP |
|---|---|---|
| DNS | Route 53 | Cloud DNS |
| CDN / TLS | CloudFront + ACM | Cloud CDN + managed certs |
| WAF | AWS WAF | Cloud Armor |
| Load balancer | ALB | Cloud Load Balancing |
| App compute | ECS Fargate | Cloud Run |
| Sandbox compute | ECS Fargate (RunTask) | Cloud Run (per-service) |
| Service discovery | Cloud Map | Cloud Run URLs |
| Database | RDS Postgres | Cloud SQL Postgres |
| Cache | ElastiCache | Memorystore |
| File store | EFS | Filestore / PD |
| Object store | S3 | GCS |
| Image registry | ECR | Artifact Registry |
| Secrets | Secrets Manager | Secret Manager |
| Logs / Traces | CloudWatch + X-Ray | Cloud Logging + Trace |
| CI/CD deploy | CodeDeploy | Cloud Deploy |
