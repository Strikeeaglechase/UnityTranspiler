import { prefabGuidsMap } from "../../index.js";
import { Prefab } from "../prefab.js";
import { getScriptTypeWithBase } from "../scriptTypeExtractor.js";
import { BaseComponent, ComponentType, componentTypeToMap, RawComponent } from "./baseComponent.js";
import { parseValue } from "./scriptComponent.js";

interface Modification {
	targetFileId: string;
	targetGuid: string;
	propertyPath: string;
	value: string;
	objectRef: string;
}

const modPathRewrites = {
	m_CenterOfMass: "centerOfMass",
	m_IsActive: "activeInHierarchy"
};

const typeFromModPath = {
	"m_IsActive": "bool",
	"m_CenterOfMass.x": "float",
	"m_CenterOfMass.y": "float",
	"m_CenterOfMass.z": "float"
};

function attemptParseValueWithoutType(value: string) {
	if (value.includes(".")) return `${value}f`;
	return value;
}

export class PrefabInstanceComponent extends BaseComponent {
	public type: ComponentType.PrefabInstance = ComponentType.PrefabInstance;
	public codeType: string = "GameObject";

	private modifications: Modification[] = [];
	private sourcePrefabRef: { fileId: string; guid: string };
	public sourcePrefab: Prefab;

	public buildFromRaw(raw: RawComponent): void {
		super.buildFromRaw(raw);

		const modificationsMatch = raw.content.matchAll(
			/- target: {fileID: (\d+), guid: (\w+), type: 3}\s+propertyPath: (.+)\s+value: (.+)\s+objectReference: {fileID: (\d+)}/g
		);
		this.modifications = [...modificationsMatch].map(mod => {
			return {
				targetFileId: mod[1],
				targetGuid: mod[2],
				propertyPath: mod[3],
				value: mod[4],
				objectRef: mod[5]
			};
		});

		const sourceMatch = raw.content.match(/m_SourcePrefab: {fileID: (\d+), guid: (\w+), type: 3}/);
		this.sourcePrefabRef = {
			fileId: sourceMatch[1],
			guid: sourceMatch[2]
		};

		this.sourcePrefab = prefabGuidsMap[this.sourcePrefabRef.guid];
	}

	public getRef(): string {
		return `pfInst${this.id}`;
	}

	public getCtor(): string {
		return `var ${this.getRef()} = ${this.sourcePrefab.cleanName}.Create();`;
	}

	private generateModificationCode(mod: Modification): string {
		const pathFrag = mod.propertyPath.split(".");
		// console.log(this.sourcePrefabRef);
		const prefab = prefabGuidsMap[this.sourcePrefabRef.guid];
		const targetComp = prefab.getComponent(mod.targetFileId);
		const dict = componentTypeToMap[targetComp.type];
		const targetRef = `((${targetComp.codeType})${this.getRef()}.${dict}[${mod.targetFileId}])`;

		switch (pathFrag[0]) {
			case "m_Name":
				return `${this.getRef()}.name = "${mod.value}";`;
			case "m_Enabled":
				return `${targetRef}.enabled = ${mod.value == "1"};`;
			case "m_LocalPosition": {
				const pos = `${targetRef}.localPosition`;
				const x = pathFrag[1] == "x" ? mod.value + "f" : `${pos}.x`;
				const y = pathFrag[1] == "y" ? mod.value + "f" : `${pos}.y`;
				const z = pathFrag[1] == "z" ? mod.value + "f" : `${pos}.z`;
				return `${pos} = new Vector3(${x}, ${y}, ${z});`;
			}
			case "m_LocalRotation": {
				const rot = `${targetRef}.localRotation`;
				const x = pathFrag[1] == "x" ? mod.value + "f" : `${rot}.x`;
				const y = pathFrag[1] == "y" ? mod.value + "f" : `${rot}.y`;
				const z = pathFrag[1] == "z" ? mod.value + "f" : `${rot}.z`;
				const w = pathFrag[1] == "w" ? mod.value + "f" : `${rot}.w`;
				return `${rot} = new Quaternion(${x}, ${y}, ${z}, ${w});`;
			}
			case "m_LocalEulerAnglesHint":
				return "";

			default:
				if (mod.objectRef != "0") {
					const objectRefComp = prefab.getComponent(mod.objectRef);
					return `${targetRef}.${mod.propertyPath} = ${objectRefComp.getRef()};`;
				} else {
					let modPath = mod.propertyPath;
					if (modPath.includes("Array.")) return "";

					pathFrag.forEach((frag, i) => {
						if (frag in modPathRewrites) {
							pathFrag[i] = modPathRewrites[frag];
						}
					});
					modPath = pathFrag.join(".");

					const inferredTypeFromPath = typeFromModPath[mod.propertyPath];
					let fallback = `${targetRef}.${modPath} = ${attemptParseValueWithoutType(mod.value)}; // No type information available`;
					if (inferredTypeFromPath) {
						fallback = `${targetRef}.${modPath} = ${parseValue(prefab, mod.value, inferredTypeFromPath)}; // Inferred ${inferredTypeFromPath} type`;
					}

					const typeData = getScriptTypeWithBase(targetComp.codeType);
					if (!typeData) return fallback + `, no type data found for ${targetComp.codeType}`;

					const propType = typeData.fields.find(f => f.name == modPath);
					if (!propType) return fallback + `, no property type found for ${modPath} in ${targetComp.codeType}`;

					return `${targetRef}.${modPath} = ${parseValue(prefab, mod.value, propType.type)}; // ${propType.type} type`;
				}
		}
	}

	public getSetupCode(): string {
		// console.log(this);
		const strippedTf = this.prefab.components.find(c => c.type == ComponentType.Transform && c.prefabInstance == this.id);
		const parent = this.prefab.components.find(
			c => c.type == ComponentType.Transform && (c.children.includes(strippedTf?.id) || c.children.includes(this.id))
		);
		let result = ``;
		if (parent) {
			console.log(`PrefabInstanceComponent ${this.id} has parent Transform ${parent.id}`);
			// console.log(strippedTf);
			const instRoot = this.sourcePrefab.root;
			const rootTf = this.sourcePrefab.components.find(c => c.type == ComponentType.Transform && c.gameObject == instRoot.id);

			result += `((Transform)${this.getRef()}.componentFileIdMap[${rootTf.id}]).parent = ${parent.getRef()};\n`;
		} else {
			console.log(`PrefabInstanceComponent ${this.id} has no parent Transform, this is likely an error.`);
			process.exit(1);
		}

		result += this.modifications.map(mod => this.generateModificationCode(mod)).join("\n");

		return result;
	}
}
