import { ProfilePipeline } from './Profile';
import { ProfilePipeline as ExtensionProfilePipeline } from './pipeline-profiles/Profile';

for (const [name, Pipeline] of [['website', ProfilePipeline], ['extension', ExtensionProfilePipeline]] as const) {
  describe(`Pipeline resource build selection (${name})`, () => {
    const cases = [
      { selected: '', query: 'definitions=12&$top=1&branchName=refs/heads/default' },
      { selected: '<self>', query: 'definitions=12&$top=1&branchName=refs/heads/current' },
      { selected: 'release#approved', query: 'definitions=12&$top=1&branchName=refs/heads/release&tagFilters=approved' },
      { selected: '123', query: 'buildIds=123' },
      { selected: '"2026.11.03.1"', query: 'definitions=12&$top=1&buildNumber=2026.11.03.1' }
    ];

    for (const { selected, query } of cases) {
      it(`resolves ${selected || 'the default branch'} without changing the API query`, async () => {
        const pipeline = new Pipeline();
        pipeline.configurations.branch = 'current';
        const requests: string[] = [];
        await pipeline.resolveBuildNumber({ branch: 'default', pipeline: 'upstream', source: 'Build', tags: [], selectedBranch: selected, artifact: '' }, async url => {
          requests.push(url);
          return requests.length === 1 ? { value: [{ id: 12 }] } : {
            count: 1, value: [{ id: 123, buildNumber: '2026.11.03.1', definition: { id: 12 } }]
          };
        });
        expect(requests).toEqual(['/_apis/build/definitions?name=Build', `/_apis/build/builds?${query}`]);
        expect(pipeline.resolvedPipelineResources['upstream'].id).toBe(123);
      });
    }

    it('rejects an invalid selection before making an API request', async () => {
      const pipeline = new Pipeline();
      const request = jasmine.createSpy('request');
      await expectAsync(pipeline.resolveBuildNumber({ branch: 'default', pipeline: 'upstream', source: 'Build', tags: [], selectedBranch: '#invalid', artifact: '' }, request))
        .toBeRejectedWith('bad branch #invalid');
      expect(request).not.toHaveBeenCalled();
    });
  });
}
