import { Construct } from 'constructs';
import { NWResources } from './nw_resources';
import { DocDB } from './docdb';
import { TestDocDB } from './testDocDB';
import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';

export class AwsDocDbStack extends Stack {

  nwResources: NWResources
  docDB: DocDB
  testDocDB: TestDocDB

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);


      //  Set up a VPC, and EC2 for testing with DocumentDB
      this.nwResources = new NWResources(this, 'DocDBNetwork')
      const { vpc, DocDBSecGrp, ec2devmachine } = this.nwResources

      this.docDB = new DocDB(this, 'DocDBCluster', {
        vpc: vpc,
        docDBSecGrp: DocDBSecGrp 
      })
      const { docdbcluster } = this.docDB

      this.testDocDB = new TestDocDB(this, 'TestResources', {
        vpc: vpc,
        docdbcluster: docdbcluster
      })

      const { testAPI } = this.testDocDB

      new CfnOutput(this, 'VPC', { value: vpc.vpcArn });
      new CfnOutput(this, 'DocumentDB Security Group', { value: DocDBSecGrp.securityGroupId });
      new CfnOutput(this, 'EC2 Public IP', { value: ec2devmachine.instancePublicIp })
      new CfnOutput(this, 'DocumentDB Cluster Host', { value: docdbcluster.clusterEndpoint.hostname })
      new CfnOutput(this, 'Secret Manager ARN', { value: docdbcluster.secret?.secretFullArn as string })
      new CfnOutput(this, 'TestAPI Gateway Api Url', { value: testAPI.url })



  }
}
