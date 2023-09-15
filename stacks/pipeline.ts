import { StackContext, Stack } from "sst/constructs";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { CodeBuildAction, CodeStarConnectionsSourceAction, ManualApprovalAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Role } from "aws-cdk-lib/aws-iam";
import { PipelineProject, BuildSpec, Project, LinuxBuildImage } from "aws-cdk-lib/aws-codebuild";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Key } from "aws-cdk-lib/aws-kms";

export async function pipeline({ stack }: StackContext) {
  const stageRegion = "eu-west-1";
  const buildImage = LinuxBuildImage.STANDARD_7_0;  //puppeteer: "The chromium binary is not available for arm64."
  const sourceArtifact = new Artifact();
  const buildArtifact = new Artifact();
  const bucketName = `bucket-name`;


  const key = Key.fromKeyArn(stack, "key", "arn:aws:codebuild:us-east-1:1111:project/garbage");

  const bucket = Bucket.fromBucketAttributes(stack, "bucket", {
    bucketName,
    encryptionKey: key
  });
  
  const logGroup = LogGroup.fromLogGroupName(stack, "logGroup", "blah");
  const buildSpecBuildDeploy = BuildSpec.fromAsset("stacks/buildspecBuildDeploy.yml");
  const codePipelineRole =
    Role.fromRoleName(stack, "CodePipelineRole", "arn:aws:codebuild:us-east-1:1111:project/garbage");
  const codeBuildRole =
    Role.fromRoleName(stack, "CodeBuildRole", "arn:aws:codebuild:us-east-1:1111:project/garbage");
  const codeStarConnectionsSourceAction = new CodeStarConnectionsSourceAction({
    actionName: "Source",
    connectionArn: "arn:aws:codebuild:us-east-1:1111:project/garbage",
    repo: "repo",
    output: sourceArtifact,
    triggerOnPush: false,
    owner: "owner"
  });

  const project = "projectName";

    const codeBuildActionBuild = new CodeBuildAction({
      actionName: "BuildDeployDev",
      input: sourceArtifact,
      project: new PipelineProject(stack, `${project}PipelineProjectBuild`, {
        projectName: project,
        environment: {
          buildImage
        },
        buildSpec: buildSpecBuildDeploy,
        logging: {
          cloudWatch: {
            logGroup,
            prefix: `${project}CodeBuild`
          }
        },
        role: codeBuildRole
      }),
      outputs: [
        buildArtifact
      ],
      environmentVariables: {
        WORKSPACE: {
          value: project
        },
        EnvironmentName: {
          value: "dev"
        }
      }
    });
    const stageBuildDeploy = Project.fromProjectArn(stack, `${project}-stage-deploy`, "arn:aws:codebuild:eu-west-1:1111:project/otherRegion");
    const productionBuildDeploy = Project.fromProjectArn(stack, `${project}-production-deploy`, "arn:aws:codebuild:us-east-1:2222:project/otherAccount");
    const stageCodeBuildAction = new CodeBuildAction({
      actionName: "Deploy",
      input: sourceArtifact,
      environmentVariables: {
        EnvironmentName: {
          value: "staging2"
        },
        WORKSPACE: {
          value: codeBuildActionBuild.variable("WORKSPACE")
        }
      },
      project: stageBuildDeploy
    });

    new Pipeline(stack, project, {
      pipelineName: project,
      
      artifactBucket: bucket,
      role: codePipelineRole,
      // crossRegionReplicationBuckets: {
      //   //"us-east-1": bucket,
      //   stageRegion: bucketIreland
      // },
      stages: [
        {
          stageName: "Source",
          actions: [
            codeStarConnectionsSourceAction,
          ]
        },
        {
          stageName: "DeployToDevelopment",
          actions: [
            codeBuildActionBuild
          ]
        },
        {
          stageName: "PromoteToStage",
          actions: [
            new ManualApprovalAction({
              actionName: "PromoteToStage"
            })
          ]
        },
        {
          stageName: "DeployToStage",
          actions: [
            stageCodeBuildAction
          ]
        },
        {
          stageName: "PromoteToProduction",
          actions: [
            new ManualApprovalAction({
              actionName: "PromoteToProduction",
            })
          ]
        },
        {
          stageName: "DeployToProduction",
          actions: [
            new CodeBuildAction({
              actionName: "Deploy",
              input: sourceArtifact,
              environmentVariables: {
                EnvironmentName: {
                  value: "prod"
                },
                WORKSPACE: {
                  value: codeBuildActionBuild.variable("WORKSPACE")
                }
              },
              project: productionBuildDeploy
            })
          ]
        }
      ]
    });
}
