#!/bin/bash
blue_STATUS=$(kubectl get nodes -l DeployGroup=Blue -o jsonpath={.items[].kind}  2> /dev/null)
green_STATUS=$(kubectl get nodes -l DeployGroup=Green -o jsonpath={.items[].kind}  2> /dev/null)
default_AMI=$( cat config/project-config.json | jq -r '.default_ami_name')
next_WorkerGroup=$( cat config/project-config.json | jq -r '.next_version')

if [[ ${next_WorkerGroup} == "Blue" ]];then
    active_WorkerGroup="Green"
fi
if [[ ${next_WorkerGroup} == "Green" ]];then
    active_WorkerGroup="Blue"
fi

if [[ ${blue_STATUS} == "Node" ]]; then
    DEPLOY_GROUP="Blue"
fi
if [[ ${green_STATUS} == "Node" ]]; then
    DEPLOY_GROUP="Green"
fi

echo "Blue: ${blue_STATUS} Green: ${green_STATUS}"


if [[ ${DEPLOY_GROUP} == ${next_WorkerGroup} ]]; then
    echo "No Changed Detected"
    echo "Change the next_WorkerGroup in cdk to start the next cycle or make sure only one DeployGroup is running"
    exit 1
fi

if [[ ${blue_STATUS} != "Node" && ${green_STATUS} != "Node" ]]; then
    echo "Deploying ${active_WorkerGroup} DeployGroup from scratch"
    cdk deploy --require-approval never AmiTestEksClusterWorkers${active_WorkerGroup} -c version=${active_WorkerGroup} || exit 1
    exit 0
fi

#Update Cluster
if [[ ${blue_STATUS} == "Node" && ${green_STATUS} != "Node" ]] || [[ ${blue_STATUS} != "Node" && ${green_STATUS} == "Node" ]]; then
    echo "Update: Deploying Test DeployGroup"
    cdk deploy --require-approval never AmiTestEksClusterWorkersTest -c version=Test -c test=true|| exit 1
 

    echo "Update: Deploying and Testing Pods in Test DeployGroup"
    kubectl apply -f scripts/nginx-deployment-testapp.yaml || exit 1
    sleep 60
    kubectl get deployment -l app=nginx-testapp

    for count in $(seq 10)
    do
        test_App_Status=$(kubectl get deployment -l app=nginx-testapp -o jsonpath={.items[].status.conditions[].status})
        echo ${test_App_Status}
        if [[ ${test_App_Status} != "True" ]]; then
            if [[ ${count} == 10 ]]; then echo "Testing of niginx-test failed; exiting"; exit 1; fi
            echo "Waiting for niginx-test to be healthy; Current status is  ${test_App_Status}"
            sleep 20
        else 
            break
        fi
    done
    kubectl delete -f scripts/nginx-deployment-testapp.yaml || exit 1

    echo "Adding parameters for next Stage"
    aws ssm put-parameter --name "/eks/ami-test-cluster/active_WorkerGroup" --value "${active_WorkerGroup}" --type String --overwrite || exit 1
    aws ssm put-parameter --name "/eks/ami-test-cluster/next_WorkerGroup" --value "${next_WorkerGroup}" --type String --overwrite || exit 1

fi

