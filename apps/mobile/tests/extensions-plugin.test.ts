import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const unquote = (value: any) => String(value ?? '').replace(/^"|"$/g, '');
test('actual extension plugin wires two independently identified embedded targets once and preserves the main app', async () => {
  const require = createRequire(import.meta.url); const xcode = require('xcode'); const plugins = require('expo/config-plugins'); const plist = require('plist');
  const root = mkdtempSync(join(tmpdir(), 'sovi-extension-plugin-')); const ios = join(root, 'ios'); const projectPath = join(ios, 'SoVi.xcodeproj', 'project.pbxproj'); mkdirSync(dirname(projectPath), { recursive: true }); mkdirSync(join(ios, 'SoVi'));
  const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo; const config: any = { ...app, ios: { ...app.ios, entitlements: { 'test.existing': true } } }; const callbacks: { kind: string; run: (config: any) => any }[] = [];
  const register = (kind: string) => (value: any, callback: any) => { callbacks.push({ kind, run: callback }); return value; };
  const fakeModAPI = { ...plugins, withXcodeProject: register('xcode'), withInfoPlist: register('info'), withEntitlementsPlist: register('entitlements'), withDangerousMod: (value: any, pair: any[]) => { callbacks.push({ kind: 'dangerous', run: pair[1] }); return value; } };
  const project = xcode.project(projectPath); const object: any = {};
  for (const section of ['PBXBuildFile', 'PBXFileReference', 'PBXGroup', 'PBXNativeTarget', 'PBXProject', 'PBXTargetDependency', 'PBXContainerItemProxy', 'PBXSourcesBuildPhase', 'PBXFrameworksBuildPhase', 'PBXResourcesBuildPhase', 'PBXCopyFilesBuildPhase', 'XCBuildConfiguration', 'XCConfigurationList']) object[section] = {};
  const group = 'A00000000000000000000001'; const projectID = 'A00000000000000000000002';
  object.PBXGroup[group] = { isa: 'PBXGroup', children: [], sourceTree: '"<group>"' }; object.PBXProject[projectID] = { isa: 'PBXProject', attributes: {}, buildConfigurationList: 'A00000000000000000000003', compatibilityVersion: '"Xcode 14.0"', developmentRegion: 'en', hasScannedForEncodings: 0, knownRegions: ['en'], mainGroup: group, projectDirPath: '""', projectRoot: '""', targets: [] };
  object.XCConfigurationList.A00000000000000000000003 = { isa: 'XCConfigurationList', buildConfigurations: [], defaultConfigurationIsVisible: 0, defaultConfigurationName: 'Release' };
  project.hash = { project: { archiveVersion: 1, classes: {}, objectVersion: 56, objects: object, rootObject: projectID } };
  const main = project.addTarget('SoVi', 'application', 'SoVi', config.ios.bundleIdentifier); project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', main.uuid); project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', main.uuid); project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', main.uuid);
  const appGroup = project.addPbxGroup([], 'SoVi', 'SoVi'); project.addToPbxGroup(appGroup.uuid, group); const originalSource = join(ios, 'SoVi', 'Existing.swift'); writeFileSync(originalSource, 'struct Existing {}'); project.addSourceFile('SoVi/Existing.swift', { target: main.uuid }, appGroup.uuid); writeFileSync(join(ios, 'SoVi', 'AppDelegate.swift'), 'class AppDelegate {}');
  writeFileSync(join(ios, 'SoVi', 'Info.plist'), plist.build({ CFBundleDisplayName: 'So Vi' })); writeFileSync(projectPath, project.writeSync()); writeFileSync(join(root, 'app.json'), JSON.stringify({ expo: config }));
  const module = { exports: undefined as any }; const pluginPath = fileURLToPath(new URL('../plugins/with-so-vi-native.js', import.meta.url)); const source = readFileSync(pluginPath, 'utf8'); const pluginRequire = createRequire(pluginPath);
  runInNewContext(source, { module, exports: {}, __filename: pluginPath, __dirname: dirname(pluginPath), require: (name: string) => name === 'expo/config-plugins' || name === '@expo/config-plugins' ? fakeModAPI : pluginRequire(name) });
  const info: any = { CFBundleDisplayName: 'So Vi' }; const entitlements: any = { 'test.existing': true };
  async function apply() { callbacks.length = 0; module.exports(config); for (const mod of callbacks) { const value = { ...config, modRequest: { projectRoot: root, platformProjectRoot: ios, platform: 'ios' }, modResults: mod.kind === 'xcode' ? project : mod.kind === 'info' ? info : mod.kind === 'entitlements' ? entitlements : {} }; const result = await mod.run(value); if (mod.kind === 'info') Object.assign(info, result.modResults); if (mod.kind === 'entitlements') Object.assign(entitlements, result.modResults); } }
  const entries = (section: string) => Object.entries(project.hash.project.objects[section] ?? {}).filter(([key, value]: any) => !key.endsWith('_comment') && typeof value === 'object') as [string, any][];
  const targets = () => entries('PBXNativeTarget');
  try {
    await apply(); const firstIDs = targets().map(([id]) => id).sort(); await apply(); assert.deepEqual(targets().map(([id]) => id).sort(), firstIDs, 'second prebuild does not duplicate targets');
    assert.equal(targets().length, 3); const mainTarget = targets().find(([id]) => id === main.uuid)![1]; assert.equal(unquote(mainTarget.productType), 'com.apple.product-type.application');
    const filesFor = (target: any) => target.buildPhases.flatMap((phase: any) => { const value = project.hash.project.objects.PBXSourcesBuildPhase[phase.value]; return (value?.files ?? []).map((file: any) => { const ref = project.hash.project.objects.PBXBuildFile[file.value].fileRef; return unquote(project.hash.project.objects.PBXFileReference[ref].path); }); });
    const mainFiles = filesFor(mainTarget); assert.equal(mainFiles.filter((path: string) => path.endsWith('Existing.swift')).length, 1); assert.equal(mainFiles.filter((path: string) => path.endsWith('SoViImportIntent.swift')).length, 1);
    for (const [name, suffix, extensionPoint] of [['SoViWidget', 'widget', 'com.apple.widgetkit-extension'], ['SoViShare', 'share', 'com.apple.share-services']]) {
      const matching = targets().filter(([, target]) => unquote(target.name) === name); assert.equal(matching.length, 1); const [id, target] = matching[0]; assert.equal(unquote(target.productType), 'com.apple.product-type.app-extension');
      const settings = project.hash.project.objects.XCConfigurationList[target.buildConfigurationList].buildConfigurations.map((item: any) => project.hash.project.objects.XCBuildConfiguration[item.value].buildSettings);
      for (const setting of settings) {
        assert.equal(unquote(setting.PRODUCT_BUNDLE_IDENTIFIER), `${config.ios.bundleIdentifier}.${suffix}`); assert.equal(unquote(setting.MARKETING_VERSION), config.version); assert.equal(unquote(setting.CURRENT_PROJECT_VERSION), config.ios.buildNumber); assert.equal(unquote(setting.SKIP_INSTALL), 'YES'); assert.equal(unquote(setting.APPLICATION_EXTENSION_API_ONLY), 'YES');
        const path = unquote(setting.INFOPLIST_FILE).replace(/^\$\(SRCROOT\)\//, ''); const properties = plist.parse(readFileSync(join(ios, path), 'utf8')); assert.equal(properties.NSExtension.NSExtensionPointIdentifier, extensionPoint);
        if (name === 'SoViShare') { assert.equal(properties.SoViBaseAppGroup, 'group.local.sovi.moneytracker'); assert.equal(properties.SoViParentBundleIdentifier, 'local.sovi.moneytracker'); }
        const entitlementFile = unquote(setting.CODE_SIGN_ENTITLEMENTS).replace(/^\$\(SRCROOT\)\//, ''); const entitlement = entitlementFile ? plist.parse(readFileSync(join(ios, entitlementFile), 'utf8')) : {};
        assert.deepEqual(entitlement['com.apple.security.application-groups'] ?? [], name === 'SoViShare' ? ['group.local.sovi.moneytracker'] : []);
        if (name === 'SoViShare') { const rule = properties.NSExtension.NSExtensionAttributes?.NSExtensionActivationRule; assert.ok(rule && rule !== 'TRUEPREDICATE', 'share accepts explicitly bounded supported types'); }
      }
      assert.ok(filesFor(target).length > 0, 'each target compiles its own source'); assert.ok(!filesFor(target).some((path: string) => /AppDelegate|SoViImportIntent|SoViNativeModule/.test(path)), 'extension does not compile app-only runtime sources');
      assert.equal(mainTarget.dependencies.filter((dependency: any) => project.hash.project.objects.PBXTargetDependency[dependency.value]?.target === id).length, 1);
      const embedded = mainTarget.buildPhases.flatMap((phase: any) => project.hash.project.objects.PBXCopyFilesBuildPhase[phase.value]?.files ?? []); assert.equal(embedded.filter((file: any) => project.hash.project.objects.PBXBuildFile[file.value].fileRef === target.productReference).length, 1);
    }
    assert.equal(info.CFBundleDisplayName, 'So Vi'); assert.equal(info.SoViBaseAppGroup, 'group.local.sovi.moneytracker'); assert.equal(info.SoViParentBundleIdentifier, 'local.sovi.moneytracker'); assert.equal(entitlements['test.existing'], true); assert.deepEqual(Array.from(entitlements['com.apple.security.application-groups']), ['group.local.sovi.moneytracker']);
    writeFileSync(projectPath, project.writeSync()); const reparsed = xcode.project(projectPath); reparsed.parseSync(); assert.equal(Object.values(reparsed.pbxNativeTargetSection()).filter((target: any) => target?.isa === 'PBXNativeTarget').length, 3, 'generated project is parseable');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
