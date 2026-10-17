const fs = require('node:fs');
const path = require('node:path');
const plist = require('plist');
const { withXcodeProject, withInfoPlist, withEntitlementsPlist, IOSConfig } = require('expo/config-plugins');
const baseGroup = 'group.local.sovi.moneytracker';
const parentIdentifier = 'local.sovi.moneytracker';
const unquote = value => String(value ?? '').replace(/^"|"$/g, '');

module.exports = config => {
  if (config.ios?.bundleIdentifier !== parentIdentifier) throw new Error('Sổ Ví bundle identity must stay local.sovi.moneytracker.');
  config = withInfoPlist(config, config => { config.modResults.SoViBaseAppGroup = baseGroup; config.modResults.SoViParentBundleIdentifier = parentIdentifier; return config; });
  config = withEntitlementsPlist(config, config => { config.modResults['com.apple.security.application-groups'] = [...new Set([...(config.modResults['com.apple.security.application-groups'] ?? []), baseGroup])]; return config; });
  return withXcodeProject(config, config => {
    const project = config.modResults;
    const projectName = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
    const ios = config.modRequest.platformProjectRoot;
    const intentPath = `${projectName}/SoViImportIntent.swift`;
    fs.copyFileSync(path.join(__dirname, 'SoViImportIntent.swift'), path.join(ios, intentPath));
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: intentPath, groupName: projectName, project });
    const nativeDirectory = path.resolve(__dirname, '../modules/so-vi-native/ios');
    const objects = project.hash.project.objects;
    for (const spec of [
      { name: 'SoViWidget', suffix: 'widget', display: 'So Vi Widget', point: 'com.apple.widgetkit-extension', minimum: '17.0', files: ['SoViWidget.swift'] },
      { name: 'SoViShare', suffix: 'share', display: 'Share to So Vi', point: 'com.apple.share-services', minimum: '16.4', files: ['SoViShareViewController.swift', 'NativeInboxQueue.swift', 'SharedInboxQueue.swift', 'VisionOCR.swift'] },
    ]) {
      const directory = path.join(ios, spec.name); fs.mkdirSync(directory, { recursive: true });
      for (const filename of spec.files) fs.copyFileSync(path.join(filename.startsWith('SoVi') ? __dirname : nativeDirectory, filename), path.join(directory, filename));
      const extension = { NSExtensionPointIdentifier: spec.point };
      if (spec.suffix === 'share') {
        extension.NSExtensionPrincipalClass = '$(PRODUCT_MODULE_NAME).SoViShareViewController';
        extension.NSExtensionAttributes = { NSExtensionActivationRule: { NSExtensionActivationSupportsText: true, NSExtensionActivationSupportsImageWithMaxCount: 1 } };
      }
      const info = { CFBundleDevelopmentRegion: 'vi', CFBundleDisplayName: spec.display, CFBundleExecutable: '$(EXECUTABLE_NAME)', CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)', CFBundleInfoDictionaryVersion: '6.0', CFBundleName: '$(PRODUCT_NAME)', CFBundlePackageType: 'XPC!', CFBundleShortVersionString: '$(MARKETING_VERSION)', CFBundleVersion: '$(CURRENT_PROJECT_VERSION)', NSExtension: extension };
      if (spec.suffix === 'share') { info.SoViBaseAppGroup = baseGroup; info.SoViParentBundleIdentifier = parentIdentifier; }
      fs.writeFileSync(path.join(directory, 'Info.plist'), plist.build(info));
      fs.writeFileSync(path.join(directory, `${spec.name}.entitlements`), plist.build(spec.suffix === 'share' ? { 'com.apple.security.application-groups': [baseGroup] } : {}));
      const matches = Object.entries(objects.PBXNativeTarget).filter(([key, target]) => !key.endsWith('_comment') && unquote(target.name) === spec.name);
      if (matches.length > 1) throw new Error(`Duplicate ${spec.name} target.`);
      let target;
      if (matches.length) { target = { uuid: matches[0][0], pbxNativeTarget: matches[0][1] }; }
      else {
        target = project.addTarget(spec.name, 'app_extension', spec.name, `${parentIdentifier}.${spec.suffix}`);
        project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
        project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
        project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
        const group = project.addPbxGroup([], spec.name); project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);
        for (const filename of spec.files) IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: `${spec.name}/${filename}`, groupName: spec.name, project, targetUuid: target.uuid });
      }
      const extensionGroups = Object.entries(objects.PBXGroup).filter(([key, group]) => !key.endsWith('_comment') && unquote(group.name) === spec.name);
      if (extensionGroups.length !== 1) throw new Error(`Missing or ambiguous ${spec.name} source group.`);
      const [groupID, extensionGroup] = extensionGroups[0];
      const owners = Object.entries(objects.PBXGroup).filter(([key, group]) => !key.endsWith('_comment') && group.children?.some(child => child.value === groupID));
      if (unquote(extensionGroup.sourceTree) !== '<group>' || owners.length !== 1 || owners[0][0] !== project.getFirstProject().firstProject.mainGroup || extensionGroup.children.length !== spec.files.length || extensionGroup.children.some((child, index) => unquote(objects.PBXFileReference[child.value]?.path) !== `${spec.name}/${spec.files[index]}`)) throw new Error(`Unexpected ${spec.name} source group layout.`);
      if (!['', spec.name].includes(unquote(extensionGroup.path))) throw new Error(`Unexpected ${spec.name} source group path.`);
      // Sources already include the extension directory; legacy groups must not add it again.
      delete extensionGroup.path;
      for (const configuration of objects.XCConfigurationList[target.pbxNativeTarget.buildConfigurationList].buildConfigurations) {
        const settings = objects.XCBuildConfiguration[configuration.value].buildSettings;
        if (settings.PRODUCT_BUNDLE_IDENTIFIER && unquote(settings.PRODUCT_BUNDLE_IDENTIFIER) !== `${parentIdentifier}.${spec.suffix}`) throw new Error(`${spec.name} bundle identity conflict.`);
        Object.assign(settings, { PRODUCT_BUNDLE_IDENTIFIER: `"${parentIdentifier}.${spec.suffix}"`, PRODUCT_NAME: `"${spec.name}"`, INFOPLIST_FILE: `"${spec.name}/Info.plist"`, CODE_SIGN_ENTITLEMENTS: `"${spec.name}/${spec.name}.entitlements"`, MARKETING_VERSION: `"${config.version}"`, CURRENT_PROJECT_VERSION: `"${config.ios.buildNumber}"`, SKIP_INSTALL: 'YES', APPLICATION_EXTENSION_API_ONLY: 'YES', SWIFT_VERSION: '5.0', IPHONEOS_DEPLOYMENT_TARGET: spec.minimum, TARGETED_DEVICE_FAMILY: '1', GENERATE_INFOPLIST_FILE: 'NO', CLANG_ENABLE_MODULES: 'YES', LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"' });
      }
    }
    return config;
  });
};
