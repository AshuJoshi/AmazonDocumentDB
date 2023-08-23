import { Duration, NestedStack, NestedStackProps, RemovalPolicy } from "aws-cdk-lib";
import { SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { LambdaPowertoolsLayer } from 'cdk-aws-lambda-powertools-layer';
import { LayerVersion, Code, Runtime, Function, AssetCode, Tracing } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { DatabaseCluster } from "aws-cdk-lib/aws-docdb";
import { Cors, LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import * as Config from "../config.json"


interface TestDocDBStackProps extends NestedStackProps {
    vpc: Vpc
    docdbcluster: DatabaseCluster
}

export class TestDocDB extends NestedStack {
    testAPI: RestApi

    constructor(scope: Construct, id: string, props: TestDocDBStackProps) {
        super(scope, id, props)

        const powertoolsLayer = new LambdaPowertoolsLayer(this, 'PowerTools', {
            includeExtras: true
          });
      
          const pymnglayer = new LayerVersion(this, 'pymongopluspem', {
            code: Code.fromAsset('lambdalayers/pymng.zip'),
            compatibleRuntimes: [Runtime.PYTHON_3_9],
            description: 'PyMongo Package with PEM Key'
          })

          const docDBTestFunction = new Function(this, 'DocDBLambdaTestFunc', {
            code: new AssetCode('src'),
            handler: 'docdbtestfunc.handler',
            runtime: Runtime.PYTHON_3_9,
            logRetention: RetentionDays.ONE_DAY,
            timeout: Duration.seconds(300),
            layers: [powertoolsLayer, pymnglayer],
            environment: {
              CLUSTERSM: props.docdbcluster.secret?.secretFullArn as string,
              DOCDB_DATABASE: Config.DocDB.sampleDatabaseName,
              DOCDB_COLLECTION: Config.DocDB.sampleCollectionName
            },
            vpc: props.vpc,
            vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
            tracing: Tracing.ACTIVE
          })
      
          props.docdbcluster.secret?.grantRead(docDBTestFunction)

          this.testAPI = new RestApi(this, 'testAPI', {
            restApiName: "Test DocDB API",
            defaultCorsPreflightOptions: {
              allowOrigins: Cors.ALL_ORIGINS,
              allowMethods: Cors.ALL_METHODS
            },
            deployOptions: {
              tracingEnabled: true,
              dataTraceEnabled: true
            }      
          })
      
          const testCall = this.testAPI.root.addResource('test')
          const getId = testCall.addResource('{objectid}')
          const testCallIntegration = new LambdaIntegration(docDBTestFunction)
          getId.addMethod('GET', testCallIntegration)
          testCall.addMethod('POST', testCallIntegration)

    }
}