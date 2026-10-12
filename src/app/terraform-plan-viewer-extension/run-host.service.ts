import { Injectable } from '@angular/core';
import * as SDK from 'azure-devops-extension-sdk';
import { CommonServiceIds, ILocationService, IProjectPageService } from 'azure-devops-extension-api';
import { BuildServiceIds, IBuildPageDataService } from 'azure-devops-extension-api/Build';
import { ArtifactError, PlanArtifactReader, RunContext } from './plan-artifacts';

@Injectable({ providedIn: 'root' })
export class RunHostService {
  readonly artifacts = new PlanArtifactReader(() => SDK.getAccessToken());
  private initialized?: Promise<void>;

  async initialize(): Promise<void> {
    this.initialized ??= SDK.init({ loaded: false, applyTheme: true }).then(() => SDK.notifyLoadSucceeded());
    await this.initialized;
  }

  async currentRunId(): Promise<number | undefined> {
    const service = await SDK.getService<IBuildPageDataService>(BuildServiceIds.BuildPageDataService);
    return (await service.getBuildPageData())?.build?.id;
  }

  async context(signal: AbortSignal): Promise<RunContext> {
    await this.initialize();
    const projectService = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
    const pageService = await SDK.getService<IBuildPageDataService>(BuildServiceIds.BuildPageDataService);
    const location = await SDK.getService<ILocationService>(CommonServiceIds.LocationService);
    const project = await projectService.getProject();
    const page = await pageService.getBuildPageData();
    if (!project || !page?.build?.id) throw new ArtifactError('Open Terraform Plans from an Azure DevOps pipeline run to view its artifacts.');
    const context: RunContext = {
      collectionUrl: await location.getServiceLocation(), projectId: project.id, projectName: project.name,
      runId: page.build.id, runName: String(page.build.id), pipelineId: page.definition?.id
    };
    const build = await this.artifacts.json(context, `build/builds/${context.runId}`, {}, signal) as {
      buildNumber?: string; definition?: { id: number; name?: string }
    };
    context.runName = build.buildNumber ?? context.runName;
    context.pipelineId ??= build.definition?.id;
    return context;
  }
}
