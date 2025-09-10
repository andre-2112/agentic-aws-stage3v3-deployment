import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

// Get configuration
const config = new pulumi.Config();
const projectName = config.require("project-name");
const environment = config.require("environment");
const vpcCidr = config.require("vpc-cidr");
const availabilityZones = config.requireObject<string[]>("availability-zones");
const domainName = config.require("domain-name");
const subdomain = config.require("subdomain");
const dbInstanceClass = config.require("db-instance-class");
const dbAllocatedStorage = config.requireNumber("db-allocated-storage");
const dbName = config.require("db-name");
const dbBackupRetention = config.requireNumber("db-backup-retention");
const ecsCpu = config.requireNumber("ecs-cpu");
const ecsMemory = config.requireNumber("ecs-memory");
const desiredCount = config.requireNumber("desired-count");
const minCapacity = config.requireNumber("min-capacity");
const maxCapacity = config.requireNumber("max-capacity");
const logRetentionDays = config.requireNumber("log-retention-days");
const cpuThreshold = config.requireNumber("cpu-threshold");
const memoryThreshold = config.requireNumber("memory-threshold");

// Resource naming function with length limits
function createResourceName(resourceType: string, uniqueSuffix?: string, maxLength?: number): string {
    const suffix = uniqueSuffix || "";
    const baseName = `${projectName}-${resourceType}${suffix ? `-${suffix}` : ""}`;
    
    // Apply length limit if specified
    if (maxLength && baseName.length > maxLength) {
        // For ALBs and other length-limited resources, use abbreviated naming
        const shortProject = "ag-stg3v3"; // Abbreviated version of agentic-aws-stage3v3
        const shortName = `${shortProject}-${resourceType}${suffix ? `-${suffix}` : ""}`;
        
        if (shortName.length > maxLength) {
            // Further abbreviate if still too long
            const veryShortName = `${shortProject}-${resourceType.substr(0, 6)}${suffix ? `-${suffix}` : ""}`;
            return veryShortName.substr(0, maxLength);
        }
        return shortName;
    }
    
    return baseName;
}

// =============================
// VPC AND NETWORKING
// =============================

// Create VPC
const vpc = new aws.ec2.Vpc(createResourceName("vpc"), {
    cidrBlock: vpcCidr,
    enableDnsHostnames: true,
    enableDnsSupport: true,
    tags: {
        Name: createResourceName("vpc"),
        Project: projectName,
        Environment: environment,
    },
});

// Create Internet Gateway
const internetGateway = new aws.ec2.InternetGateway(createResourceName("igw"), {
    vpcId: vpc.id,
    tags: {
        Name: createResourceName("igw"),
        Project: projectName,
        Environment: environment,
    },
});

// Create subnets
const publicSubnet1 = new aws.ec2.Subnet(createResourceName("public-subnet", "1"), {
    vpcId: vpc.id,
    cidrBlock: "10.1.1.0/24",
    availabilityZone: availabilityZones[0],
    mapPublicIpOnLaunch: true,
    tags: {
        Name: createResourceName("public-subnet", "1"),
        Project: projectName,
        Environment: environment,
        Type: "Public",
    },
});

const publicSubnet2 = new aws.ec2.Subnet(createResourceName("public-subnet", "2"), {
    vpcId: vpc.id,
    cidrBlock: "10.1.2.0/24",
    availabilityZone: availabilityZones[1],
    mapPublicIpOnLaunch: true,
    tags: {
        Name: createResourceName("public-subnet", "2"),
        Project: projectName,
        Environment: environment,
        Type: "Public",
    },
});

const privateSubnet1 = new aws.ec2.Subnet(createResourceName("private-subnet", "1"), {
    vpcId: vpc.id,
    cidrBlock: "10.1.3.0/24",
    availabilityZone: availabilityZones[0],
    tags: {
        Name: createResourceName("private-subnet", "1"),
        Project: projectName,
        Environment: environment,
        Type: "Private",
    },
});

const privateSubnet2 = new aws.ec2.Subnet(createResourceName("private-subnet", "2"), {
    vpcId: vpc.id,
    cidrBlock: "10.1.4.0/24",
    availabilityZone: availabilityZones[1],
    tags: {
        Name: createResourceName("private-subnet", "2"),
        Project: projectName,
        Environment: environment,
        Type: "Private",
    },
});

const dbSubnet1 = new aws.ec2.Subnet(createResourceName("db-subnet", "1"), {
    vpcId: vpc.id,
    cidrBlock: "10.1.5.0/24",
    availabilityZone: availabilityZones[0],
    tags: {
        Name: createResourceName("db-subnet", "1"),
        Project: projectName,
        Environment: environment,
        Type: "Database",
    },
});

const dbSubnet2 = new aws.ec2.Subnet(createResourceName("db-subnet", "2"), {
    vpcId: vpc.id,
    cidrBlock: "10.1.6.0/24",
    availabilityZone: availabilityZones[1],
    tags: {
        Name: createResourceName("db-subnet", "2"),
        Project: projectName,
        Environment: environment,
        Type: "Database",
    },
});

// Create Elastic IP for NAT Gateway
const natEip = new aws.ec2.Eip(createResourceName("nat-eip"), {
    domain: "vpc",
    tags: {
        Name: createResourceName("nat-eip"),
        Project: projectName,
        Environment: environment,
    },
});

// Create NAT Gateway
const natGateway = new aws.ec2.NatGateway(createResourceName("nat"), {
    allocationId: natEip.id,
    subnetId: publicSubnet1.id,
    tags: {
        Name: createResourceName("nat"),
        Project: projectName,
        Environment: environment,
    },
});

// Create route tables
const publicRouteTable = new aws.ec2.RouteTable(createResourceName("public-rt"), {
    vpcId: vpc.id,
    routes: [{
        cidrBlock: "0.0.0.0/0",
        gatewayId: internetGateway.id,
    }],
    tags: {
        Name: createResourceName("public-rt"),
        Project: projectName,
        Environment: environment,
    },
});

const privateRouteTable = new aws.ec2.RouteTable(createResourceName("private-rt"), {
    vpcId: vpc.id,
    routes: [{
        cidrBlock: "0.0.0.0/0",
        natGatewayId: natGateway.id,
    }],
    tags: {
        Name: createResourceName("private-rt"),
        Project: projectName,
        Environment: environment,
    },
});

const dbRouteTable = new aws.ec2.RouteTable(createResourceName("db-rt"), {
    vpcId: vpc.id,
    tags: {
        Name: createResourceName("db-rt"),
        Project: projectName,
        Environment: environment,
    },
});

// Route table associations
new aws.ec2.RouteTableAssociation("public-subnet-1-rt-assoc", {
    subnetId: publicSubnet1.id,
    routeTableId: publicRouteTable.id,
});

new aws.ec2.RouteTableAssociation("public-subnet-2-rt-assoc", {
    subnetId: publicSubnet2.id,
    routeTableId: publicRouteTable.id,
});

new aws.ec2.RouteTableAssociation("private-subnet-1-rt-assoc", {
    subnetId: privateSubnet1.id,
    routeTableId: privateRouteTable.id,
});

new aws.ec2.RouteTableAssociation("private-subnet-2-rt-assoc", {
    subnetId: privateSubnet2.id,
    routeTableId: privateRouteTable.id,
});

new aws.ec2.RouteTableAssociation("db-subnet-1-rt-assoc", {
    subnetId: dbSubnet1.id,
    routeTableId: dbRouteTable.id,
});

new aws.ec2.RouteTableAssociation("db-subnet-2-rt-assoc", {
    subnetId: dbSubnet2.id,
    routeTableId: dbRouteTable.id,
});

// =============================
// SECURITY GROUPS
// =============================

// Public ALB Security Group
const publicAlbSg = new aws.ec2.SecurityGroup(createResourceName("public-alb-sg"), {
    vpcId: vpc.id,
    description: "Security group for public Application Load Balancer",
    ingress: [
        {
            protocol: "tcp",
            fromPort: 80,
            toPort: 80,
            cidrBlocks: ["0.0.0.0/0"],
        },
        {
            protocol: "tcp",
            fromPort: 443,
            toPort: 443,
            cidrBlocks: ["0.0.0.0/0"],
        },
    ],
    egress: [{
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
    }],
    tags: {
        Name: createResourceName("public-alb-sg"),
        Project: projectName,
        Environment: environment,
    },
});

// Node.js Security Group
const nodejsSg = new aws.ec2.SecurityGroup(createResourceName("nodejs-sg"), {
    vpcId: vpc.id,
    description: "Security group for Node.js containers",
    egress: [{
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
    }],
    tags: {
        Name: createResourceName("nodejs-sg"),
        Project: projectName,
        Environment: environment,
    },
});

// Add ingress rule for Node.js from Public ALB
new aws.ec2.SecurityGroupRule("nodejs-sg-ingress-from-public-alb", {
    type: "ingress",
    fromPort: 3000,
    toPort: 3000,
    protocol: "tcp",
    sourceSecurityGroupId: publicAlbSg.id,
    securityGroupId: nodejsSg.id,
});

// Internal ALB Security Group
const internalAlbSg = new aws.ec2.SecurityGroup(createResourceName("internal-alb-sg"), {
    vpcId: vpc.id,
    description: "Security group for internal Application Load Balancer",
    egress: [{
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
    }],
    tags: {
        Name: createResourceName("internal-alb-sg"),
        Project: projectName,
        Environment: environment,
    },
});

// Add ingress rule for Internal ALB from Node.js
new aws.ec2.SecurityGroupRule("internal-alb-sg-ingress-from-nodejs", {
    type: "ingress",
    fromPort: 80,
    toPort: 80,
    protocol: "tcp",
    sourceSecurityGroupId: nodejsSg.id,
    securityGroupId: internalAlbSg.id,
});

// FastAPI Security Group
const fastapiSg = new aws.ec2.SecurityGroup(createResourceName("fastapi-sg"), {
    vpcId: vpc.id,
    description: "Security group for FastAPI containers",
    egress: [{
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
    }],
    tags: {
        Name: createResourceName("fastapi-sg"),
        Project: projectName,
        Environment: environment,
    },
});

// Add ingress rule for FastAPI from Internal ALB
new aws.ec2.SecurityGroupRule("fastapi-sg-ingress-from-internal-alb", {
    type: "ingress",
    fromPort: 8000,
    toPort: 8000,
    protocol: "tcp",
    sourceSecurityGroupId: internalAlbSg.id,
    securityGroupId: fastapiSg.id,
});

// Database Security Group
const dbSg = new aws.ec2.SecurityGroup(createResourceName("db-sg"), {
    vpcId: vpc.id,
    description: "Security group for PostgreSQL database",
    egress: [],
    tags: {
        Name: createResourceName("db-sg"),
        Project: projectName,
        Environment: environment,
    },
});

// Add ingress rule for Database from FastAPI
new aws.ec2.SecurityGroupRule("db-sg-ingress-from-fastapi", {
    type: "ingress",
    fromPort: 5432,
    toPort: 5432,
    protocol: "tcp",
    sourceSecurityGroupId: fastapiSg.id,
    securityGroupId: dbSg.id,
});

// =============================
// SECRETS MANAGER
// =============================

// Create database master secret
const dbSecret = new aws.secretsmanager.Secret(createResourceName("db-master-secret"), {
    name: `${projectName}/database/master`,
    description: `Database master credentials for ${environment}`,
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// Generate random password for database
const dbPassword = new aws.secretsmanager.SecretVersion(createResourceName("db-master-secret-version"), {
    secretId: dbSecret.id,
    secretString: pulumi.jsonStringify({
        username: "postgres",
        password: pulumi.secret("TempPassword123!"), // Will be replaced by RDS
        dbname: dbName,
    }),
});

// =============================
// RDS DATABASE
// =============================

// Create DB subnet group
const dbSubnetGroup = new aws.rds.SubnetGroup(createResourceName("db-subnet-group"), {
    subnetIds: [dbSubnet1.id, dbSubnet2.id],
    tags: {
        Name: createResourceName("db-subnet-group"),
        Project: projectName,
        Environment: environment,
    },
});

// Create DB parameter group
const dbParameterGroup = new aws.rds.ParameterGroup(createResourceName("db-parameter-group"), {
    family: "postgres15",
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// Create primary RDS instance
const dbInstance = new aws.rds.Instance(createResourceName("primary"), {
    identifier: createResourceName("primary"),
    engine: "postgres",
    engineVersion: "15.13",
    instanceClass: dbInstanceClass,
    allocatedStorage: dbAllocatedStorage,
    storageType: "gp3",
    storageEncrypted: true,
    multiAz: true,
    dbName: dbName,
    username: "postgres",
    manageMasterUserPassword: true,
    masterUserSecretKmsKeyId: "alias/aws/secretsmanager",
    vpcSecurityGroupIds: [dbSg.id],
    dbSubnetGroupName: dbSubnetGroup.name,
    parameterGroupName: dbParameterGroup.name,
    backupRetentionPeriod: dbBackupRetention,
    backupWindow: "03:00-04:00",
    maintenanceWindow: "sun:04:00-sun:05:00",
    autoMinorVersionUpgrade: true,
    deletionProtection: false,
    skipFinalSnapshot: true,
    tags: {
        Name: createResourceName("primary"),
        Project: projectName,
        Environment: environment,
    },
});

// Create read replica
const dbReplica = new aws.rds.Instance(createResourceName("replica"), {
    identifier: createResourceName("replica"),
    replicateSourceDb: dbInstance.identifier,
    instanceClass: dbInstanceClass,
    autoMinorVersionUpgrade: true,
    tags: {
        Name: createResourceName("replica"),
        Project: projectName,
        Environment: environment,
    },
});

// =============================
// ECR REPOSITORIES
// =============================

// FastAPI ECR repository
const fastapiRepo = new aws.ecr.Repository(createResourceName("fastapi"), {
    name: createResourceName("fastapi"),
    imageScanningConfiguration: {
        scanOnPush: true,
    },
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// Node.js ECR repository
const nodejsRepo = new aws.ecr.Repository(createResourceName("nodejs"), {
    name: createResourceName("nodejs"),
    imageScanningConfiguration: {
        scanOnPush: true,
    },
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// =============================
// ECS CLUSTER AND IAM ROLES
// =============================

// ECS Cluster
const ecsCluster = new aws.ecs.Cluster(createResourceName("cluster"), {
    name: createResourceName("cluster"),
    settings: [{
        name: "containerInsights",
        value: "enabled",
    }],
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// ECS Task Execution Role
const taskExecutionRole = new aws.iam.Role(createResourceName("task-execution-role"), {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
                Service: "ecs-tasks.amazonaws.com",
            },
        }],
    }),
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

new aws.iam.RolePolicyAttachment("task-execution-role-policy", {
    role: taskExecutionRole.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
});

// Additional policy for Secrets Manager
const secretsManagerPolicy = new aws.iam.RolePolicy(createResourceName("secrets-manager-policy"), {
    role: taskExecutionRole.id,
    policy: dbInstance.masterUserSecrets.apply((secrets: any) => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Action: [
                "secretsmanager:GetSecretValue",
            ],
            Resource: secrets?.[0]?.secretArn || "",
        }],
    })),
});

// ECS Task Role
const taskRole = new aws.iam.Role(createResourceName("task-role"), {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
                Service: "ecs-tasks.amazonaws.com",
            },
        }],
    }),
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// =============================
// CLOUDWATCH LOG GROUPS
// =============================

const fastapiLogGroup = new aws.cloudwatch.LogGroup(createResourceName("fastapi-logs"), {
    name: createResourceName("fastapi-logs"),
    retentionInDays: logRetentionDays,
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

const nodejsLogGroup = new aws.cloudwatch.LogGroup(createResourceName("nodejs-logs"), {
    name: createResourceName("nodejs-logs"),
    retentionInDays: logRetentionDays,
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// =============================
// APPLICATION LOAD BALANCERS
// =============================

// Public ALB
const publicAlb = new aws.lb.LoadBalancer(createResourceName("public-alb"), {
    name: createResourceName("public-alb", undefined, 32),
    internal: false,
    loadBalancerType: "application",
    securityGroups: [publicAlbSg.id],
    subnets: [publicSubnet1.id, publicSubnet2.id],
    enableDeletionProtection: false,
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// Internal ALB
const internalAlb = new aws.lb.LoadBalancer(createResourceName("internal-alb"), {
    name: createResourceName("internal-alb", undefined, 32),
    internal: true,
    loadBalancerType: "application",
    securityGroups: [internalAlbSg.id],
    subnets: [privateSubnet1.id, privateSubnet2.id],
    enableDeletionProtection: false,
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// =============================
// SSL CERTIFICATE
// =============================

const certificate = new aws.acm.Certificate(createResourceName("ssl-cert"), {
    domainName: `${subdomain}.${domainName}`,
    validationMethod: "DNS",
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// =============================
// TARGET GROUPS
// =============================

// Node.js Target Group
const nodejsTargetGroup = new aws.lb.TargetGroup(createResourceName("nodejs-tg"), {
    name: createResourceName("nodejs-tg", undefined, 32),
    port: 3000,
    protocol: "HTTP",
    vpcId: vpc.id,
    targetType: "ip",
    healthCheck: {
        enabled: true,
        healthyThreshold: 2,
        unhealthyThreshold: 2,
        timeout: 5,
        interval: 30,
        path: "/health",
        matcher: "200",
    },
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// FastAPI Target Group
const fastapiTargetGroup = new aws.lb.TargetGroup(createResourceName("fastapi-tg"), {
    name: createResourceName("fastapi-tg", undefined, 32),
    port: 8000,
    protocol: "HTTP",
    vpcId: vpc.id,
    targetType: "ip",
    healthCheck: {
        enabled: true,
        healthyThreshold: 2,
        unhealthyThreshold: 2,
        timeout: 5,
        interval: 30,
        path: "/health",
        matcher: "200",
    },
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// =============================
// ALB LISTENERS
// =============================

// Public ALB HTTP Listener (redirect to HTTPS)
new aws.lb.Listener(createResourceName("public-alb-http-listener"), {
    loadBalancerArn: publicAlb.arn,
    port: 80,
    protocol: "HTTP",
    defaultActions: [{
        type: "redirect",
        redirect: {
            port: "443",
            protocol: "HTTPS",
            statusCode: "HTTP_301",
        },
    }],
});

// Public ALB HTTPS Listener
new aws.lb.Listener(createResourceName("public-alb-https-listener"), {
    loadBalancerArn: publicAlb.arn,
    port: 443,
    protocol: "HTTPS",
    sslPolicy: "ELBSecurityPolicy-TLS-1-2-2017-01",
    certificateArn: certificate.arn,
    defaultActions: [{
        type: "forward",
        targetGroupArn: nodejsTargetGroup.arn,
    }],
});

// Internal ALB HTTP Listener
new aws.lb.Listener(createResourceName("internal-alb-http-listener"), {
    loadBalancerArn: internalAlb.arn,
    port: 80,
    protocol: "HTTP",
    defaultActions: [{
        type: "forward",
        targetGroupArn: fastapiTargetGroup.arn,
    }],
});

// =============================
// TASK DEFINITIONS
// =============================

// FastAPI Task Definition
const fastapiTaskDefinition = new aws.ecs.TaskDefinition(createResourceName("fastapi-task"), {
    family: createResourceName("fastapi-task"),
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu: ecsCpu.toString(),
    memory: ecsMemory.toString(),
    executionRoleArn: taskExecutionRole.arn,
    taskRoleArn: taskRole.arn,
    containerDefinitions: pulumi.all([fastapiRepo.repositoryUrl, fastapiLogGroup.name, dbInstance.masterUserSecrets]).apply(([repoUrl, logGroupName, masterUserSecrets]: any) => JSON.stringify([{
        name: "fastapi",
        image: `${repoUrl}:latest`,
        portMappings: [{
            containerPort: 8000,
            protocol: "tcp",
        }],
        essential: true,
        secrets: [{
            name: "DATABASE_URL",
            valueFrom: masterUserSecrets?.[0]?.secretArn || "",
        }],
        environment: [
            { name: "ENVIRONMENT", value: environment },
            { name: "LOG_LEVEL", value: "INFO" },
        ],
        logConfiguration: {
            logDriver: "awslogs",
            options: {
                "awslogs-group": logGroupName,
                "awslogs-region": "us-east-1",
                "awslogs-stream-prefix": "fastapi",
            },
        },
    }])),
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// Node.js Task Definition
const nodejsTaskDefinition = new aws.ecs.TaskDefinition(createResourceName("nodejs-task"), {
    family: createResourceName("nodejs-task"),
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu: ecsCpu.toString(),
    memory: ecsMemory.toString(),
    executionRoleArn: taskExecutionRole.arn,
    taskRoleArn: taskRole.arn,
    containerDefinitions: pulumi.all([nodejsRepo.repositoryUrl, nodejsLogGroup.name, internalAlb.dnsName]).apply(([repoUrl, logGroupName, internalAlbDns]) => JSON.stringify([{
        name: "nodejs",
        image: `${repoUrl}:latest`,
        portMappings: [{
            containerPort: 3000,
            protocol: "tcp",
        }],
        essential: true,
        environment: [
            { name: "FASTAPI_URL", value: `http://${internalAlbDns}` },
            { name: "ENVIRONMENT", value: environment },
            { name: "LOG_LEVEL", value: "INFO" },
        ],
        logConfiguration: {
            logDriver: "awslogs",
            options: {
                "awslogs-group": logGroupName,
                "awslogs-region": "us-east-1",
                "awslogs-stream-prefix": "nodejs",
            },
        },
    }])),
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// =============================
// ECS SERVICES
// =============================

// FastAPI Service
const fastapiService = new aws.ecs.Service(createResourceName("fastapi-service"), {
    name: createResourceName("fastapi-service"),
    cluster: ecsCluster.id,
    taskDefinition: fastapiTaskDefinition.arn,
    desiredCount: desiredCount,
    launchType: "FARGATE",
    networkConfiguration: {
        subnets: [privateSubnet1.id, privateSubnet2.id],
        securityGroups: [fastapiSg.id],
        assignPublicIp: false,
    },
    loadBalancers: [{
        targetGroupArn: fastapiTargetGroup.arn,
        containerName: "fastapi",
        containerPort: 8000,
    }],
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// Node.js Service
const nodejsService = new aws.ecs.Service(createResourceName("nodejs-service"), {
    name: createResourceName("nodejs-service"),
    cluster: ecsCluster.id,
    taskDefinition: nodejsTaskDefinition.arn,
    desiredCount: desiredCount,
    launchType: "FARGATE",
    networkConfiguration: {
        subnets: [publicSubnet1.id, publicSubnet2.id],
        securityGroups: [nodejsSg.id],
        assignPublicIp: true,
    },
    loadBalancers: [{
        targetGroupArn: nodejsTargetGroup.arn,
        containerName: "nodejs",
        containerPort: 3000,
    }],
    tags: {
        Project: projectName,
        Environment: environment,
    },
});

// =============================
// AUTO-SCALING CONFIGURATION
// =============================

// FastAPI Auto-Scaling Target
const fastapiScalingTarget = new aws.appautoscaling.Target(createResourceName("fastapi-scaling-target"), {
    maxCapacity: maxCapacity,
    minCapacity: minCapacity,
    resourceId: pulumi.interpolate`service/${ecsCluster.name}/${fastapiService.name}`,
    scalableDimension: "ecs:service:DesiredCount",
    serviceNamespace: "ecs",
});

// FastAPI CPU Auto-Scaling Policy
new aws.appautoscaling.Policy(createResourceName("fastapi-cpu-scaling"), {
    name: createResourceName("fastapi-cpu-scaling"),
    policyType: "TargetTrackingScaling",
    resourceId: fastapiScalingTarget.resourceId,
    scalableDimension: fastapiScalingTarget.scalableDimension,
    serviceNamespace: fastapiScalingTarget.serviceNamespace,
    targetTrackingScalingPolicyConfiguration: {
        targetValue: cpuThreshold,
        scaleInCooldown: 300,
        scaleOutCooldown: 300,
        predefinedMetricSpecification: {
            predefinedMetricType: "ECSServiceAverageCPUUtilization",
        },
    },
});

// FastAPI Memory Auto-Scaling Policy
new aws.appautoscaling.Policy(createResourceName("fastapi-memory-scaling"), {
    name: createResourceName("fastapi-memory-scaling"),
    policyType: "TargetTrackingScaling",
    resourceId: fastapiScalingTarget.resourceId,
    scalableDimension: fastapiScalingTarget.scalableDimension,
    serviceNamespace: fastapiScalingTarget.serviceNamespace,
    targetTrackingScalingPolicyConfiguration: {
        targetValue: memoryThreshold,
        scaleInCooldown: 300,
        scaleOutCooldown: 300,
        predefinedMetricSpecification: {
            predefinedMetricType: "ECSServiceAverageMemoryUtilization",
        },
    },
});

// Node.js Auto-Scaling Target
const nodejsScalingTarget = new aws.appautoscaling.Target(createResourceName("nodejs-scaling-target"), {
    maxCapacity: maxCapacity,
    minCapacity: minCapacity,
    resourceId: pulumi.interpolate`service/${ecsCluster.name}/${nodejsService.name}`,
    scalableDimension: "ecs:service:DesiredCount",
    serviceNamespace: "ecs",
});

// Node.js CPU Auto-Scaling Policy
new aws.appautoscaling.Policy(createResourceName("nodejs-cpu-scaling"), {
    name: createResourceName("nodejs-cpu-scaling"),
    policyType: "TargetTrackingScaling",
    resourceId: nodejsScalingTarget.resourceId,
    scalableDimension: nodejsScalingTarget.scalableDimension,
    serviceNamespace: nodejsScalingTarget.serviceNamespace,
    targetTrackingScalingPolicyConfiguration: {
        targetValue: cpuThreshold,
        scaleInCooldown: 300,
        scaleOutCooldown: 300,
        predefinedMetricSpecification: {
            predefinedMetricType: "ECSServiceAverageCPUUtilization",
        },
    },
});

// Node.js Memory Auto-Scaling Policy
new aws.appautoscaling.Policy(createResourceName("nodejs-memory-scaling"), {
    name: createResourceName("nodejs-memory-scaling"),
    policyType: "TargetTrackingScaling",
    resourceId: nodejsScalingTarget.resourceId,
    scalableDimension: nodejsScalingTarget.scalableDimension,
    serviceNamespace: nodejsScalingTarget.serviceNamespace,
    targetTrackingScalingPolicyConfiguration: {
        targetValue: memoryThreshold,
        scaleInCooldown: 300,
        scaleOutCooldown: 300,
        predefinedMetricSpecification: {
            predefinedMetricType: "ECSServiceAverageMemoryUtilization",
        },
    },
});

// =============================
// ROUTE 53 DNS
// =============================

// Get the hosted zone (assumes it exists)
const hostedZone = aws.route53.getZone({
    name: domainName,
    privateZone: false,
});

// Create A record for the subdomain
const dnsRecord = new aws.route53.Record(createResourceName("dns-record"), {
    zoneId: hostedZone.then(zone => zone.zoneId),
    name: `${subdomain}.${domainName}`,
    type: "A",
    aliases: [{
        name: publicAlb.dnsName,
        zoneId: publicAlb.zoneId,
        evaluateTargetHealth: true,
    }],
});

// =============================
// EXPORTS
// =============================

export const vpcId = vpc.id;
export const publicSubnetIds = [publicSubnet1.id, publicSubnet2.id];
export const privateSubnetIds = [privateSubnet1.id, privateSubnet2.id];
export const databaseSubnetIds = [dbSubnet1.id, dbSubnet2.id];
export const ecsClusterId = ecsCluster.id;
export const publicAlbDnsName = publicAlb.dnsName;
export const internalAlbDnsName = internalAlb.dnsName;
export const databaseEndpoint = dbInstance.endpoint;
export const databaseReplicaEndpoint = dbReplica.endpoint;
export const fastapiRepositoryUrl = fastapiRepo.repositoryUrl;
export const nodejsRepositoryUrl = nodejsRepo.repositoryUrl;
export const applicationUrl = pulumi.interpolate`https://${subdomain}.${domainName}`;
export const databaseSecretArn = dbInstance.masterUserSecrets.apply((secrets: any) => secrets?.[0]?.secretArn || "");