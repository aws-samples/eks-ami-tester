#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { EksClusterCdkStack } from '../lib/eks-cluster-stack';
import { EksClusterIamCdkStack } from '../lib/eks-cluster-iam-stack';
import { EksClusterWorkerNodesCdkStack } from '../lib/eks-cluster-worker-stack';
import { EksWorkerUpdatePipelineStack } from '../lib/eks-worker-pipeline';
import {default as config } from '../config/config'


const app = new cdk.App();
const env = { account: config.account_id, region: config.region };

new EksClusterIamCdkStack(app, 'AmiTestEksClusterIam', { env });
new EksClusterCdkStack(app, 'AmiTestEksCluster', { env });
new EksWorkerUpdatePipelineStack(app, 'AmiTestEksWorkerPipeline', { env });


// let blueDesiredCount = app.node.tryGetContext('BlueDesiredCount')
// let greenDesiredCount = app.node.tryGetContext('GreenDesiredCount')

// const enableBlue = app.node.tryGetContext('EnableBlue');
// if (enableBlue == "true") {
//     new EksClusterWorkerNodesdkStack(app, 'AmiTestEksClusterWorkersBlue', { 
//         env: env,
//         deployGroupTag: "Blue",
//         desiredCount: (blueDesiredCount) ? blueDesiredCount : config.default_worker_count,
//         ami_name: config.blue_worker_ami_name
//     });
// }

// const enableGreen = app.node.tryGetContext('EnableGreen');
// if (enableGreen == "true") {
//     new EksClusterWorkerNodesdkStack(app, 'AmiTestEksClusterWorkersGreen', { 
//         env: env,
//         deployGroupTag: "Green",
//         desiredCount: (greenDesiredCount) ? greenDesiredCount : config.default_worker_count,
//         ami_name: config.green_worker_ami_name
//     });
// }

// kubelet_extra_args: "--register-with-taints=DeployGroup=Test:NoSchedule"

let version : string = app.node.tryGetContext('version') || "test"
let desiredCount = app.node.tryGetContext('desiredCount')
let test : string = app.node.tryGetContext('test') || "false"
let amiName = app.node.tryGetContext('amiName')

if ((test.toLowerCase() == "true") && (version.toLowerCase() == "test")) {
  new EksClusterWorkerNodesCdkStack(app, `AmiTestEksClusterWorkersTest`, { 
      env: env,
      deployGroupTag: "Test",
      desiredCount: (desiredCount) ? desiredCount : config.default_worker_count,
      ami_name: (amiName) ? amiName : config.test_ami_name,
      kubelet_extra_args: "--register-with-taints=DeployGroup=Test:NoSchedule"
  });
}
else if ((test.toLowerCase() != "true") && (version.toLowerCase() != "test")) {
  new EksClusterWorkerNodesCdkStack(app, `AmiTestEksClusterWorkers${version}`, { 
    env: env,
    deployGroupTag: version,
    desiredCount: (desiredCount) ? desiredCount : config.default_worker_count,
    ami_name: (amiName) ? amiName : config.default_ami_name,
  });
}
