import fs from "fs";
import path from "path";

import { appNamespace, outDir, unityProjPath, usings } from "./config.js";
import { cleanName, createDir, findFiles, scriptGuidsMap } from "./index.js";
import { MonoBehaviourComponent } from "./prefab/components/scriptComponent.js";
import { extractComponentChunks } from "./prefab/prefab.js";

interface ScriptableObject {
	name: string;
	cleanName: string;
	guid: string;
	monoBehavior: MonoBehaviourComponent;
}

function loadScriptableObject(filePath: string) {
	const content = fs.readFileSync(filePath, "utf-8");
	// Check for monobehavior header
	const l3 = content.split("\n")[2];
	if (l3 != "--- !u!114 &11400000") return;

	const componentChunks = extractComponentChunks(content);
	if (componentChunks.length != 1) {
		console.log(`Asset has multiple components, skipping: ${filePath}`);
		return;
	}

	const monoBehavior = new MonoBehaviourComponent(null);
	monoBehavior.buildFromRaw(componentChunks[0]);

	const metaFile = fs.readFileSync(filePath + ".meta", "utf8");
	const guid = metaFile.match(/guid: (.+)/)[1];

	const obj: ScriptableObject = {
		name: monoBehavior.name,
		cleanName: cleanName(monoBehavior.name) + "SO",
		guid: guid,
		monoBehavior: monoBehavior
	};

	return obj;
}

function getSOCodeFromTemplate(className: string, baseClass: string, initCode: string): string {
	initCode = initCode
		.split("\n")
		.map(l => `\t\t\t${l}`)
		.join("\n");

	const prefabClassTemplate = `
${usings.join("\n")}
using ${appNamespace};
using ${appNamespace}.Prefabs;


namespace ${appNamespace}.ScriptableObjects
{
	public class %className% : %baseClass%
	{
		private static %baseClass% _instance;
		public static %baseClass% instance 
		{
			get {
				if (_instance == null) _instance = Create();
				return _instance;
			}
		}

		private static %baseClass% Create()
		{
%initCode%
		}
	}
}
	`;

	return prefabClassTemplate
		.replace(/%baseClass%/g, baseClass)
		.replace(/%className%/g, className)
		.replace(/%initCode%/g, initCode);
}

function buildSOClass(so: ScriptableObject) {
	console.log(`Building scriptable object class for ${so.cleanName} (${so.guid})`);

	const script = scriptGuidsMap[so.monoBehavior.scriptGuid];
	if (!script) {
		console.log(`Scriptable object ${so.cleanName} has no script`);
		return;
	}

	let initCode = ``;
	initCode += so.monoBehavior.getCtor() + "\n";
	initCode += so.monoBehavior.getSetupCode() + "\n";
	initCode += `\nreturn ${so.monoBehavior.getRef()};`;

	return getSOCodeFromTemplate(so.cleanName, script.name, initCode);
}

function loadScriptableObjects() {
	const scriptObjectPaths = findFiles(unityProjPath + "/Assets", ".asset");
	const scriptableObjects = scriptObjectPaths.map(path => loadScriptableObject(path)).filter(s => s != null);

	return scriptableObjects;
}

function writeScriptableObjects(scriptableObjects: ScriptableObject[]) {
	scriptableObjects.forEach(so => {
		const outPath = path.join(outDir, "ScriptableObjects", so.cleanName + ".cs");
		createDir(outPath);

		const soCode = buildSOClass(so);
		if (!soCode) return;
		fs.writeFileSync(outPath, soCode);
	});
}

export { loadScriptableObjects, writeScriptableObjects, ScriptableObject };
