import cdk = require('@aws-cdk/core');
import iam = require('@aws-cdk/aws-iam')
import ssm = require('@aws-cdk/aws-ssm');
import {default as config } from '../config/config'


export class EksClusterIamCdkStack extends cdk.Stack {
  
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props );

    // Cluster Service Role
    const eksClusterServiceRole = new iam.Role(this, "EKSClusterServiceRole", {
      roleName: `eks-${config.cluster_name}-ServiceRole`,
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSServicePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy')
      ]
    });

    // Cluster Admin Role
    const clusterAdminRole = new iam.Role(this, 'AdminRole', {
      roleName: `eks-${config.cluster_name}-AdminRole`,
      assumedBy: new iam.AccountRootPrincipal()
    });

    // Cluster Admin Group
    const clusterAdminGroup = new iam.Group(this, 'eks-administrators', {
      groupName: 'eks-administrators',
    });

    const adminPolicyStatement = new iam.PolicyStatement({
      resources: [clusterAdminRole.roleArn],
      actions: ['sts:AssumeRole'],
      effect: iam.Effect.ALLOW
    });

    const assumeEKSAdminRolePolicy = new iam.ManagedPolicy(this, 'assumeEKSAdminRolePolicy', {
      managedPolicyName: 'assume-KubernetesAdmin-Policy'
    });
    assumeEKSAdminRolePolicy.addStatements(adminPolicyStatement);
    assumeEKSAdminRolePolicy.attachToGroup(clusterAdminGroup);

    // Create IAM Role for AutoScaling Group Instances
    const clusterWorkerNodeGroup = new iam.Role(this, 'asg-role', {
      roleName: `eks-${config.cluster_name}-WorkerNodeGroupRole`,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    });
    
    const WorkerNodeGroupPolicies : string[] = [
      "AmazonSSMManagedInstanceCore",
      "AmazonEKSWorkerNodePolicy",
      "AmazonEKS_CNI_Policy",
      "AmazonEC2ContainerRegistryReadOnly"
    ]

    // Add Managed Policies to Instance Profile
    for (const policy of WorkerNodeGroupPolicies) {
      clusterWorkerNodeGroup.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          policy
      ));
    }

    //Create IAM Role for Code Build and Code Pipeline
    const eksCodeBuildPassRoleStatement = new iam.PolicyStatement({
      resources: [
        clusterWorkerNodeGroup.roleArn,
        `arn:aws:iam::${config.account_id}:instance-profile/AmiTestEksCluster*`      
      ],
      actions: [
        'iam:PassRole',
        'iam:CreateInstanceProfile',
        'iam:AddRoleToInstanceProfile',
        'iam:RemoveRoleFromInstanceProfile'
      ],
      effect: iam.Effect.ALLOW
    });
    const eksDescribeStatement = new iam.PolicyStatement({
      resources: [`arn:aws:eks:${config.region}:${config.account_id}:cluster/${config.cluster_name}`],
      actions: ['eks:DescribeCluster'],
      effect: iam.Effect.ALLOW
    });
    const eksGetParamStatement = new iam.PolicyStatement({
      resources: [`arn:aws:ssm:${config.region}:${config.account_id}:parameter/eks/ami-test-cluster/*`],
      actions: ['ssm:GetParameter*','ssm:PutParameter*'],
      effect: iam.Effect.ALLOW
    });
    const eksCodeBuildWorkerPolicy = new iam.ManagedPolicy(this, 'eksCodeBuildWorkerPolicy');
    eksCodeBuildWorkerPolicy.addStatements(eksCodeBuildPassRoleStatement);
    eksCodeBuildWorkerPolicy.addStatements(eksDescribeStatement);
    eksCodeBuildWorkerPolicy.addStatements(eksGetParamStatement);



    const eksUpdateCodeBuildRole = new iam.Role(this, "EksUpdateBuildRole", {
      roleName: `eks-${config.cluster_name}-workerCodeBuildRole`,
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AutoScalingFullAccess'), 
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCloudFormationFullAccess') 
      ]
    });
    eksUpdateCodeBuildRole.addManagedPolicy(eksCodeBuildWorkerPolicy);
 
  
    // Store IAM Role Names and Arns in Paramter store for use by other stacks
    new ssm.StringParameter(this, 'clusterServiceRoleName', {
      description: `${config.cluster_name} Service Role Name`,
      parameterName: `/eks/ami-test-cluster/serviceRoleName`,
      stringValue: eksClusterServiceRole.roleName
    })

    new ssm.StringParameter(this, 'clusterServiceRoleArn', {
      description: `${config.cluster_name} Service Role Arn`,
      parameterName: `/eks/ami-test-cluster/serviceRoleArn`,
      stringValue: eksClusterServiceRole.roleArn
    })

    new ssm.StringParameter(this, 'clusterAdminRoleName', {
      description: `${config.cluster_name} Admin Role Name`,
      parameterName: `/eks/ami-test-cluster/adminRoleName`,
      stringValue: clusterAdminRole.roleName
    })

    new ssm.StringParameter(this, 'clusterAdminRoleArn', {
      description: `${config.cluster_name} Admin Role Arn`,
      parameterName: `/eks/ami-test-cluster/adminRoleArn`,
      stringValue: clusterAdminRole.roleArn
    })

    new ssm.StringParameter(this, 'clusterWorkerNodeGroupRoleName', {
      description: `${config.cluster_name} Service Role Name`,
      parameterName: `/eks/ami-test-cluster/workerNodeGroupRoleName`,
      stringValue: clusterWorkerNodeGroup.roleName
    })

    new ssm.StringParameter(this, 'clusterWorkerNodeGroupRoleArn', {
      description: `${config.cluster_name} Service Role Arn`,
      parameterName: `/eks/ami-test-cluster/workerNodeGroupRoleArn`,
      stringValue: clusterWorkerNodeGroup.roleArn
    })

    new ssm.StringParameter(this, 'clusterworkerCodeBuildRoleArn', {
      description: `${config.cluster_name} Code Build Role Arn`,
      parameterName: `/eks/ami-test-cluster/workerCodeBuildRoleArn`,
      stringValue: eksUpdateCodeBuildRole.roleArn
    })
    
  }
}
