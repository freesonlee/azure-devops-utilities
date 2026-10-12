# Test the extensions inside Azure DevOps

The two private development extensions use the same application code and permission scopes as the production extensions. They load their UI from HTTPS localhost and have separate identities, versions, and navigation labels.

| Extension | Marketplace identity | Azure DevOps navigation | Local URL |
| --- | --- | --- | --- |
| Variable Group History (Dev) | `FreesonLi.ads-var-history-dev` | Variable Groups (Dev) | `https://localhost:4300/` |
| Pipeline Profiles (Dev) | `FreesonLi.ads-pipeline-profiles-dev` | Pipeline Profiles (Dev) | `https://localhost:4301/` |

The publishing scripts share both privately with the test organization `https://dev.azure.com/FreesonLee`. The sharing target is set in `scripts/dev-extension.cjs`.

## Start the local apps

Install dependencies with `npm ci`, then run these commands in separate terminals:

```bash
npm run start-history-dev
npm run start-pipeline-dev
```

The start commands generate a self-signed localhost certificate with OpenSSL if `.certs/localhost.pem` and `.certs/localhost-key.pem` do not exist. They leave existing certificates intact. Certificate files and packaged artifacts are excluded from Git.

Before opening an extension, visit each local URL in the same browser you use for Azure DevOps and accept its development certificate if your browser permits that. If the browser blocks an untrusted certificate, use a trusted localhost certificate instead. With [mkcert](https://github.com/FiloSottile/mkcert) installed, you can create one:

```bash
mkcert -install
mkcert -cert-file .certs/localhost.pem -key-file .certs/localhost-key.pem localhost 127.0.0.1 ::1
```

`mkcert -install` adds a development certificate authority to your machine's trust store. Run it yourself if you choose this approach. Restart the local servers after replacing their certificate files.

The serve targets use the custom Webpack dev-server builder and the shared SDK module replacement in `webpack.config.js`; these ensure the application and REST clients use one SDK instance. The SDK initializes inside Azure DevOps. Opening the local URL directly is useful for checking HTTPS connectivity; full functionality needs the installed extension's Azure DevOps iframe. Localhost refers to the computer running your browser, so the dev server must run there or be reachable through local port forwarding. Browser prompts to allow local-network access must be accepted for these localhost development extensions.

## Package and publish privately

```bash
npm run pack-dev
```

This creates the two `.vsix` packages in `artifacts/dev/`. Packaging does not require an application build because the dev manifests serve the UI from localhost. Only extension metadata, icons, and Marketplace details are packaged.

You can upload these files manually at the [Marketplace publisher portal](https://marketplace.visualstudio.com/manage) under publisher `FreesonLi`: select **New extension > Azure DevOps**, upload the dev package, then share it with `FreesonLee`. The dev manifests set `public` to `false`.

For command-line publishing with Microsoft Entra, sign in to Azure CLI as the account that owns the publisher:

```bash
az login --use-device-code --allow-no-subscriptions
npm run publish-history-dev
npm run publish-pipeline-dev
```

Microsoft Entra is the default authentication method. The scripts obtain a short-lived Azure DevOps access token from Azure CLI for resource `499b84ac-1321-427f-aa17-267ca6975798`. They do not read `ADS_MKT_PAT` or fall back to a PAT. The token stays in memory and is redacted from CLI output. TFX accepts the Entra token through its `--auth-type pat` argument, as described in [Microsoft's publishing documentation](https://learn.microsoft.com/en-us/azure/devops/extend/publish/command-line?view=azure-devops). The signed-in user or service principal still needs permission on the Marketplace publisher. Use `AZURE_CONFIG_DIR` if you want a separate Azure CLI sign-in profile.

Alternatively, provide `ADS_MKT_PAT` through your shell or secret manager and run:

```bash
npm run publish-history-dev -- --auth pat
npm run publish-pipeline-dev -- --auth pat
```

These commands create the package, publish that exact artifact, and share it with `FreesonLee`. They validate the private dev identity and localhost URL before publishing. The PAT must include **Marketplace > Publish**, and its account must have permission to publish new extensions under `FreesonLi`. A `403 Forbidden` mentioning "Publish new extensions to an existing publisher" means the token scope or publisher permission needs correcting. Do not put the credential in a manifest or commit it to Git. See [Microsoft's command-line publishing prerequisites](https://learn.microsoft.com/en-us/azure/devops/extend/publish/command-line?view=azure-devops).

## Install and test

Install each shared dev extension into `FreesonLee` using its Marketplace page. An organization administrator can also run:

```bash
npm run install-history-dev
npm run install-pipeline-dev
```

These installation commands use your Azure CLI sign-in through Microsoft Entra by default. Both methods require extension-management permissions in the test organization. Publishing permission alone may not be enough to install.

In a project in `FreesonLee`, open **Pipelines**, then **Variable Groups (Dev)** or **Pipeline Profiles (Dev)**. Keep the corresponding local server running. Save source changes and refresh the extension to load them; no Marketplace upload is needed for ordinary UI/code changes.

Variable Group History needs a project variable group named `VariableGroupHistorySettings` with `Branch`, `Path`, and `Repository` variables pointing to an existing history repository. Configure test data there. Dev Pipeline Profiles uses its own extension ID for user storage, so its saved profiles are separate from the production extension. Both extensions still call real Azure DevOps APIs and can modify the selected project's variable groups, repository, work items, and pipeline runs according to their existing scopes.

When changing an extension's manifest, scopes, contribution metadata, or localhost port, increment the corresponding dev manifest's `version`, republish, and restart the server as needed. Dev versions start at `0.0.1` and are independent of production versions. Keep the dev scopes aligned with their production manifests.

Microsoft documents this workflow in [Debug your extension](https://learn.microsoft.com/en-us/azure/devops/extend/publish/overview?view=azure-devops#debug-your-extension).
