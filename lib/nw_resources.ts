import { Construct } from "constructs";
import { NestedStack, NestedStackProps, RemovalPolicy } from "aws-cdk-lib";
import { Vpc, SecurityGroup, SubnetType, Peer, Port, AmazonLinuxImage, AmazonLinuxGeneration, Instance, InstanceType, InstanceClass, InstanceSize, InterfaceVpcEndpoint, InterfaceVpcEndpointAwsService, IpAddresses } from "aws-cdk-lib/aws-ec2";
import * as Config from "../config.json"
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";

export class NWResources extends NestedStack {
    vpc: Vpc
    DocDBSecGrp: SecurityGroup
    ec2devmachine: Instance

    constructor(scope: Construct, id: string, props?: NestedStackProps) {
        super(scope, id, props)

        this.vpc = new Vpc(this, 'DocDBVPC', {
            ipAddresses: IpAddresses.cidr(Config.vpc.cidrRange),
            vpcName: Config.vpc.vpcName,
            maxAzs: 2,
            enableDnsHostnames: true,
            enableDnsSupport: true,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: Config.vpc.publicSubnetName,
                    subnetType: SubnetType.PUBLIC
                },
                {
                    cidrMask: 24,
                    name: Config.vpc.isolatedSubnetName,
                    subnetType: SubnetType.PRIVATE_ISOLATED
                }
            ]
        })

        this.vpc.applyRemovalPolicy(RemovalPolicy.DESTROY)

        this.vpc.addInterfaceEndpoint('SecretManagerEndpoint', {
            service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
            subnets: { subnetType: SubnetType.PRIVATE_ISOLATED }
        })

        this.DocDBSecGrp = new SecurityGroup(this, 'DocDBSecGroup', {
            vpc: this.vpc,
            securityGroupName: Config.vpc.secGroupForDocDBSubnet
        })

        this.DocDBSecGrp.applyRemovalPolicy(RemovalPolicy.DESTROY)

        const publicSubnetSecGrp = new SecurityGroup(this, 'PublicSubnetSecGroup', {
            vpc: this.vpc,
            securityGroupName: Config.vpc.secGroupForPublicSubnet
        })

        this.vpc.publicSubnets.forEach((subnet, index) => {
            publicSubnetSecGrp.addIngressRule(Peer.anyIpv4(), Port.tcp(22))
            publicSubnetSecGrp.addIngressRule(Peer.anyIpv4(), Port.tcp(27017))
        })

        this.vpc.isolatedSubnets.forEach((subnet, index) => {
            this.DocDBSecGrp.addIngressRule(Peer.securityGroupId(publicSubnetSecGrp.securityGroupId), Port.tcp(27017))
            // this is required to ensure that the SM Endpoint is able to communicate with the Lambda
            this.DocDBSecGrp.addIngressRule(Peer.ipv4(subnet.ipv4CidrBlock), Port.tcp(443))
            // This rule is required so that when Lambda can have incoming traffic from anywhere in the subnet
            this.DocDBSecGrp.addIngressRule(Peer.ipv4(subnet.ipv4CidrBlock), Port.tcp(27017))
        })

        // Create a Dev EC2 instance to debug/manage the DocDB using mongo tools

        const ec2role = new Role(this, 'DevECRole', {
            assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
            roleName: Config.vpc.ec2RoleName
        })

        const linuxImage = new AmazonLinuxImage({
            generation: AmazonLinuxGeneration.AMAZON_LINUX_2
        })

        // const devInstance = new Instance(this, "DevEC2", {
        this.ec2devmachine = new Instance(this, "DevEC2", {
            instanceName: Config.vpc.ec2InstanceName,
            instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM),
            vpc: this.vpc,
            vpcSubnets: { subnetType: SubnetType.PUBLIC },
            associatePublicIpAddress: true,
            machineImage: linuxImage,
            keyName: Config.vpc.ec2KeyPairName,
            role: ec2role,
            securityGroup: publicSubnetSecGrp
        })
        // devInstance.applyRemovalPolicy(RemovalPolicy.DESTROY)
        this.ec2devmachine.applyRemovalPolicy(RemovalPolicy.DESTROY)

    }
}