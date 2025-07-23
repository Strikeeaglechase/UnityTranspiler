import fs from "fs";
import path from "path";

import { outDir, unityProjPath, watch, watchDelay } from "./config.js";
import { loadPrefabs, loadScenePrefabs, Prefab, writePrefabs } from "./prefab/prefab.js";
import { processScript, ScriptData } from "./processScript.js";
import { loadScriptableObjects, ScriptableObject, writeScriptableObjects } from "./scriptableObjects.js";

export function findFiles(startPath: string, extension: string) {
	const scriptPaths: string[] = [];
	function findScriptsRec(dir: string) {
		const files = fs.readdirSync(dir);
		files.forEach(file => {
			if (file == "UnityOnly") return; // Do not enter UnityOnly folder

			const filePath = path.join(dir, file);
			if (fs.statSync(filePath).isDirectory()) findScriptsRec(filePath);
			else if (file.endsWith(extension)) scriptPaths.push(filePath);
		});
	}

	findScriptsRec(startPath);
	return scriptPaths;
}

export function createDir(filePath: string) {
	const parts = filePath.split(path.sep);
	let curDir = "";
	parts.forEach(part => {
		if (part.includes(".")) return;
		curDir += part + "/";
		if (!fs.existsSync(curDir)) {
			fs.mkdirSync(curDir);
		}
	});
}

export function cleanName(name: string) {
	name = name.replaceAll("-", "_").replaceAll(" ", "_");
	return name[0].toUpperCase() + name.slice(1);
}

export function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

export let scriptGuidsMap: Record<string, ScriptData> = {};
export let prefabFileIdMap: Record<string, Prefab> = {};
export let prefabGuidsMap: Record<string, Prefab> = {};
export let scriptableObjectGuidsMap: Record<string, ScriptableObject> = {};

function recursivelyCopyFiles(src: string, dest: string) {
	if (!fs.existsSync(dest)) {
		fs.mkdirSync(dest, { recursive: true });
	}

	const files = fs.readdirSync(src);
	files.forEach(file => {
		const srcPath = path.join(src, file);
		const destPath = path.join(dest, file);

		if (fs.statSync(srcPath).isDirectory()) {
			recursivelyCopyFiles(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	});
}

function transpile() {
	scriptGuidsMap = {};
	prefabFileIdMap = {};
	scriptableObjectGuidsMap = {};
	prefabGuidsMap = {};

	if (fs.existsSync(outDir)) {
		fs.rmSync(outDir, { recursive: true });
		fs.mkdirSync(outDir);
	}

	const scriptPaths = findFiles(unityProjPath + "/Assets/Scripts", ".cs");
	scriptPaths.forEach(f => {
		const script = processScript(f);
		if (!script) return;
		scriptGuidsMap[script.guid] = script;
	});
	console.log(`Loaded ${scriptPaths.length} scripts`);

	const scriptableObjects = loadScriptableObjects();
	const prefabs = loadPrefabs();

	scriptableObjects.forEach(so => (scriptableObjectGuidsMap[so.guid] = so));
	prefabs.forEach(pf => {
		prefabFileIdMap[pf.id] = pf;
		prefabGuidsMap[pf.guid] = pf;
	});

	writeScriptableObjects(scriptableObjects);
	writePrefabs(prefabs);

	const scenes = loadScenePrefabs();
	writePrefabs(scenes);

	recursivelyCopyFiles(unityProjPath + "/Assets/Resources", outDir + "/Resources");

	console.log(
		`Transpilation complete. ${scriptPaths.length} scripts, ${prefabs.length} prefabs, ${scriptableObjects.length} scriptable objects, ${scenes.length} scene prefabs.`
	);
}

transpile();

function setupWatch() {
	let watchTimer: NodeJS.Timeout;

	fs.watch(unityProjPath + "/Assets", { recursive: true }, evt => {
		if (watchTimer) clearTimeout(watchTimer);

		watchTimer = setTimeout(() => {
			console.log(`File change detected: ${evt}`);
			transpile();
			watchTimer = null;
		}, watchDelay);
	});
}

if (watch) setupWatch();
