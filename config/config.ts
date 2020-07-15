import configFile from "./project-config.json"

export interface ProjectConfig {
  "account_id": string,
  "region": string,
  "vpc_id" : string,
  "cluster_name": string,
  "eksadmin_user_name" : string,
  "office_eks_api_cidr": string,
  "default_worker_count" : number,
  "default_ami_name" : string,
  "test_ami_name" : string,
  "pipeline_approval_email": string,
  "next_version": string,
}

const config = <ProjectConfig>configFile
export default config