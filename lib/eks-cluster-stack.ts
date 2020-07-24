import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import iam = require('@aws-cdk/aws-iam')
import ssm = require('@aws-cdk/aws-ssm');
import eks = require('@aws-cdk/aws-eks');
import {default as config } from '../config/config'


export class EksClusterCdkStack extends cdk.Stack {
  
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props );

    // Get Cluster VPC
    const eksClusterVpc = ec2.Vpc.fromLookup(this, "ClusterVpc", {
      vpcId: config.vpc_id
    });

    // Get IAM Roles
    const clusterServiceRole = iam.Role.fromRoleArn(this, 'serviceRoleArn', 
      ssm.StringParameter.fromStringParameterName(
        this, 'serviceRoleArnParam', '/eks/ami-test-cluster/serviceRoleArn').stringValue
    )

    const clusterAdminRole = iam.Role.fromRoleArn(this, 'adminRoleArn', 
      ssm.StringParameter.fromStringParameterName(
        this, 'adminRoleArnParam', '/eks/ami-test-cluster/adminRoleArn').stringValue
    )

    const workerNodeGroupRole = iam.Role.fromRoleArn(this, 'workerNodeGroupRoleArn', 
      ssm.StringParameter.fromStringParameterName(
        this, 'workerNodeGroupRoleArnParam', '/eks/ami-test-cluster/workerNodeGroupRoleArn').stringValue
    )

    const workerCodeBuildRole = iam.Role.fromRoleArn(this, 'workerCodeBuildRoleArn', 
    ssm.StringParameter.fromStringParameterName(
      this, 'workerCodeBuildRoleArnParam', '/eks/ami-test-cluster/workerCodeBuildRoleArn').stringValue
  )

    const eksClusterSecurityGroup = new ec2.SecurityGroup(this, "EksClusterSecurityGroup", {
      vpc: eksClusterVpc,
      allowAllOutbound: true,
      description: "EKS Controlpane Security Group",
      securityGroupName: `eks-${config.cluster_name}-Cluster-SG`
    });

    if (config.office_eks_api_cidr) { 
      eksClusterSecurityGroup.addIngressRule(ec2.Peer.ipv4(config.office_eks_api_cidr), ec2.Port.tcp(443), "EKS Access from Office/Management Network");
    }
    eksClusterSecurityGroup.addIngressRule(ec2.Peer.ipv4(eksClusterVpc.vpcCidrBlock), ec2.Port.tcp(443), "EKS Access from AWS VPC");

    const eksCluster = new eks.Cluster(this, 'EksCluster', {
      clusterName: config.cluster_name,
      defaultCapacity: 0,
      kubectlEnabled: true,
      mastersRole: clusterAdminRole,
      outputClusterName: true,
      outputConfigCommand: true,
      outputMastersRoleArn: true,
      role: clusterServiceRole,
      securityGroup: eksClusterSecurityGroup,
      version: eks.KubernetesVersion.of(config.eks_version),
      vpc: eksClusterVpc,
      vpcSubnets: [
        { subnetType: ec2.SubnetType.PUBLIC, onePerAz: true },
        { subnetType: ec2.SubnetType.PRIVATE, onePerAz: true },
      ],
    });

    if (config.eksadmin_user_name) {
      eksCluster.awsAuth.addUserMapping(iam.User.fromUserName(this, "AmiTestEksAdminUser", config.eksadmin_user_name), { 
          groups: [ 'system:masters' ]
        });
    }

    eksCluster.awsAuth.addRoleMapping(workerNodeGroupRole, {
      username: 'system:node:{{EC2PrivateDNSName}}',
      groups: [
        'system:bootstrappers',
        'system:nodes',
      ],
    });

    eksCluster.awsAuth.addRoleMapping(workerCodeBuildRole, {
      groups: [
        'system:masters',
      ],
    });

    new ssm.StringParameter(this, 'clusterNameParam', {
      description: `Name of the AmiTest EKS Cluster`,
      parameterName: `/eks/ami-test-cluster/name`,
      stringValue: eksCluster.clusterName
    })

    new ssm.StringParameter(this, 'clusterArnParam', {
      description: `Arn of the AmiTest EKS Cluster`,
      parameterName: `/eks/ami-test-cluster/arn`,
      stringValue: eksCluster.clusterArn
    })

    new ssm.StringParameter(this, 'clusterCertParam', {
      description: `Cert Authority data of the AmiTest EKS Cluster`,
      parameterName: `/eks/ami-test-cluster/cert`,
      stringValue: eksCluster.clusterCertificateAuthorityData
    })

    new ssm.StringParameter(this, 'clusterEndpointaram', {
      description: `Endpoint of the AmiTest EKS Cluster`,
      parameterName: `/eks/ami-test-cluster/endpoint`,
      stringValue: eksCluster.clusterEndpoint
    })

    new ssm.StringParameter(this, 'clusterSgParam', {
      description: `Name of the AmiTest EKS Cluster`,
      parameterName: `/eks/ami-test-cluster/clusterSecurityGroup`,
      stringValue: eksClusterSecurityGroup.securityGroupId
    })

  }
}
