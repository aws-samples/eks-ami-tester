import cdk = require('@aws-cdk/core');
import ec2 = require('@aws-cdk/aws-ec2');
import iam = require('@aws-cdk/aws-iam')
import ssm = require('@aws-cdk/aws-ssm');
import eks = require('@aws-cdk/aws-eks');
import autoscaling = require("@aws-cdk/aws-autoscaling");
import {default as config } from '../config/config'

interface EksClusterWorkerNodesProps extends cdk.StackProps {
  deployGroupTag?: string;
  desiredCount?: number;
  ami_name?: string;
  kubelet_extra_args?: string;
}

export class EksClusterWorkerNodesCdkStack extends cdk.Stack {
  
  constructor(scope: cdk.App, id: string, props: EksClusterWorkerNodesProps) {
    super(scope, id, props );

    // Get Cluster VPC
    const eksClusterVpc = ec2.Vpc.fromLookup(this, "ClusterVpc", {
      vpcId: config.vpc_id
    });

    //Creating AutoScaling Group to host containers on EC2
    const workerNgAsg = new autoscaling.AutoScalingGroup(this, 'EksWorkerNodegroup', {
      vpc: eksClusterVpc,
      instanceType: new ec2.InstanceType('t3.medium'),
      machineImage: new ec2.LookupMachineImage({name: props.ami_name as string}),
      desiredCapacity: props.desiredCount,
      minCapacity: 0,
      maxCapacity: 5,
      role: iam.Role.fromRoleArn(this, 'workerNodeGroupRoleArn', 
        ssm.StringParameter.fromStringParameterName(
          this, 'workerNodeGroupRoleArnParam', '/eks/ami-test-cluster/workerNodeGroupRoleArn').stringValue
      ),
      updateType: autoscaling.UpdateType.ROLLING_UPDATE,
    })
    
    const eksClusterSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'clusterSecurityGroup',
      ssm.StringParameter.fromStringParameterName(
        this, 'clusterSecurityGroupId', '/eks/ami-test-cluster/clusterSecurityGroup').stringValue
    )

    workerNgAsg.connections.allowFrom(eksClusterSecurityGroup, ec2.Port.tcpRange(1025,65535));
    workerNgAsg.connections.allowFrom(eksClusterSecurityGroup, ec2.Port.tcp(443));
    workerNgAsg.connections.allowInternally(ec2.Port.allTraffic());

    const autoScalingGroupCfn = <autoscaling.CfnAutoScalingGroup> workerNgAsg.node.tryFindChild('ASG');
    if(props.kubelet_extra_args) {
      var kubeletExtraArg = props.kubelet_extra_args
    } 
    else {
        kubeletExtraArg = ""
    }
    
    workerNgAsg.addUserData(
      'set -o xtrace',
      'sudo yum install -y https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm',
      'sudo systemctl enable amazon-ssm-agent',
      'sudo systemctl start amazon-ssm-agent',
      `/etc/eks/bootstrap.sh ${config.cluster_name} --kubelet-extra-args "--node-labels lifecycle=OnDemand,DeployGroup=${props.deployGroupTag}  ${kubeletExtraArg}"`,
      `/opt/aws/bin/cfn-signal --exit-code $? --stack AmiTestEksCluster --resource ${autoScalingGroupCfn.logicalId} --region ca-central-1`
    )

    new cdk.CfnOutput(this, 'WorkerRoleArn', {
      value: workerNgAsg.role.roleArn
    });

    cdk.Tag.add(workerNgAsg, `kubernetes.io/cluster/${config.cluster_name}`, 'owned', {
      applyToLaunchedInstances: true,
    });
  }
}
