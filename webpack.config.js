const path = require('path');
const webpack = require('webpack');

const sdk = path.resolve(__dirname, 'node_modules/azure-devops-extension-sdk/SDK.js');

module.exports = {
  resolve: {
    alias: { 'azure-devops-extension-sdk$': sdk },
  },
  plugins: [
    // Keep AMD API-client imports and application imports on the same SDK instance.
    new webpack.NormalModuleReplacementPlugin(/^azure-devops-extension-sdk$/, sdk),
  ],
};
