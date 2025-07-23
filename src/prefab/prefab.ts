import fs from "fs";
import path from "path";

import { appNamespace, outDir, unityProjPath, usings } from "../config.js";
import { cleanName, createDir, findFiles } from "../index.js";
import { ScriptData } from "../processScript.js";
import { Component, ComponentType, componentTypeToMap, RawComponent } from "./components/baseComponent.js";
import { GameObjectComponent } from "./components/gameObjectComponent.js";
import { PrefabInstanceComponent } from "./components/prefabInstanceComponent.js";
import { RigidBodyComponent } from "./components/rigidBodyComponent.js";
import { SceneRootsComponent } from "./components/sceneRootsComponent.js";
import { MonoBehaviourComponent } from "./components/scriptComponent.js";
import { TransformComponent } from "./components/transformComponent.js";

function extractComponentChunks(content: string): RawComponent[] {
	content = content.replaceAll("\r", "");
	let curCompChunk: string | null = null;
	const componentChunks: string[] = [];

	const lines = content.split("\n");
	lines.forEach(line => {
		if (line.startsWith("--- !u!")) {
			if (curCompChunk) componentChunks.push(curCompChunk);
			curCompChunk = "";
		}

		if (curCompChunk !== null) curCompChunk += line + "\n";
	});

	if (curCompChunk) componentChunks.push(curCompChunk);

	return componentChunks
		.map(chunk => {
			// if (!chunk.match(/--- !u!(\d+) &(\d+)( stripped)?\n(\w+):/)) console.log({ chunk });
			const [_, type, id, stripped, name] = chunk.match(/--- !u!(\d+) &(\d+)( stripped)?\n(\w+):/);
			// if (stripped) {
			// 	console.log(`Skipping stripped component: ${name} (${id})`);
			// 	return;
			// }

			return {
				type: +type,
				id: id,
				name: name,
				stripped: stripped != undefined,
				content: chunk
			};
		})
		.filter(c => c !== undefined);
}

function findRootGameObject(components: Component[]): GameObjectComponent | SceneRootsComponent {
	const sceneRootComp = components.find(c => c.type == ComponentType.SceneRoots);
	if (sceneRootComp) {
		return sceneRootComp;
	}

	const gameObjects = components.filter(c => c.type == ComponentType.GameObject);
	const transforms = components.filter(c => c.type == ComponentType.Transform);

	const roots = gameObjects.filter(obj => {
		let refsToThis = 0;
		transforms.forEach(t => {
			// console.log(t);
			t.children.forEach(childId => {
				const child = transforms.find(c => c.id == childId);
				if (!child) {
					// console.log(`${obj} has transform ${t} which references child ${childId}`);
					// process.exit();
					return;
				}
				const childGo = gameObjects.find(go => go.id == child.gameObject);
				if (childGo == obj) refsToThis++;
			});
		});

		return refsToThis == 0;
	});

	if (roots.length != 1) {
		throw new Error(`Expected exactly one root GameObject, found ${roots.length}. Roots: ${roots.map(r => `Name: ${r.name}, ID: ${r.id}`).join(", ")}`);
	}

	return roots[0];
}

class Prefab {
	public name: string;
	public cleanName: string;
	public id: string;
	public root: GameObjectComponent | SceneRootsComponent;
	public components: Component[];
	public guid: string;
	public constructedScripts: ScriptData[] = [];

	constructor(guid: string) {
		this.guid = guid;
	}

	public setup(components: Component[]) {
		this.components = components;
		this.root = findRootGameObject(components);
		// console.log(`Located root:`, this.root);
		this.name = this.root.name;
		this.id = this.root.id;
		this.cleanName = cleanName(this.name) + "Prefab";
	}

	public getRequiredNamespaces(): string[] {
		const namespaces = new Set<string>();
		this.constructedScripts.forEach(script => {
			if (script.namespace) namespaces.add(script.namespace);
		});

		return [...namespaces];
	}

	public getComponent<T extends Component>(id: string, type: T["type"]): T;
	public getComponent(id: string): Component;
	public getComponent<T extends Component>(id: string, type: T["type"] = null): T {
		return this.components.find(c => c.id == id && (type === null || c.type == type)) as T;
	}
}
``;
function loadPrefab(prefabPath: string): Prefab;
function loadPrefab(prefabPath: string, isScene: boolean, sceneName: string): Prefab;
function loadPrefab(prefabPath: string, isScene = false, sceneName = ""): Prefab {
	// console.log(`Processing prefab: ${prefabPath}`);
	const content = fs.readFileSync(prefabPath, "utf-8");
	const metaFile = fs.readFileSync(prefabPath + ".meta", "utf-8");
	const guid = metaFile.match(/guid: (.*)/)[1];

	const componentChunks = extractComponentChunks(content);

	const componentTypeCtorMap: Record<ComponentType, new (prefab: Prefab) => Component> = {
		[ComponentType.GameObject]: GameObjectComponent,
		[ComponentType.Transform]: TransformComponent,
		[ComponentType.RectTransform]: TransformComponent,
		[ComponentType.MonoBehaviour]: MonoBehaviourComponent,
		[ComponentType.SceneRoots]: SceneRootsComponent,
		[ComponentType.PrefabInstance]: PrefabInstanceComponent,
		[ComponentType.RigidBody]: RigidBodyComponent
	};

	const prefab = new Prefab(guid);
	const components = componentChunks
		.map(chunk => {
			if (!componentTypeCtorMap[chunk.type]) return null;
			const ComponentClass = componentTypeCtorMap[chunk.type as ComponentType];
			const component = new ComponentClass(prefab);
			component.buildFromRaw(chunk);

			return component;
		})
		.filter(c => c !== null);

	if (isScene) {
		const roots = createSceneRoot(prefab, sceneName, components);
		// console.log({ prefabPath, root });
		components.push(roots.go, roots.tf);
	}

	prefab.setup(components);
	return prefab;
}

function createSceneRoot(prefab: Prefab, name: string, components: Component[]): { go: GameObjectComponent; tf: TransformComponent } {
	const root = new GameObjectComponent(prefab);
	root.name = name;
	root.id = (Math.random() * 1e9).toFixed(0);
	root.isActive = true;

	const sceneRootsComp = components.find(c => c.type == ComponentType.SceneRoots);
	sceneRootsComp.rootGameObject = root;
	sceneRootsComp.name = cleanName(name) + "Scene";

	const rootTf = new TransformComponent(prefab);
	rootTf.gameObject = root.id;
	rootTf.id = (Math.random() * 1e9).toFixed(0);
	rootTf.position = { x: 0, y: 0, z: 0 };
	rootTf.rotation = { x: 0, y: 0, z: 0, w: 1 };
	rootTf.scale = { x: 1, y: 1, z: 1 };
	rootTf.children = sceneRootsComp.children;

	root.children = [rootTf.id];

	return { go: root, tf: rootTf };
}

function getPrefabCodeFromTemplate(name: string, className: string, initCode: string, namespaces: string[]): string {
	initCode = initCode
		.split("\n")
		.map(l => `\t\t\t${l}`)
		.join("\n");

	const namespacesCode = namespaces.map(ns => `using ${ns};`).join("\n");

	const prefabClassTemplate = `
${usings.join("\n")}
using ${appNamespace};
using ${appNamespace}.ScriptableObjects;
${namespacesCode}

namespace ${appNamespace}.Prefabs
{
	public class %className% : Prefab
	{
		public static GameObject Create()
		{
%initCode%
		}

		public override GameObject CreateInstance() 
		{
			return Create();
		}
	}
}`;

	return prefabClassTemplate
		.replace(/%prefabName%/g, name)
		.replace(/%className%/g, className)
		.replace(/%initCode%/g, initCode);
}

function buildPrefabClass(className: string, prefab: Prefab): string {
	console.log(`Building prefab class for ${prefab.name} (${className})`);

	let initCode = `// Component initializations\n`;
	prefab.components.forEach(component => {
		initCode += component.getCtor() + "\n";
	});

	initCode += `\n// Component setups`;
	prefab.components.forEach(component => {
		const setupCode = component.getSetupCode();
		if (setupCode.trim().length == 0) return;

		initCode += `// Setup for ${ComponentType[component.type]} ${component.id}\n`;
		initCode += `${setupCode}\n\n`;
	});

	prefab.components.forEach(component => {
		// const dict = component.type == ComponentType.GameObject ? "gameObjectFileIdMap" : "componentFileIdMap";
		const dict = componentTypeToMap[component.type];
		initCode += `${prefab.root.getRef()}.${dict}[${component.id}] = ${component.getRef()};\n`;
	});

	initCode += `\nreturn ${prefab.root.getRef()};`;

	return getPrefabCodeFromTemplate(prefab.name, className, initCode, prefab.getRequiredNamespaces());
}

function loadPrefabs() {
	const prefabPaths = findFiles(unityProjPath + "/Assets/", ".prefab");
	const prefabs = prefabPaths.map(pf => loadPrefab(pf));
	console.log(`Loaded ${prefabs.length} prefabs`);

	return prefabs;
}

function loadScenePrefabs() {
	const scenePrefabs = findFiles(unityProjPath + "/Assets/", ".unity");
	const prefabs = scenePrefabs.map(pf => loadPrefab(pf, true, path.basename(pf, ".unity")));

	console.log(`Loaded ${prefabs.length} scene prefabs`);
	return prefabs;
}

function writePrefabs(prefabs: Prefab[]) {
	prefabs.forEach(prefab => {
		const outPath = path.join(outDir, "Prefabs", prefab.cleanName + ".cs");
		createDir(outPath);

		const prefabCode = buildPrefabClass(prefab.cleanName, prefab);

		fs.writeFileSync(outPath, prefabCode);
	});
}

export { Prefab, loadPrefabs, writePrefabs, loadScenePrefabs, extractComponentChunks };
