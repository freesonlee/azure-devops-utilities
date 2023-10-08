const webpack = require('webpack');
const path = require('path');

module.exports = {
  // Your other Webpack configuration settings...

  resolve : {

    alias: {
        "azure-devops-extension-sdk": path.resolve("node_modules/azure-devops-extension-sdk")
    },
  }

};
