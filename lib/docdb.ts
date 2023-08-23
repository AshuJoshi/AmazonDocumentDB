import { Construct } from "constructs";
import { NestedStack, NestedStackProps, RemovalPolicy } from "aws-cdk-lib";
import { DatabaseCluster } from "aws-cdk-lib/aws-docdb";
import { Instance, InstanceClass, InstanceSize, InstanceType, SecurityGroup, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import * as Config from "../config.json"

interface DocDBStackProps extends NestedStackProps {
    vpc: Vpc
    docDBSecGrp: SecurityGroup
}

export class DocDB extends NestedStack {
    docdbcluster: DatabaseCluster

    constructor(scope: Construct, id: string, props: DocDBStackProps) {
        super(scope, id, props)
        this.docdbcluster = new DatabaseCluster(this, 'DocDB', {
            masterUser: {
                username: Config.DocDB.dbUserName
            },
            instances: 1,
            instanceType: InstanceType.of(InstanceClass.R5, InstanceSize.LARGE),
            vpc: props.vpc,
            vpcSubnets: {
                subnetType: SubnetType.PRIVATE_ISOLATED
            },
            securityGroup: props.docDBSecGrp
        })

        this.docdbcluster.applyRemovalPolicy(RemovalPolicy.DESTROY)

    }
}