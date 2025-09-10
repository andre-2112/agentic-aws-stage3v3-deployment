# Agentic Stage-3-Version-3 Deployment Plan

## Overview
This document outlines the comprehensive deployment plan for the Agentic infrastructure Stage-3-Version-3, implementing a fully redeployable, scalable, and secure architecture using modern Infrastructure as Code practices.

---

## 🎯 Project Objectives

### Primary Goals
1. **Redeployable Infrastructure**: No hardcoded values, fully configurable
2. **Secrets Management**: AWS Secrets Manager integration for credentials
3. **Auto-Scaling**: ECS service auto-scaling with target tracking
4. **Subdomain Architecture**: Using `stage3v3.a-g-e-n-t-i-c.com`
5. **End-to-End Testing**: Complete verification before completion

### Architecture Improvements Over Agentic v1
- Dynamic resource naming with configurable parameters
- Secrets Manager for database credentials (no hardcoded passwords)
- ECS auto-scaling policies for dynamic load handling
- Pulumi configuration-driven deployment
- Comprehensive documentation and operational guides

---

## 🏗️ Infrastructure Architecture

```
Internet → Route53(stage3v3.a-g-e-n-t-i-c.com) → Public ALB → Node.js Containers (Public Subnets)
                                                                            ↓
                                            Internal ALB → FastAPI Containers (Private Subnets)
                                                                            ↓
                                                      PostgreSQL RDS (Primary + Read Replica)
                                                                            ↑
                                                      AWS Secrets Manager (DB Credentials)
```

---

## 📋 AWS Resources Inventory & Naming Strategy

### Resource Naming Convention
**Pattern**: `{project}-{environment}-{resource-type}-{unique-suffix}`
- **Project**: `agentic-aws-stage3v3`
- **Environment**: `stage3v3`
- **Unique Suffix**: Dynamic timestamp or Pulumi-generated

### 1. VPC & Networking Resources

#### VPC
- **Name**: `agentic-aws-stage3v3-vpc`
- **CIDR**: `10.1.0.0/16` (different from previous deployments to avoid conflicts)
- **DNS Resolution**: Enabled
- **DNS Hostnames**: Enabled

#### Subnets (6 total)
- **Public Subnets (2)**:
  - `agentic-aws-stage3v3-public-subnet-1` → `10.1.1.0/24` (us-east-1a)
  - `agentic-aws-stage3v3-public-subnet-2` → `10.1.2.0/24` (us-east-1b)
  
- **Private Subnets (2)**:
  - `agentic-aws-stage3v3-private-subnet-1` → `10.1.3.0/24` (us-east-1a)
  - `agentic-aws-stage3v3-private-subnet-2` → `10.1.4.0/24` (us-east-1b)
  
- **Database Subnets (2)**:
  - `agentic-aws-stage3v3-db-subnet-1` → `10.1.5.0/24` (us-east-1a)
  - `agentic-aws-stage3v3-db-subnet-2` → `10.1.6.0/24` (us-east-1b)

#### Gateways & Routing
- **Internet Gateway**: `agentic-aws-stage3v3-igw`
- **NAT Gateway**: `agentic-aws-stage3v3-nat`
- **Elastic IP**: `agentic-aws-stage3v3-nat-eip`
- **Route Tables**:
  - `agentic-aws-stage3v3-public-rt`
  - `agentic-aws-stage3v3-private-rt`
  - `agentic-aws-stage3v3-db-rt`

### 2. Security Groups (5 total)

- **Public ALB SG**: `agentic-aws-stage3v3-public-alb-sg`
  - Inbound: 80, 443 from 0.0.0.0/0
  - Outbound: All traffic
  
- **Internal ALB SG**: `agentic-aws-stage3v3-internal-alb-sg`
  - Inbound: 80 from Node.js SG
  - Outbound: All traffic
  
- **Node.js SG**: `agentic-aws-stage3v3-nodejs-sg`
  - Inbound: 3000 from Public ALB SG
  - Outbound: All traffic
  
- **FastAPI SG**: `agentic-aws-stage3v3-fastapi-sg`
  - Inbound: 8000 from Internal ALB SG
  - Outbound: All traffic
  
- **Database SG**: `agentic-aws-stage3v3-db-sg`
  - Inbound: 5432 from FastAPI SG
  - Outbound: None

### 3. RDS Database (2 instances)

- **Primary Instance**: `agentic-aws-stage3v3-primary`
  - Engine: PostgreSQL 15.13
  - Instance Class: `db.t3.medium` (configurable)
  - Storage: 20GB GP3, auto-scaling to 100GB
  - Multi-AZ: Yes
  - Backup: 7 days retention
  
- **Read Replica**: `agentic-aws-stage3v3-replica`
  - Source: Primary instance
  - Same configuration as primary
  
- **Supporting Resources**:
  - **DB Subnet Group**: `agentic-aws-stage3v3-db-subnet-group`
  - **DB Parameter Group**: `agentic-aws-stage3v3-db-parameter-group`

### 4. AWS Secrets Manager

- **Database Master Secret**: `agentic-aws/stage3v3/database/master`
  - Username: postgres
  - Password: Auto-generated secure password
  - Host: Dynamic (RDS endpoint)
  - Port: 5432
  - Database: agentic_aws_db

### 5. ECR Repositories (2 total)

- **FastAPI Repository**: `agentic-aws-stage3v3-fastapi`
  - URI: `{account-id}.dkr.ecr.us-east-1.amazonaws.com/agentic-aws-stage3v3-fastapi`
  
- **Node.js Repository**: `agentic-aws-stage3v3-nodejs`
  - URI: `{account-id}.dkr.ecr.us-east-1.amazonaws.com/agentic-aws-stage3v3-nodejs`

### 6. ECS Infrastructure

#### ECS Cluster
- **Name**: `agentic-aws-stage3v3-cluster`
- **Launch Type**: Fargate
- **Container Insights**: Enabled

#### Task Definitions
- **FastAPI Task**: `agentic-aws-stage3v3-fastapi-task`
  - CPU: 512 (.5 vCPU) - configurable
  - Memory: 1024MB (1GB) - configurable
  - Image: Dynamic ECR reference
  - Secrets: Database credentials from Secrets Manager
  
- **Node.js Task**: `agentic-aws-stage3v3-nodejs-task`
  - CPU: 512 (.5 vCPU) - configurable
  - Memory: 1024MB (1GB) - configurable
  - Image: Dynamic ECR reference
  - Environment: FASTAPI_URL from Internal ALB

#### ECS Services
- **FastAPI Service**: `agentic-aws-stage3v3-fastapi-service`
  - Desired Count: 2 (configurable)
  - Auto-Scaling: Target tracking (CPU 70%, Memory 80%)
  - Min Capacity: 1, Max Capacity: 10
  
- **Node.js Service**: `agentic-aws-stage3v3-nodejs-service`
  - Desired Count: 2 (configurable)  
  - Auto-Scaling: Target tracking (CPU 70%, Memory 80%)
  - Min Capacity: 1, Max Capacity: 10

### 7. Application Load Balancers (2 total)

#### Public ALB
- **Name**: `agentic-aws-stage3v3-public-alb`
- **Scheme**: Internet-facing
- **Subnets**: Public subnets
- **Target Group**: `agentic-aws-stage3v3-nodejs-tg` (port 3000)
- **Listeners**:
  - HTTP (80) → Redirect to HTTPS
  - HTTPS (443) → Forward to Node.js TG

#### Internal ALB
- **Name**: `agentic-aws-stage3v3-internal-alb`
- **Scheme**: Internal
- **Subnets**: Private subnets
- **Target Group**: `agentic-aws-stage3v3-fastapi-tg` (port 8000)
- **Listeners**:
  - HTTP (80) → Forward to FastAPI TG

### 8. CloudWatch Resources

#### Log Groups
- **FastAPI Logs**: `agentic-aws-stage3v3-fastapi-logs`
  - Retention: 14 days (configurable)
  
- **Node.js Logs**: `agentic-aws-stage3v3-nodejs-logs`
  - Retention: 14 days (configurable)

#### Auto-Scaling Alarms
- **FastAPI CPU Alarm**: `agentic-aws-stage3v3-fastapi-cpu-high`
- **FastAPI Memory Alarm**: `agentic-aws-stage3v3-fastapi-memory-high`
- **Node.js CPU Alarm**: `agentic-aws-stage3v3-nodejs-cpu-high`
- **Node.js Memory Alarm**: `agentic-aws-stage3v3-nodejs-memory-high`

### 9. Route 53 DNS

#### Hosted Zone
- **Domain**: `a-g-e-n-t-i-c.com` (assumed to exist)

#### DNS Records
- **A Record**: `stage3v3.a-g-e-n-t-i-c.com`
  - Type: Alias to Public ALB
  - TTL: 300 seconds

### 10. SSL Certificate

#### ACM Certificate
- **Domain**: `stage3v3.a-g-e-n-t-i-c.com`
- **SAN**: `*.a-g-e-n-t-i-c.com` (if wildcard needed)
- **Validation**: DNS validation
- **Usage**: Public ALB HTTPS listener

### 11. IAM Resources

#### ECS Roles
- **Task Execution Role**: `agentic-aws-stage3v3-task-execution-role`
  - ECR pull permissions
  - CloudWatch logs write permissions
  - Secrets Manager read permissions
  
- **Task Role**: `agentic-aws-stage3v3-task-role`
  - Minimal runtime permissions
  - Secrets Manager read permissions

#### Auto-Scaling Role
- **Application Auto-Scaling Role**: `agentic-aws-stage3v3-autoscaling-role`
  - ECS service scaling permissions
  - CloudWatch metrics read permissions

---

## 🔧 Redeployable Infrastructure Strategy

### 1. Pulumi Configuration Approach

#### Configuration Parameters (pulumi config set)
```bash
# Core Infrastructure
pulumi config set project-name agentic-aws-stage3v3
pulumi config set environment stage3v3
pulumi config set aws:region us-east-1

# Networking
pulumi config set vpc-cidr 10.1.0.0/16
pulumi config set availability-zones '["us-east-1a", "us-east-1b"]'

# Domain Configuration  
pulumi config set domain-name a-g-e-n-t-i-c.com
pulumi config set subdomain stage3v3

# Database Configuration
pulumi config set db-instance-class db.t3.medium
pulumi config set db-allocated-storage 20
pulumi config set db-name agentic_aws_db
pulumi config set db-backup-retention 7

# ECS Configuration
pulumi config set ecs-cpu 512
pulumi config set ecs-memory 1024
pulumi config set desired-count 2
pulumi config set min-capacity 1
pulumi config set max-capacity 10

# Monitoring
pulumi config set log-retention-days 14
pulumi config set cpu-threshold 70
pulumi config set memory-threshold 80
```

#### Secrets Configuration (pulumi config set --secret)
```bash
# Database credentials will be managed by AWS Secrets Manager
# No secrets in Pulumi config - all handled by AWS Secrets Manager
```

### 2. Dynamic Resource Naming

#### Naming Function (TypeScript)
```typescript
interface NamingConfig {
    projectName: string;
    environment: string;
    resourceType: string;
    uniqueSuffix?: string;
}

function createResourceName(config: NamingConfig): string {
    const suffix = config.uniqueSuffix || Date.now().toString();
    return `${config.projectName}-${config.environment}-${config.resourceType}-${suffix}`;
}
```

### 3. Environment Variable Injection

#### Dynamic Environment Variables
- **FASTAPI_URL**: Constructed from Internal ALB DNS name (Pulumi output)
- **DATABASE_URL**: Constructed from RDS endpoint + Secrets Manager
- **ENVIRONMENT**: Passed from Pulumi configuration
- **LOG_LEVEL**: Configurable (default: INFO)

### 4. Image Versioning Strategy

#### Dynamic Image Tags
```typescript
// Generate unique image tags for each deployment
const imageTag = `v${Date.now()}`;
const fastapiImage = `${ecrRepo.repositoryUrl}:fastapi-${imageTag}`;
const nodejsImage = `${ecrRepo.repositoryUrl}:nodejs-${imageTag}`;
```

---

## 🔐 Secrets Management Implementation

### AWS Secrets Manager Integration

#### 1. Database Credentials Secret
```json
{
  "name": "agentic-aws/stage3v3/database/master",
  "description": "Database master credentials for Stage3V3",
  "secretString": {
    "username": "postgres",
    "password": "<auto-generated-secure-password>",
    "host": "<rds-endpoint-from-pulumi>",
    "port": 5432,
    "dbname": "agentic_aws_db"
  }
}
```

#### 2. ECS Task Definition Integration
```typescript
// Task definition will reference secrets instead of environment variables
containerDefinition: {
    secrets: [
        {
            name: "DATABASE_URL",
            valueFrom: secretArn
        }
    ]
}
```

#### 3. Application Code Changes
```python
# FastAPI main.py
import boto3
import json

def get_database_credentials():
    client = boto3.client('secretsmanager', region_name='us-east-1')
    response = client.get_secret_value(SecretId='agentic-aws/stage3v3/database/master')
    return json.loads(response['SecretString'])
```

---

## 📈 Auto-Scaling Implementation

### ECS Service Auto-Scaling Configuration

#### 1. Target Tracking Scaling Policies
```typescript
// CPU-based scaling
const cpuScalingPolicy = new aws.applicationautoscaling.Policy("cpu-scaling", {
    policyType: "TargetTrackingScaling",
    resourceId: `service/${clusterName}/${serviceName}`,
    scalableDimension: "ecs:service:DesiredCount",
    serviceNamespace: "ecs",
    targetTrackingScalingPolicyConfiguration: {
        targetValue: 70, // 70% CPU utilization
        scaleInCooldown: 300,
        scaleOutCooldown: 300,
        metricSpecification: {
            metricType: "ECSServiceAverageCPUUtilization"
        }
    }
});

// Memory-based scaling
const memoryScalingPolicy = new aws.applicationautoscaling.Policy("memory-scaling", {
    policyType: "TargetTrackingScaling",
    resourceId: `service/${clusterName}/${serviceName}`,
    scalableDimension: "ecs:service:DesiredCount",
    serviceNamespace: "ecs",
    targetTrackingScalingPolicyConfiguration: {
        targetValue: 80, // 80% Memory utilization
        scaleInCooldown: 300,
        scaleOutCooldown: 300,
        metricSpecification: {
            metricType: "ECSServiceAverageMemoryUtilization"
        }
    }
});
```

#### 2. Scaling Targets Configuration
```typescript
const scalingTarget = new aws.applicationautoscaling.Target("ecs-scaling-target", {
    maxCapacity: 10,
    minCapacity: 1,
    resourceId: `service/${clusterName}/${serviceName}`,
    scalableDimension: "ecs:service:DesiredCount",
    serviceNamespace: "ecs"
});
```

---

## 🚀 Deployment Process

### Phase 1: Configuration Setup
1. Initialize new Pulumi project in `Pulumi/Stage-3-Version-3/infrastructure`
2. Set all configuration parameters via `pulumi config set`
3. Validate configuration completeness

### Phase 2: Infrastructure Deployment  
1. Deploy VPC and networking components
2. Create security groups with proper dependencies
3. Deploy RDS with Secrets Manager integration
4. Create ECR repositories
5. Deploy ECS cluster and IAM roles

### Phase 3: Application Deployment
1. Build and push Docker images to ECR
2. Create task definitions with secrets integration
3. Deploy ECS services with auto-scaling
4. Create and configure load balancers

### Phase 4: DNS and SSL
1. Create ACM certificate for subdomain
2. Configure DNS records in Route 53
3. Attach SSL certificate to ALB

### Phase 5: Testing and Validation
1. Health check endpoints
2. Database connectivity test
3. Auto-scaling trigger testing
4. SSL certificate validation
5. End-to-end request flow verification

---

## 🧪 Testing Strategy

### End-to-End Testing Checklist
- [ ] `https://stage3v3.a-g-e-n-t-i-c.com/` → Node.js frontend response
- [ ] `https://stage3v3.a-g-e-n-t-i-c.com/health` → Health check passing
- [ ] `https://stage3v3.a-g-e-n-t-i-c.com/api/status` → FastAPI status
- [ ] `https://stage3v3.a-g-e-n-t-i-c.com/api/db-test` → PostgreSQL data
- [ ] SSL certificate valid and trusted
- [ ] Auto-scaling policies triggered under load
- [ ] Database secrets rotation working
- [ ] All CloudWatch logs flowing correctly

### Load Testing for Auto-Scaling
```bash
# Generate CPU load to test auto-scaling
for i in {1..100}; do
  curl -s https://stage3v3.a-g-e-n-t-i-c.com/api/db-test > /dev/null &
done
```

---

## 📊 Expected Resource Count & Cost

### Resource Summary
- **Total AWS Resources**: ~60 resources
- **VPC Components**: 16 (VPC, subnets, gateways, route tables, security groups)
- **RDS Resources**: 4 (primary, replica, subnet group, parameter group)  
- **ECS Resources**: 12 (cluster, services, task definitions, auto-scaling policies)
- **ALB Resources**: 8 (2 ALBs, 2 target groups, 3 listeners, 1 certificate)
- **Secrets Manager**: 1 secret
- **CloudWatch**: 6 (log groups, alarms)
- **ECR**: 2 repositories
- **Route 53**: 3 DNS records
- **IAM**: 3 roles with policies

### Estimated Monthly Cost
- **VPC & Networking**: $45 (NAT Gateway)
- **RDS**: $85 (db.t3.medium Multi-AZ + replica)
- **ECS Fargate**: $60-120 (2-4 containers, scales with load)
- **ALB**: $22 (2 load balancers)
- **CloudWatch**: $20 (logs + metrics)
- **Secrets Manager**: $0.40 (1 secret)
- **ECR**: $2 (image storage)
- **Data Transfer**: $25 (estimated)
- **TOTAL**: **$259-329/month** (depending on auto-scaling)

---

## 🔄 Redeployment Instructions

### Fresh Deployment to New Environment
```bash
# 1. Navigate to project directory
cd /c/Users/Admin/Documents/Workspace/Pulumi/Stage-3-Version-3/infrastructure

# 2. Initialize Pulumi stack
pulumi stack init <new-environment>

# 3. Configure parameters (Stage3v3 deployment)
pulumi config set project-name agentic-aws-stage3v3
pulumi config set environment stage3v3
pulumi config set subdomain stage3v3
pulumi config set db-instance-class db.t3.medium
pulumi config set desired-count 2

# 4. Deploy infrastructure
pulumi up

# 5. Verify deployment
curl -s https://stage3v3.a-g-e-n-t-i-c.com/api/db-test
```

### Configuration Flexibility
- **Domain**: Change subdomain for different environments
- **Resources**: Scale up/down database and container sizes
- **Regions**: Deploy to different AWS regions
- **Scaling**: Adjust auto-scaling parameters per environment

---

## 📋 Pre-Deployment Validation

### Prerequisites Checklist
- [ ] AWS credentials configured with appropriate permissions
- [ ] Route 53 hosted zone for `a-g-e-n-t-i-c.com` exists and accessible
- [ ] Pulumi CLI installed and configured
- [ ] Docker installed for image building
- [ ] Sufficient AWS account limits for planned resources

### Configuration Validation
- [ ] All required Pulumi config parameters set
- [ ] VPC CIDR doesn't conflict with existing networks  
- [ ] Subdomain doesn't conflict with existing DNS records
- [ ] Database parameters are valid for chosen instance class
- [ ] Auto-scaling parameters are reasonable for expected load

---

---

## 📝 Project Information

### GitHub Repository
- **Repository Name**: `agentic-aws-stage3v3`
- **Full Repository URL**: `https://github.com/{username}/agentic-aws-stage3v3`
- **Repository Purpose**: Agentic infrastructure deployment Stage 3 Version 3
- **Branch Strategy**: `main` branch for production-ready code

---

**Deployment Plan Status**: ✅ READY FOR REVIEW  
**Next Step**: Await user approval to begin implementation  
**Estimated Deployment Time**: 45-60 minutes for complete infrastructure + testing  
**GitHub Repository**: `agentic-aws-stage3v3`