import cdk = require('@aws-cdk/core');
import s3 = require('@aws-cdk/aws-s3');
import codecommit = require('@aws-cdk/aws-codecommit');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeactions = require('@aws-cdk/aws-codepipeline-actions');
import codebuild = require('@aws-cdk/aws-codebuild');
import iam = require('@aws-cdk/aws-iam');
import ssm = require('@aws-cdk/aws-ssm');
import sns = require('@aws-cdk/aws-sns');
import { ParameterType } from '@aws-cdk/aws-ssm';
import config from '../config/config';
import { AmazonLinuxEdition } from '@aws-cdk/aws-ec2';
import { Artifacts } from '@aws-cdk/aws-codebuild';




export class EksWorkerUpdatePipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const eksUpdatePipelineRepo = new codecommit.Repository(this, 'eksUpdatePipelineRepo', {
      repositoryName: "EksUpdatePipelineRepo",
      description: "Source Repositury for EKS Worker Update"
    })
    const eksUpdatePipelineArtifactBucket = new s3.Bucket(this, 'eksUpdatePipelineArtifactBucket', {
        versioned: false
      });

    
    const eksUpdateSnsApprovalTopic = new sns.Topic(this, 'eksUpdateSnsApprovalTopic');

    const workerCodeBuildRole = iam.Role.fromRoleArn(this, 'workerCodeBuildRoleArn', 
      ssm.StringParameter.fromStringParameterName(
        this, 'workerCodeBuildRoleArnParam', '/eks/ami-test-cluster/workerCodeBuildRoleArn').stringValue
    )

    const buildEksTest = new codebuild.Project(this, 'buildEksTest', {
      role: workerCodeBuildRole,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
                'echo "Install Dependencies"',
                'npm install -g typescript@2.7.2',
                'npm install -g aws-cdk@1.33.0',
                'curl -o kubectl https://amazon-eks.s3.us-west-2.amazonaws.com/1.15.10/2020-02-22/bin/linux/amd64/kubectl',
                'chmod +x ./kubectl',
                'mv ./kubectl /usr/local/bin/kubectl',
                'kubectl version --client',
                `aws eks update-kubeconfig --name  ${config.cluster_name} --region ${config.region}`
            ]
          },
          build: {
            commands: [
                'npm install',
                'npm run build',
                'cdk ls'
            ]
          },
          post_build: {
            commands: [
                "./scripts/update-part1.sh"
            ]
            
          }
        }
      })
    });

    const buildEksUpdate = new codebuild.Project(this, 'buildEksUpdate', {
      role: workerCodeBuildRole,
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
                'echo "Install Dependencies"',
                'npm install -g typescript@2.7.2',
                'npm install -g aws-cdk@1.33.0',
                'curl -o kubectl https://amazon-eks.s3.us-west-2.amazonaws.com/1.15.10/2020-02-22/bin/linux/amd64/kubectl',
                'chmod +x ./kubectl',
                'mv ./kubectl /usr/local/bin/kubectl',
                'kubectl version --client',
                `aws eks update-kubeconfig --name  ${config.cluster_name} --region ${config.region}`
            ]
          },
          build: {
            commands: [
              'npm install',
              'npm run build',
              'cdk ls'
          ]
          },
          post_build: {
            commands: [
                "./scripts/update-part2.sh"
            ]
          }
        }
      })
    });


    const sourceOutput = new codepipeline.Artifact();
    new codepipeline.Pipeline(this, 'EksUpdatePipeline', {
      pipelineName: 'EksUpdatePipeline',
      artifactBucket: eksUpdatePipelineArtifactBucket,
      stages: [ {
        stageName: "Source",
        actions : [
            new codepipeactions.CodeCommitSourceAction({
                actionName: 'CodeCommitSource',
                branch: 'master',
                output: sourceOutput,
                repository: eksUpdatePipelineRepo
              })
        ],
      },
      {
        stageName: "Test",
        actions : [
          new codepipeactions.CodeBuildAction({
            actionName: "TestNodeGroup",
            input: sourceOutput,
            project: buildEksTest,
            type: codepipeactions.CodeBuildActionType.BUILD,
          }),
        ],
      },
      {
        stageName: "Approve",
        actions : [
            new codepipeactions.ManualApprovalAction({
              actionName: "ApproveNodeUpdate",
              notificationTopic: eksUpdateSnsApprovalTopic,
              notifyEmails: [config.pipeline_approval_email]
            }),
        ],
      },
      {
        stageName: "Update",
        actions : [
          new codepipeactions.CodeBuildAction({
            actionName: "UpdateNodeGroup",
            input: sourceOutput,
            project: buildEksUpdate,
            type: codepipeactions.CodeBuildActionType.BUILD,
          }),
        ],
      },
      ]
    });
  }
}