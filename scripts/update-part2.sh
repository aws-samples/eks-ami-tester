#!/bin/bash
next_AMI=$( cat config/project-config.json | jq -r '.test_ami_name')
echo "Getting Parameters from ssm"
active_WorkerGroup=$(aws ssm get-parameter  --name "/eks/ami-test-cluster/active_WorkerGroup" --output text --query Parameter.Value) || exit 1
next_WorkerGroup=$(aws ssm get-parameter  --name "/eks/ami-test-cluster/next_WorkerGroup" --output text --query Parameter.Value) || exit 1

echo "Update: Resizing the Test DeployGroup to 0 and creating ${next_WorkerGroup} DeployGroup "
cdk deploy --require-approval never AmiTestEksClusterWorkersTest -c version=Test -c desiredCount=0 -c test=true|| exit 1
cdk deploy --require-approval never AmiTestEksClusterWorkers${next_WorkerGroup} -c version=${next_WorkerGroup} -c amiName=${next_AMI} || exit 1
for count in $(seq 10)
do
    test_Node_Status=$(kubectl get nodes -l DeployGroup=${next_WorkerGroup}|awk '{print $2}'| tail -1)
    echo ${test_Node_Status}
    if [[ ${test_Node_Status} != "Ready" ]]; then
        if [[ ${count} == 10 ]]; then echo "${next_WorkerGroup} NodeGroup status failed"; exit 1; fi
        echo "Waiting for ${next_WorkerGroup} to be Ready; Current status is  ${test_Node_Status}"
        sleep 20
    else 
        break
    fi
done
echo "Update: Cordon the ${active_WorkerGroup} DeployGroup and Migrate Pods to ${next_WorkerGroup} DeployGroup"
kubectl cordon -l DeployGroup=${active_WorkerGroup} || exit 1
kubectl drain -l DeployGroup=${active_WorkerGroup} --ignore-daemonsets --delete-local-data --grace-period=10  || exit 1

echo "Update: Resizing the ${active_WorkerGroup} DeployGroup to 0"
cdk deploy --require-approval never AmiTestEksClusterWorkers${active_WorkerGroup} -c version=${active_WorkerGroup} -c desiredCount=0 || exit 1
