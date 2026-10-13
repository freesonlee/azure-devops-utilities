const domain = 'https://go.azuredevopshelpers.dev';
const extensions = {
  history: { manifest: 'variable-group-history.vss.json', id: 'ads-var-history', build: 'azure-devops-variable-group-history-extension' },
  pipeline: { manifest: 'pipeline-profiles.vss.json', id: 'ads-pipeline-profiles', build: 'azure-devops-pipeline-profiles' },
  terraform: { manifest: 'terraform-plan-viewer.vss.json', id: 'ads-terraform-plan-viewer', build: 'azure-devops-terraform-plan-viewer-extension' }
};
module.exports = { domain, extensions };
