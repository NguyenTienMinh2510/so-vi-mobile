const fs = require('node:fs');
const path = require('node:path');
const { withXcodeProject, IOSConfig } = require('expo/config-plugins');

module.exports = config => withXcodeProject(config, config => {
  const project = config.modResults;
  const projectName = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
  const relativePath = `${projectName}/SoViImportIntent.swift`;
  fs.copyFileSync(path.join(__dirname, 'SoViImportIntent.swift'), path.join(config.modRequest.platformProjectRoot, relativePath));
  if (!project.hasFile(relativePath)) IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: relativePath, groupName: projectName, project });
  return config;
});
