import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const unquote = (value: any) => String(value ?? '').replace(/^"|"$/g, '');
test('actual extension source references resolve through Xcode group ancestry to copied files', async () => {
  const require = createRequire(import.meta.url); const xcode = require('xcode'); const plugins = require('expo/config-plugins');
  const root = mkdtempSync(join(tmpdir(), 'sovi-extension-paths-')); const ios = join(root, 'ios'); const pbx = join(ios, 'SoVi.xcodeproj', 'project.pbxproj');
  mkdirSync(dirname(pbx), { recursive: true }); mkdirSync(join(ios, 'SoVi')); writeFileSync(join(ios, 'SoVi', 'AppDelegate.swift'), 'class AppDelegate {}');
  const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo; writeFileSync(join(root, 'app.json'), JSON.stringify({ expo: config }));
  const callbacks: any[] = []; const register = (value: any, callback: any) => { callbacks.push(callback); return value; };
  const modAPI = { ...plugins, withXcodeProject: register, withInfoPlist: (value: any) => value, withEntitlementsPlist: (value: any) => value };
  let project = xcode.project(pbx); const object: any = {};
  for (const section of ['PBXBuildFile', 'PBXFileReference', 'PBXGroup', 'PBXNativeTarget', 'PBXProject', 'PBXTargetDependency', 'PBXContainerItemProxy', 'PBXSourcesBuildPhase', 'PBXFrameworksBuildPhase', 'PBXResourcesBuildPhase', 'PBXCopyFilesBuildPhase', 'XCBuildConfiguration', 'XCConfigurationList']) object[section] = {};
  const group = 'A00000000000000000000001'; const projectID = 'A00000000000000000000002';
  object.PBXGroup[group] = { isa: 'PBXGroup', children: [], sourceTree: '"<group>"' };
  object.PBXProject[projectID] = { isa: 'PBXProject', attributes: {}, buildConfigurationList: 'A00000000000000000000003', compatibilityVersion: '"Xcode 14.0"', developmentRegion: 'en', hasScannedForEncodings: 0, knownRegions: ['en'], mainGroup: group, projectDirPath: '""', projectRoot: '""', targets: [] };
  object.XCConfigurationList.A00000000000000000000003 = { isa: 'XCConfigurationList', buildConfigurations: [], defaultConfigurationIsVisible: 0, defaultConfigurationName: 'Release' };
  project.hash = { project: { archiveVersion: 1, classes: {}, objectVersion: 56, objects: object, rootObject: projectID } };
  const main = project.addTarget('SoVi', 'application', 'SoVi', config.ios.bundleIdentifier);
  for (const [phase, name] of [['PBXSourcesBuildPhase', 'Sources'], ['PBXFrameworksBuildPhase', 'Frameworks'], ['PBXResourcesBuildPhase', 'Resources']]) project.addBuildPhase([], phase, name, main.uuid);
  const appGroup = project.addPbxGroup([], 'SoVi', 'SoVi'); project.addToPbxGroup(appGroup.uuid, group);
  writeFileSync(pbx, project.writeSync()); project = xcode.project(pbx); project.parseSync();
  const pluginPath = fileURLToPath(new URL('../plugins/with-so-vi-native.js', import.meta.url)); const pluginRequire = createRequire(pluginPath); const module = { exports: undefined as any };
  runInNewContext(readFileSync(pluginPath, 'utf8'), { module, exports: {}, __filename: pluginPath, __dirname: dirname(pluginPath), require: (name: string) => name === 'expo/config-plugins' ? modAPI : pluginRequire(name) });
  try {
    const apply = async () => { callbacks.length = 0; module.exports(config); for (const callback of callbacks) await callback({ ...config, modRequest: { projectRoot: root, platformProjectRoot: ios, platform: 'ios' }, modResults: project }); writeFileSync(pbx, project.writeSync()); project = xcode.project(pbx); project.parseSync(); };
    await apply(); let objects = project.hash.project.objects;
    const groups = () => Object.entries(objects.PBXGroup).filter(([, value]: any) => value?.isa === 'PBXGroup') as [string, any][];
    const resolveReference = (id: string, seen = new Set<string>()): string => {
      assert.ok(!seen.has(id), 'group ancestry cannot cycle'); seen.add(id);
      const item = objects.PBXFileReference[id] ?? objects.PBXGroup[id]; assert.ok(item, `missing reference ${id}`); const tree = unquote(item.sourceTree);
      if (tree === 'SOURCE_ROOT') return resolve(ios, unquote(item.path));
      if (tree === '<absolute>') return resolve(unquote(item.path));
      assert.equal(tree, '<group>', 'source paths use supported Xcode ancestry');
      const parents = groups().filter(([, parent]) => parent.children.some((child: any) => child.value === id));
      assert.equal(parents.length, id === group ? 0 : 1, 'each reference has exactly one owning group');
      return resolve(id === group ? ios : resolveReference(parents[0][0], seen), unquote(item.path));
    };
    const failures: string[] = [];
    const validate = (stage: string) => { const identities: any[] = []; for (const [name, expected] of [['SoViWidget', ['SoViWidget.swift']], ['SoViShare', ['SoViShareViewController.swift', 'NativeInboxQueue.swift', 'SharedInboxQueue.swift', 'VisionOCR.swift']]] as [string, string[]][]) {
      const targets = Object.values(objects.PBXNativeTarget).filter((target: any) => target?.isa === 'PBXNativeTarget' && unquote(target.name) === name) as any[]; assert.equal(targets.length, 1);
      const refs = targets[0].buildPhases.flatMap((phase: any) => (objects.PBXSourcesBuildPhase[phase.value]?.files ?? []).map((file: any) => objects.PBXBuildFile[file.value].fileRef));
      assert.equal(refs.length, expected.length, `${name} compiles every expected source once`);
      identities.push([Object.keys(objects.PBXNativeTarget).find(id => objects.PBXNativeTarget[id] === targets[0]), refs]);
      refs.forEach((ref: string, index: number) => { const actual = resolveReference(ref); const copied = resolve(ios, name, expected[index]); assert.ok(existsSync(copied) && statSync(copied).isFile(), `plugin copied ${copied}`); if (actual !== copied || !existsSync(actual) || !statSync(actual).isFile()) failures.push(`${stage} ${name}: ${actual} does not resolve to copied ${copied}`); });
    } return identities; };
    const first = validate('first prebuild');
    for (const name of ['SoViWidget', 'SoViShare']) { const matching = groups().filter(([, value]) => unquote(value.name) === name); assert.equal(matching.length, 1); matching[0][1].path = name; for (const child of matching[0][1].children) { const file = objects.PBXFileReference[child.value]; if (file) file.path = `${name}/${unquote(file.path).split('/').pop()}`; } }
    writeFileSync(pbx, project.writeSync()); project = xcode.project(pbx); project.parseSync();
    await apply(); objects = project.hash.project.objects; assert.deepEqual(validate('legacy retry'), first, 'retry preserves target IDs and ordered source references');
    assert.deepEqual(failures, [], 'Xcode must compile the actual copied extension files');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
